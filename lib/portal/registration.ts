import { cvReviewReasons } from "../cv-quality";
import { validateContact, validateHiringNeed } from "../intake-security";
// Public registration is one transaction: identity, profile, intake and consent
// either all exist together or none do. Email delivery happens after commit.
import { hashPassword, passwordProblem } from "../platform/crypto";
import { analyseCvWithText, CvReadError } from "../ats/pipeline";
import { enrichProfile } from "./profile";
import { minhash, normEmail, normPhone } from "./candidate";
import { noticeHash } from "./consent";
import { WEBSITE_FORM, WEBSITE_FORM_VERSION, websiteNoticeVersion } from "./notice";
import { CANDIDATE_TERMS_VERSION, EMPLOYER_TERMS_VERSION } from "../terms";
import { cleanAttribution } from "../attribution";
import { callSlots } from "../public-forms";
import { enqueue } from "./company";
import { FEE } from "./policy";
import { newId, now, nowIso, PortalError, sha256Hex, type Db, type Stmt } from "./db";

export type RegistrationBucket = { put(key: string, bytes: Uint8Array, options?: unknown): Promise<unknown>; delete(key: string): Promise<unknown> };
// Identifiers below are code-owned, never submitted by the visitor.
function insert(db: Db, table: string, values: Record<string, unknown>): Stmt {
  return db.prepare(`INSERT INTO ${table} (${Object.keys(values).join(",")}) VALUES (${Object.keys(values).map(() => "?").join(",")})`).bind(...Object.values(values));
}

