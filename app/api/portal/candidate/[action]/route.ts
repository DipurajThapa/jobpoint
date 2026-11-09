import { env } from "cloudflare:workers";
import { portalDb, portalSecret, json, fail, failFrom, requireApi, ipHash } from "@/lib/portal/session";
import { recordConsent, withdrawSharing, consentActive } from "@/lib/portal/consent";
import { applyToJd, correctProfile, deleteCandidateData, primaryProfile } from "@/lib/portal/candidate";
import { ingestCv } from "@/lib/portal/ingest";
import { drainQueue } from "@/lib/portal/queue";
import { candidateApplications, candidateJobs, candidateSharing } from "@/lib/portal/views";
import { withinLimits, flagAbuse } from "@/lib/portal/access";
import { attemptQuestions, startAttempt, submitAttempt } from "@/lib/portal/assessment";
import { enqueue } from "@/lib/portal/company";
import { CvReadError, MAX_CV_BYTES } from "@/lib/ats/pipeline";
import { sendMail } from "@/lib/portal/mailer";
import { audit, nowIso, parseJson } from "@/lib/portal/db";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ action: string }> };

export async function GET(request: Request, context: Ctx) {
  const account = await requireApi(request, "candidate");
  if (account instanceof Response) return account;
  const { action } = await context.params;
  const db = portalDb(), id = account.candidateId!, url = new URL(request.url);
  try {
    if (action === "jobs") {
      const n = (k: string) => url.searchParams.get(k) ? Number(url.searchParams.get(k)) : undefined;
      return json({ jobs: await candidateJobs(db, id, { city: url.searchParams.get("city") ?? undefined, role: url.searchParams.get("role") ?? undefined, minCtcInr: n("minCtc"), maxYears: n("maxYears") }) });
    }
    if (action === "applications") return json({ applications: await candidateApplications(db, id) });
    if (action === "profile") {
      const p = await primaryProfile(db, id);
      return json({ profile: p?.profile ?? null, status: p?.status ?? "none", sharing: await consentActive(db, id, "share_with_companies") });
    }
    if (action === "export") {
      // DPDP access right: the candidate's data, its corrections, consents and who received it.
      const p = await primaryProfile(db, id);
      const consents = (await db.prepare("SELECT purpose, action, notice_version, at FROM candidate_consents WHERE candidate_id = ? ORDER BY at").bind(id).all()).results;
      return new Response(JSON.stringify({ exportedAt: nowIso(), profile: p?.profile ?? null, consents, applications: await candidateApplications(db, id), sharedWith: await candidateSharing(db, id) }, null, 2),
        { headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="job-point-my-data.json"', "cache-control": "no-store" } });
    }
    if (action === "attempt") return json(await attemptQuestions(db, url.searchParams.get("id") ?? "", id));
    if (action === "companies") {
      // Companies a candidate can block (verified company records, not free-text names).
      const row = await db.prepare("SELECT hidden_company_ids FROM candidates WHERE id = ?").bind(id).first<{ hidden_company_ids: string }>();
      const { results } = await db.prepare("SELECT id, display_name, city FROM companies WHERE status = 'active' ORDER BY display_name").all();
      return json({ companies: results, blocked: parseJson<string[]>(row?.hidden_company_ids, []), sharing: await candidateSharing(db, id) });
    }
    if (action === "assessments") {
      const { results } = await db.prepare(`SELECT s.id, s.title, s.description, s.skill_id, s.items_per_form, s.time_limit_sec, s.owner_kind, s.jd_id,
          (SELECT MAX(started_at) FROM assessment_attempts a WHERE a.assessment_id = s.id AND a.candidate_id = ?) AS last_attempt
        FROM assessments s WHERE s.status = 'approved' AND (s.owner_kind = 'platform' OR s.jd_id IN (SELECT jd_id FROM matches WHERE candidate_id = ? AND hard_pass = 1))`).bind(id, id).all();
      return json({ assessments: results });
    }
    return fail("Unknown action.", 404);
  } catch (error) { return failFrom(error); }
}

export async function POST(request: Request, context: Ctx) {
  const account = await requireApi(request, "candidate", true);
  if (account instanceof Response) return account;
  const { action } = await context.params;
  const db = portalDb(), id = account.candidateId!, ip = await ipHash(request);
  try {
    if (action === "upload") {
      if (Number(request.headers.get("content-length") ?? 0) > MAX_CV_BYTES + 50_000) return fail("The CV exceeds the 5 MB limit.", 413);
      const limit = await withinLimits(db, id, "cv_upload");
      if (!limit.ok) { await flagAbuse(db, "candidate", id, null, "rate:cv_upload", limit.rule); return fail("You can upload up to 3 CV versions a month.", 429, "RATE_LIMIT"); }
      const form = await request.formData();
      const file = form.get("resume");
      if (!(file instanceof File) || !file.size) return fail("Attach your CV as a PDF or DOCX file.");
      if (form.get("consentProfile") !== "yes") return fail("Agree to the processing notice to upload your CV.", 400, "CONSENT");
      await recordConsent(db, id, "profile_processing", "granted", ip);
      if (form.get("consentShare") === "yes") await recordConsent(db, id, "share_with_companies", "granted", ip);
      if (form.get("consentOffers") === "yes") await recordConsent(db, id, "service_offers", "granted", ip);
      const cand = await db.prepare("SELECT display_name, current_city FROM candidates WHERE id = ?").bind(id).first<{ display_name: string; current_city: string }>();
      let result;
      try { result = await ingestCv(db, env.BUCKET ?? null, id, { bytes: new Uint8Array(await file.arrayBuffer()), fileName: file.name.replace(/[\\/\r\n\0]/g, "_").slice(0, 140), knownName: cand?.display_name, knownLocation: cand?.current_city }); }
      catch (error) { if (error instanceof CvReadError) return fail(error.message, 422, "UNREADABLE"); throw error; }
      await drainQueue(db, portalSecret(), 300);
      return json({ status: result.status, profile: result.profile, message: result.status === "parsed" ? "Your CV has been read. Check the details below and correct anything we got wrong." : "We could not read your CV automatically (it may be a scanned image). A Job Point reviewer will check it; nothing has been lost." }, 201);
    }
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (action === "profile") {
      const p = await primaryProfile(db, id);
      const cvText = p ? [p.profile.summary, ...p.profile.work.flatMap(w => [w.title, ...w.highlights]), ...p.profile.skills.map(s => s.name)].join("\n") : "";
      const out = await correctProfile(db, id, (body.correction ?? {}) as never, cvText, "candidate", account.id);
      await drainQueue(db, portalSecret(), 300);
      return json({ message: out.changed.length ? "Profile updated. Your job matches are being refreshed." : "Nothing changed.", changed: out.changed });
    }
    if (action === "consent") {
      const purpose = body.purpose === "service_offers" ? "service_offers" : "share_with_companies";
      if (body.grant === true) { await recordConsent(db, id, purpose, "granted", ip); if (purpose === "share_with_companies") { await enqueue(db, "candidate", id, "consent_granted").run(); await drainQueue(db, portalSecret(), 300); } return json({ message: "Consent recorded." }); }
      if (purpose === "service_offers") { await recordConsent(db, id, purpose, "withdrawn", ip); return json({ message: "You will not receive service offers." }); }
      const { companiesToNotify } = await withdrawSharing(db, id, account.id, ip);
      await notifyCompanies(db, companiesToNotify);
      return json({ message: "Sharing stopped. Companies can no longer see your profile, and companies that unlocked it have been asked to delete their copies." });
    }
    if (action === "block") {
      const companyId = typeof body.companyId === "string" ? body.companyId : "";
      const row = await db.prepare("SELECT hidden_company_ids FROM candidates WHERE id = ?").bind(id).first<{ hidden_company_ids: string }>();
      const set = new Set(parseJson<string[]>(row?.hidden_company_ids, []));
      if (body.block === false) set.delete(companyId); else if (companyId) set.add(companyId);
      await db.batch([
        db.prepare("UPDATE candidates SET hidden_company_ids = ? WHERE id = ?").bind(JSON.stringify([...set].slice(0, 50)), id),
        db.prepare("UPDATE releases SET revoked_at = ?, revoke_reason = 'blocked_by_candidate' WHERE candidate_id = ? AND company_id = ? AND revoked_at IS NULL").bind(nowIso(), id, companyId),
      ]);
      return json({ message: body.block === false ? "Company unblocked." : "That company will not see your profile, even anonymously." });
    }
    if (action === "apply") { await applyToJd(db, id, String(body.jdId ?? "")); await drainQueue(db, portalSecret(), 300); return json({ message: "Application recorded." }); }
    if (action === "delete") {
      if (body.confirm !== "DELETE") return fail("Type DELETE to confirm.", 400, "CONFIRM");
      const { r2Keys, companiesToNotify } = await deleteCandidateData(db, id, account.id);
      if (env.BUCKET) for (const key of r2Keys) await env.BUCKET.delete(key);
      await notifyCompanies(db, companiesToNotify);
      return json({ message: "Your account and CV have been deleted." });
    }
    if (action === "assessment-start") return json(await startAttempt(db, id, String(body.assessmentId ?? ""), { jdId: typeof body.jdId === "string" ? body.jdId : null, extraTime: body.extraTime === true }));
    if (action === "assessment-submit") {
      const out = await submitAttempt(db, String(body.attemptId ?? ""), id, Array.isArray(body.answers) ? body.answers as never : [], (body.events ?? { hidden: 0, pastes: 0 }) as never);
      await enqueue(db, "candidate", id, "assessment").run();
      await drainQueue(db, portalSecret(), 300);
      await audit(db, account.id, "assessment.submitted", "candidate", id, out.onHold ? "on hold" : "ok");
      return json({ ...out, message: out.onHold ? "Submitted. This attempt is on hold for a quick review before it counts; you can take a free verification test." : "Submitted. Your result now counts towards matching jobs." });
    }
    return fail("Unknown action.", 404);
  } catch (error) { return failFrom(error); }
}

/** Ask companies that unlocked the CV to delete their copies (contractual duty). */
async function notifyCompanies(db: ReturnType<typeof portalDb>, companyIds: string[]) {
  for (const companyId of companyIds) {
    const { results } = await db.prepare("SELECT a.email FROM company_users cu JOIN portal_accounts a ON a.id = cu.account_id WHERE cu.company_id = ? AND a.status = 'active'").bind(companyId).all<{ email: string }>();
    for (const r of results) await sendMail({ to: r.email, subject: "Job Point: delete a candidate's CV", text: "A candidate whose CV your company unlocked on Job Point has withdrawn consent. Their profile is no longer available to you. Under your Job Point terms, delete any copy you downloaded within 15 days." });
  }
}
