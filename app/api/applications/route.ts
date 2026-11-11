import { analyseCvWithText, CvReadError } from "@/lib/ats/pipeline";
import { readLimitedForm, validateContact, limitContact } from "@/lib/intake-security";
import { PortalError } from "@/lib/portal/db";
import { CANDIDATE_TERMS_VERSION } from "@/lib/terms";
import { DEMO_MODE, demoSubmissionResponse } from "@/lib/demo";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { applications } from "@/db/schema";
import { clean, errorJson, isJobOpen, json, limitSubmission, sameOrigin, validEmail } from "@/lib/http";
import { and, eq, gt, isNull } from "drizzle-orm";
import { portalDb } from "@/lib/portal/session";
import { linkWebsiteApplication } from "@/lib/portal/website";
import { applicationAckText, confirmation, sendApplicationAck } from "@/lib/public-forms";
import { resolveSender } from "@/lib/portal/notify";
import { drainQueue } from "@/lib/portal/queue";
import { cleanAttribution } from "@/lib/attribution";
import { portalSecret } from "@/lib/portal/session";
import { WEBSITE_FORM, WEBSITE_FORM_VERSION } from "@/lib/portal/notice";

export const runtime = "edge";
export const dynamic = "force-dynamic";
const maxResumeBytes = 5 * 1024 * 1024;
/** True when the database refused a column it does not have yet (code deployed before its migration). */
const missingColumn = (error: unknown) => /no such column|has no column named/i.test(`${(error as Error)?.message ?? error} ${String((error as { cause?: unknown })?.cause ?? "")}`);