export async function registerPublic(db: Db, bucket: RegistrationBucket | null, form: FormData, ip: string) {
  const get = (key: string, max = 200) => String(form.get(key) ?? "").trim().slice(0, max);
  const kind = get("kind");
  if (kind !== "candidate" && kind !== "company") throw new PortalError("KIND", "Choose candidate or business registration.");
  const candidate = kind === "candidate", email = get("email", 254).toLowerCase(), phone = get("phone", 30);
  const name = get(candidate ? "fullName" : "contactName", 120), password = String(form.get("password") ?? "");
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || phone.replace(/\D/g, "").length < 7) throw new PortalError("DETAILS", "Enter your name, email and phone number.");
  if (form.get("consent") !== "yes" || form.get(candidate ? "declaration" : "terms") !== "yes") throw new PortalError("CONSENT", "Tick the two required consent and terms boxes.");
  validateContact(name, email, phone);
  if (!candidate) validateHiringNeed(get("company", 160), get("details", 1800));
  const problem = passwordProblem(password, email);
  if (problem) throw new PortalError("PASSWORD", problem);
  const whatsapp = form.get("whatsappConsent") === "yes";
  if (whatsapp && phone.replace(/\D/g, "").length < 10) throw new PortalError("PHONE", "Enter your full mobile number for WhatsApp, or untick that option.");
  if (await db.prepare("SELECT id FROM portal_accounts WHERE email = ?").bind(email).first()) throw new PortalError("ACCOUNT_EXISTS", "If you have registered before, sign in or recover account access. Existing account details have not been changed.", 409);
  const accountId = newId(), entityId = newId(), intakeId = newId(), at = nowIso();
  const statements: Stmt[] = [insert(db, "portal_accounts", { id: accountId, kind: candidate ? "candidate" : "company_user", email, phone, password_hash: await hashPassword(password), status: "pending", created_at: at })];
  const attribution = cleanAttribution(key => form.get(key));
  let storage: { key: string; bytes: Uint8Array; type: string } | null = null;
  if (candidate) {
    const file = form.get("resume");
    if (!(file instanceof File) || !file.size) throw new PortalError("CV", "Attach your CV as a PDF or DOCX file.");
    if (file.size > 5 * 1024 * 1024) throw new PortalError("CV_SIZE", "The CV exceeds the 5 MB limit.", 413);
    if (!bucket) throw new PortalError("STORAGE", "CV storage is unavailable. Please try again later.", 503);
    const bytes = new Uint8Array(await file.arrayBuffer()), fileName = file.name.replace(/[\\/\r\n\0]/g, "_").slice(0, 140);
    let analysed;
    try { analysed = await analyseCvWithText({ bytes, fileName, knownName: name, now: now() }); }
    catch (error) { throw new PortalError("CV", error instanceof CvReadError ? error.message : "The CV could not be read. Upload a valid PDF or DOCX."); }
    const profile = enrichProfile(analysed.profile, analysed.text, now());
    const review = cvReviewReasons(profile, analysed.text, email);
    const duplicates = (await db.prepare("SELECT DISTINCT c.id FROM cvs v JOIN candidates c ON c.id = v.candidate_id WHERE v.sha256 = ? AND c.status NOT IN ('deleted','merged') LIMIT 10").bind(profile.source.sha256).all<{ id: string }>()).results;
    if (duplicates.length) review.push("The same CV file appears under another candidate: check ownership before sharing.");
    profile.parse.warnings.push(...review);
    const parseStatus = !review.length && profile.parse.confidence >= .5 ? "parsed" : "needs_review";
    for (const duplicate of duplicates) {
      const [a, b] = [duplicate.id, entityId].sort();
      statements.push(insert(db, "duplicate_flags", { id: newId(), kind: "cv", a_id: a, b_id: b, signal: "same_file", status: "open", created_at: at }));
    }
    const cvId = newId(), key = `portal-cv/${entityId}/${cvId}`, location = get("location", 100);
    const type = analysed.fileType === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    storage = { key, bytes, type };
    const share = form.get("shareConsent") === "yes";
    statements.push(
      insert(db, "candidates", { id: entityId, account_id: accountId, display_name: name, email, phone, preferred_cities: JSON.stringify(location ? [location] : []), dedupe_email_hash: await sha256Hex(normEmail(email)), dedupe_phone_hash: normPhone(phone).length === 10 ? await sha256Hex(normPhone(phone)) : "", status: parseStatus === "parsed" ? "active" : "review", whatsapp_consent_at: whatsapp ? at : null, whatsapp_consent_version: whatsapp ? `${websiteNoticeVersion(WEBSITE_FORM_VERSION)}: ${WEBSITE_FORM.whatsapp}` : "", last_active_at: at, created_at: at }),
      insert(db, "applications", { id: intakeId, full_name: name, email, phone, location, experience: "", recruiter_notes: review.join("\n"), resume_key: key, resume_name: fileName, resume_type: type, resume_size: file.size, consent: 1, share_consent: +share, future_consent: 1, whatsapp_consent: +whatsapp, ...attribution, terms_version: CANDIDATE_TERMS_VERSION, privacy_version: WEBSITE_FORM_VERSION, consent_at: at, updated_at: at }),
      insert(db, "candidate_sources", { id: newId(), candidate_id: entityId, kind: "website_application", ref_id: intakeId, created_at: at }),
      insert(db, "cvs", { id: cvId, candidate_id: entityId, r2_key: key, file_name: fileName, file_type: analysed.fileType, size: file.size, sha256: profile.source.sha256, text_fingerprint: minhash(analysed.text), parse_status: parseStatus, parse_confidence: profile.parse.confidence, is_primary: 1, created_at: at }),
      insert(db, "cv_profiles", { cv_id: cvId, version: 1, data: JSON.stringify(profile), source: "parser", created_at: at }),
    );
    statements.push(enqueue(db, "candidate", entityId, "registration"));
    for (const purpose of ["profile_processing", ...(share ? ["recruiter_sharing"] : [])] as ("profile_processing" | "recruiter_sharing")[]) {
      const notice = { version: websiteNoticeVersion(WEBSITE_FORM_VERSION), text: purpose === "profile_processing" ? WEBSITE_FORM.dataGeneral : WEBSITE_FORM.shareGeneral };
      statements.push(insert(db, "candidate_consents", { id: newId(), candidate_id: entityId, purpose, action: "granted", notice_version: notice.version, notice_hash: await noticeHash(purpose, notice), channel: "website", ip_hash: ip, at }));
    }
  } else {
    const company = get("company", 160), legalName = get("legalName", 160), details = get("details", 1800), meetingAt = get("meetingAt", 40) || null;
    if (!company || !legalName || !details) throw new PortalError("COMPANY", "Enter the company name, registered legal name and hiring requirements.");
    if (meetingAt && (!callSlots().includes(meetingAt) || await db.prepare("SELECT id FROM employer_enquiries WHERE meeting_at = ? AND meeting_status IN ('requested','confirmed')").bind(meetingAt).first())) throw new PortalError("MEETING", "That meeting time is no longer available. Choose another time.", 409);
    statements.push(
      insert(db, "companies", { id: entityId, legal_name: legalName, display_name: company, status: "applied", guarantee_days: FEE.guaranteeDays, fee_percent: FEE.defaultPct, created_at: at }),
      insert(db, "company_users", { id: newId(), company_id: entityId, account_id: accountId, role: "owner", created_at: at }),
      insert(db, "employer_enquiries", { id: intakeId, company_id: entityId, contact_name: name, company, email, phone, role_title: "", location: "", details, consent: 1, whatsapp_consent: +whatsapp, ...attribution, meeting_at: meetingAt, meeting_status: meetingAt ? "requested" : "none", privacy_version: WEBSITE_FORM_VERSION, terms_version: EMPLOYER_TERMS_VERSION, consent_at: at, updated_at: at }),
    );
  }
  statements.push(insert(db, "audit_events", { id: newId(), actor_id: accountId, action: "portal.registered", target_type: kind, target_id: entityId, detail: "Unified public registration" }));
  if (storage) await bucket!.put(storage.key, storage.bytes, { httpMetadata: { contentType: storage.type, cacheControl: "private, no-store" } });
  try { await db.batch(statements); }
  catch (error) {
    if (storage) await bucket!.delete(storage.key);
    const message = String(error);
    if (/UNIQUE.*portal_accounts.email/i.test(message)) throw new PortalError("ACCOUNT_EXISTS", "Please sign in or recover account access. Existing account details have not been changed.", 409);
    if (/UNIQUE.*employer_enquiries.meeting_at/i.test(message)) throw new PortalError("MEETING", "That meeting time was just taken. Choose another time.", 409);
    throw error;
  }
  return { accountId, entityId, email, kind, reference: `${candidate ? "JP" : "HE"}-${intakeId.slice(0, 13).replaceAll("-", "").toUpperCase()}` };
}
