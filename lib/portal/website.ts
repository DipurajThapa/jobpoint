// One candidate list. Every application made on the public website becomes, or
// joins, a candidate record in the same table as portal sign-ups, with its CV
// parsed the same way. What Jobboard300 may do with the person follows exactly
// what they ticked on the website form, recorded in the consent ledger against
// that form's wording:
// - "Contact me about other suitable roles later" → profile_processing: the CV
//   is matched to clients' jobs (visible to Jobboard300 only).
// - "You may share my CV with an employer for a suitable role after reviewing
//   the fit" (general registration) → recruiter_sharing: a recruiter may submit
//   them to a client's managed search. Never automatic anonymous release, which
//   needs the portal's own share_with_companies consent.
// - The job-specific form's sharing tick covers only that one role, so it is
//   not turned into general sharing.
// A website applicant is never attached to someone's portal account by email
// alone (the website does not verify email): a separate record is created and
// flagged as a possible duplicate for the admin to merge.

import { audit, newId, nowIso, sha256Hex, type Db } from "./db";
import { consentActive, recordConsent, withdrawSharing } from "./consent";
import { createCandidate, deleteCandidateData, normEmail, normPhone } from "./candidate";
import { enqueue } from "./company";
import { ingestCv, type Bucket } from "./ingest";
import { WEBSITE_NOTICE, websiteNoticeVersion } from "./notice";

export type WebsiteApplication = {
  id: string; jobId: string | null; fullName: string; email: string; phone: string; location: string;
  shareConsent: boolean; futureConsent: boolean; privacyVersion: string; resumeName: string | null;
};

export type LinkResult = { candidateId: string; created: boolean; cv: "parsed" | "needs_review" | "unreadable" | "none"; matching: boolean; recruiterSharing: boolean };

/** Website-only candidate (no portal account) with the same email, if any: the same person applying again. */
async function existingWebsiteCandidate(db: Db, email: string) {
  const hash = await sha256Hex(normEmail(email));
  return db.prepare(`SELECT c.id FROM candidates c WHERE c.dedupe_email_hash = ? AND c.account_id IS NULL AND c.status = 'active'
      AND EXISTS (SELECT 1 FROM candidate_sources s WHERE s.candidate_id = c.id AND s.kind = 'website_application') ORDER BY c.created_at LIMIT 1`).bind(hash).first<{ id: string }>();
}

export async function linkWebsiteApplication(db: Db, bucket: Bucket, app: WebsiteApplication, cvBytes: Uint8Array | null, actor = "website"): Promise<LinkResult> {
  const linked = await db.prepare("SELECT candidate_id FROM candidate_sources WHERE kind = 'website_application' AND ref_id = ?").bind(app.id).first<{ candidate_id: string }>();
  if (linked) return { candidateId: linked.candidate_id, created: false, cv: "none", matching: await consentActive(db, linked.candidate_id, "profile_processing"), recruiterSharing: await consentActive(db, linked.candidate_id, "recruiter_sharing") };
  const reuse = await existingWebsiteCandidate(db, app.email);
  const candidateId = reuse?.id ?? await createCandidate(db, { accountId: null, displayName: app.fullName, email: app.email, phone: app.phone, currentCity: app.location });
  await db.prepare("INSERT INTO candidate_sources (id, candidate_id, kind, ref_id, created_at) VALUES (?, ?, 'website_application', ?, ?)").bind(newId(), candidateId, app.id, nowIso()).run();
  const version = websiteNoticeVersion(app.privacyVersion);
  // A later form with a box left unticked is not a withdrawal of an earlier tick; withdrawal goes through a privacy request.
  if (app.futureConsent) await recordConsent(db, candidateId, "profile_processing", "granted", "", "website", { version, text: WEBSITE_NOTICE.profile_processing });
  if (app.shareConsent && !app.jobId) await recordConsent(db, candidateId, "recruiter_sharing", "granted", "", "website", { version, text: WEBSITE_NOTICE.recruiter_sharing });
  let cv: LinkResult["cv"] = "none";
  if (cvBytes && app.resumeName) {
    try { cv = (await ingestCv(db, bucket, candidateId, { bytes: cvBytes, fileName: app.resumeName, knownName: app.fullName, knownLocation: app.location })).status as "parsed" | "needs_review"; }
    catch { cv = "unreadable"; }
  }
  const matching = await consentActive(db, candidateId, "profile_processing");
  if (matching && cv === "parsed") await enqueue(db, "candidate", candidateId, "website").run();
  await audit(db, actor, "candidate.website_linked", "candidate", candidateId, `application ${app.id}; cv ${cv}; matching ${matching}`);
  return { candidateId, created: !reuse, cv, matching, recruiterSharing: await consentActive(db, candidateId, "recruiter_sharing") };
}