export async function POST(request: Request) {
  if (DEMO_MODE) return demoSubmissionResponse();
  try {
    if (!sameOrigin(request)) return errorJson("Cross-site submissions are not accepted.", 403);
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > maxResumeBytes + 40_000) return errorJson("The upload exceeds the 5 MB limit.", 413);
    if (!await limitSubmission(request, "application")) return errorJson("Too many requests. Please try again later.", 429);
    const form = await readLimitedForm(request, 5 * 1024 * 1024 + 40000);
    if (clean(form.get("website"), 200)) return json({ message: "Thank you. Your details have been received." }, 201);
    const fullName = clean(form.get("fullName"), 120), email = clean(form.get("email"), 254).toLowerCase();
    const phone = clean(form.get("phone"), 30), location = clean(form.get("location"), 100);
    const experience = clean(form.get("experience"), 1200), message = clean(form.get("message"), 1200);
    const desiredRole = clean(form.get("desiredRole"), 160), skills = clean(form.get("skills"), 500);
    const education = clean(form.get("education"), 160), availability = clean(form.get("availability"), 100);
    const jobId = clean(form.get("jobId"), 60) || null;
    const shareConsent = form.get("shareConsent") === "yes", whatsappConsent = form.get("whatsappConsent") === "yes";
    // Registering a CV without a role is the request to be matched and contacted (that is the consent sentence on that form).
    const futureConsent = !jobId || form.get("futureConsent") === "yes";
    // Two required ticks, kept apart: a declaration (18 or older, terms for job seekers) and the consent to use the data.
    // A page opened before this change still sends the three earlier ticks.
    const agreed = form.get("consent") === "yes" && (form.get("declaration") === "yes" || (form.get("adult") === "yes" && form.get("terms") === "yes"));
    // The CV carries the experience, skills and education; the form asks only for who the person is and how to reach them.
    if (!fullName || !validEmail(email) || phone.replace(/\D/g, "").length < 7 || !agreed) return errorJson("Please give your name, email and phone number, and tick the two required boxes.");
    validateContact(fullName, email, phone);
    await limitContact(portalDb(), email, phone);
    // WhatsApp needs a number it can reach: ten digits, or a number with its country code.
    if (whatsappConsent && phone.replace(/\D/g, "").length < 10) return errorJson("To get WhatsApp updates, enter your full mobile number (10 digits, or with the country code), or untick the WhatsApp box.");
    if (jobId && !await isJobOpen(jobId)) return errorJson("This role is no longer accepting applications.", 410);
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);
    const db = getDb();
    const [recent] = await db.select({ id: applications.id }).from(applications).where(and(eq(applications.email, email), jobId ? eq(applications.jobId, jobId) : isNull(applications.jobId), gt(applications.createdAt, cutoff))).limit(1);
    if (recent) return errorJson("We received a recent submission using this email for this role. Your earlier CV has not been replaced. To request a correction or CV replacement, use the privacy request form; a recruiter will verify your identity.", 409);
    // A CV is mandatory: recruiters screen every application against the role from the CV itself.
    const file = form.get("resume");
    if (!(file instanceof File) || !file.size) return errorJson("Please attach your CV as a PDF or DOCX file.");
    let cvBytes: Uint8Array | null = null;
    let resumeKey: string | null = null, resumeName: string | null = null, resumeType: string | null = null, resumeSize: number | null = null;
    {
      if (file.size > maxResumeBytes) return errorJson("The upload exceeds the 5 MB limit.", 413);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const type = file.type;
      const pdf = type === "application/pdf" && file.name.toLowerCase().endsWith(".pdf") && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-" && new TextDecoder().decode(bytes.slice(-2048)).includes("%%EOF");
      const docx = type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && file.name.toLowerCase().endsWith(".docx") && bytes[0] === 0x50 && bytes[1] === 0x4b && new TextDecoder().decode(bytes).includes("[Content_Types].xml");
      if (!pdf && !docx) return errorJson("Upload a valid PDF or DOCX file.");
      try { await analyseCvWithText({ bytes, fileName: file.name }); } catch (error) { return errorJson(error instanceof CvReadError ? error.message : "Upload a readable PDF or DOCX CV.", 422); }
      if (!env.BUCKET) return errorJson("CV storage is not ready. Please try again later.", 503);
      resumeKey = `resumes/${crypto.randomUUID()}`; resumeName = file.name.replace(/[\\/\r\n\0]/g, "_").slice(0, 140); resumeType = type; resumeSize = file.size;
      await env.BUCKET.put(resumeKey, bytes, { httpMetadata: { contentType: type, cacheControl: "private, no-store" } });
      cvBytes = bytes;
    }
    const id = crypto.randomUUID();
    const save = () => db.insert(applications).values({ id, jobId, fullName, email, phone, location, experience, desiredRole, skills, education, availability, message, resumeKey, resumeName, resumeType, resumeSize, consent: true, shareConsent, futureConsent, whatsappConsent, ...cleanAttribution(name => form.get(name)), termsVersion: CANDIDATE_TERMS_VERSION, privacyVersion: WEBSITE_FORM_VERSION, consentAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    try {
      try { await save(); }
      catch (error) {
        // The code went live before the database change (the new column is missing): keep the application, without the new field.
        if (!missingColumn(error)) throw error;
        console.error("applications: database change 0021 is not applied yet; saved without the WhatsApp choice", id);
        await env.DB!.prepare("INSERT INTO applications (id, job_id, full_name, email, phone, location, experience, desired_role, skills, education, availability, message, resume_key, resume_name, resume_type, resume_size, consent, share_consent, future_consent, terms_version, privacy_version, consent_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)")
          .bind(id, jobId, fullName, email, phone, location, experience, desiredRole, skills, education, availability, message, resumeKey, resumeName, resumeType, resumeSize, shareConsent ? 1 : 0, futureConsent ? 1 : 0, CANDIDATE_TERMS_VERSION, WEBSITE_FORM_VERSION, new Date().toISOString(), new Date().toISOString()).run();
      }
    }
    catch (e) { if (resumeKey && env.BUCKET) await env.BUCKET.delete(resumeKey); throw e; }
    // One candidate list: the applicant also joins the shared candidate records, within what they ticked.
    // A failure here never loses the application; the admin can add it later from the Job portal tab.
    let candidateId: string | null = null;
    try { candidateId = (await linkWebsiteApplication(portalDb(), env.BUCKET ?? null, { id, jobId, fullName, email, phone, location, shareConsent, futureConsent, privacyVersion: WEBSITE_FORM_VERSION, resumeName }, cvBytes)).candidateId; }
    catch (error) { console.error("candidate list link failed", id, error instanceof Error ? error.message : error); }
    // Score the applicant now, so the recruiter sees them without anyone pressing "Run scoring now".
    try { await drainQueue(portalDb(), portalSecret(), 300); } catch (error) { console.error("scoring after application failed", id, error instanceof Error ? error.message : error); }
    const reference = `JP-${id.slice(0, 13).replaceAll("-", "").toUpperCase()}`;
    // Acknowledge by email, and on WhatsApp only if the box was ticked. Neither can fail the application.
    const roleTitle = jobId ? (await env.DB!.prepare("SELECT title FROM jobs WHERE id = ?").bind(jobId).first<{ title: string }>())?.title ?? null : null;
    const ack = { name: fullName, reference, roleTitle, whatsapp: whatsappConsent, share: shareConsent, future: futureConsent };
    const emailed = await sendApplicationAck(email, ack);
    try {
      if (candidateId) {
        const pdb = portalDb(), text = applicationAckText(ack), at = new Date().toISOString();
        // A form's tick is recorded on a website-only record; an account holder sets their own preference when signed in.
        if (whatsappConsent) await pdb.prepare("UPDATE candidates SET whatsapp_consent_at = COALESCE(whatsapp_consent_at, ?), whatsapp_consent_version = ? WHERE id = ? AND account_id IS NULL").bind(at, `website-${WEBSITE_FORM_VERSION}: ${WEBSITE_FORM.whatsapp}`, candidateId).run();
        const sender = whatsappConsent ? await resolveSender(pdb, null) : null;
        await pdb.batch([
          pdb.prepare("INSERT INTO messages (id, recipient_kind, recipient_id, channel, kind, title, body, status, status_detail, created_at, sent_at) VALUES (?, 'candidate', ?, 'email', 'application.received', ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), candidateId, text.subject, text.text.slice(0, 1200), emailed === "sent" ? "sent" : emailed === "failed" ? "failed" : "skipped", emailed === "sent" ? "" : emailed === "failed" ? "the email service refused the message" : "email is not configured", at, emailed === "sent" ? at : null),
          ...(whatsappConsent ? [pdb.prepare("INSERT INTO messages (id, recipient_kind, recipient_id, channel, sender_scope, kind, body, status, status_detail, created_at) VALUES (?, 'candidate', ?, 'whatsapp', ?, 'application.received', ?, ?, ?, ?)").bind(crypto.randomUUID(), candidateId, sender?.scope ?? "", text.whatsapp, sender ? "queued" : "skipped", sender ? "waiting for a WhatsApp provider" : "no WhatsApp number configured", at)] : []),
        ]);
      }
    } catch (error) { console.error("application acknowledgement record failed", id, error instanceof Error ? error.message : error); }
    return json({ reference, emailed: emailed === "sent", ...confirmation("application", { email, reference, emailed }) }, 201);
  } catch (error) { if (error instanceof PortalError) return errorJson(error.message, error.status); return errorJson("We couldn't submit your details. Please try again in a moment.", 503); }
}