/**
 * The admin corrected a website application's details. The same correction is
 * applied to the person's record in the candidate list, so the two never
 * disagree. Only website-only records are touched: a portal account holder
 * corrects their own profile.
 */
export async function syncWebsiteProfile(db: Db, applicationId: string, details: { fullName: string; email: string; phone: string; location: string }, actor: string): Promise<boolean> {
  const row = await db.prepare(`SELECT c.id FROM candidate_sources s JOIN candidates c ON c.id = s.candidate_id
      WHERE s.kind = 'website_application' AND s.ref_id = ? AND c.account_id IS NULL AND c.status NOT IN ('merged','deleted')`).bind(applicationId).first<{ id: string }>();
  if (!row) return false;
  const phone = normPhone(details.phone);
  await db.prepare("UPDATE candidates SET display_name = ?, current_city = ?, dedupe_email_hash = ?, dedupe_phone_hash = ? WHERE id = ?")
    .bind(details.fullName.trim().slice(0, 120), details.location.trim().slice(0, 80), await sha256Hex(normEmail(details.email)), phone.length === 10 ? await sha256Hex(phone) : "", row.id).run();
  await audit(db, actor, "candidate.website_corrected", "candidate", row.id, `application ${applicationId}`);
  return true;
}

/** The admin withdrew a website applicant's optional consents (privacy request): stop matching and sharing everywhere. */
export async function withdrawWebsiteConsents(db: Db, applicationId: string, actor: string) {
  const row = await db.prepare("SELECT candidate_id FROM candidate_sources WHERE kind = 'website_application' AND ref_id = ?").bind(applicationId).first<{ candidate_id: string }>();
  if (!row) return { companiesToNotify: [] as string[] };
  const out = await withdrawSharing(db, row.candidate_id, actor);
  if (await consentActive(db, row.candidate_id, "profile_processing")) await recordConsent(db, row.candidate_id, "profile_processing", "withdrawn", "", "admin");
  return out;
}

/**
 * The admin deleted a website application. If that application was the person's
 * only link (no portal account, no other application), their candidate record,
 * CVs and pipeline notes are erased too. Returns storage keys to delete.
 */
export async function unlinkWebsiteApplication(db: Db, applicationId: string, actor: string): Promise<{ r2Keys: string[]; companiesToNotify: string[] }> {
  const row = await db.prepare("SELECT candidate_id FROM candidate_sources WHERE kind = 'website_application' AND ref_id = ?").bind(applicationId).first<{ candidate_id: string }>();
  if (!row) return { r2Keys: [], companiesToNotify: [] };
  await db.prepare("DELETE FROM candidate_sources WHERE kind = 'website_application' AND ref_id = ?").bind(applicationId).run();
  const rest = await db.prepare("SELECT (SELECT COUNT(*) FROM candidate_sources WHERE candidate_id = ?) AS sources, (SELECT account_id FROM candidates WHERE id = ?) AS account").bind(row.candidate_id, row.candidate_id).first<{ sources: number; account: string | null }>();
  if (rest && rest.sources === 0 && !rest.account) return deleteCandidateData(db, row.candidate_id, actor);
  await audit(db, actor, "candidate.website_unlinked", "candidate", row.candidate_id, applicationId);
  return { r2Keys: [], companiesToNotify: [] };
}

/** Website applications not yet in the candidate list (for the admin's one-off backfill). */
export async function unlinkedWebsiteApplications(db: Db, limit = 25) {
  const { results } = await db.prepare(`SELECT a.id, a.job_id, a.full_name, a.email, a.phone, a.location, a.share_consent, a.future_consent, a.privacy_version, a.resume_key, a.resume_name
    FROM applications a WHERE NOT EXISTS (SELECT 1 FROM candidate_sources s WHERE s.kind = 'website_application' AND s.ref_id = a.id) ORDER BY a.created_at LIMIT ?`).bind(limit)
    .all<{ id: string; job_id: string | null; full_name: string; email: string; phone: string; location: string; share_consent: number; future_consent: number; privacy_version: string; resume_key: string | null; resume_name: string | null }>();
  return results.map(r => ({ resumeKey: r.resume_key, app: { id: r.id, jobId: r.job_id, fullName: r.full_name, email: r.email, phone: r.phone, location: r.location, shareConsent: !!r.share_consent, futureConsent: !!r.future_consent, privacyVersion: r.privacy_version, resumeName: r.resume_name } satisfies WebsiteApplication }));
}

export async function countUnlinkedWebsiteApplications(db: Db) {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM applications a WHERE NOT EXISTS (SELECT 1 FROM candidate_sources s WHERE s.kind = 'website_application' AND s.ref_id = a.id)").first<{ n: number }>();
  return row?.n ?? 0;
}
