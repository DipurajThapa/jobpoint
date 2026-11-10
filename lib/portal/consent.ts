// Consent ledger (DPDP Act 2023 s.6; DPDP Rules 2025 r.3). Consent is recorded
// per purpose as append-only grant/withdraw rows tied to the notice version.
// Withdrawal is as easy as granting and takes effect immediately.

import { audit, newId, nowIso, sha256Hex, type Db } from "./db";
import { notifyCompany, notifyStaff } from "./notify";

export type Purpose = "profile_processing" | "share_with_companies" | "service_offers" | "recruiter_sharing";
/** Wording the person actually agreed to, when it is not the portal notice (e.g. the website form). */
export type NoticeOverride = { version: string; text: string };

import { CONSENT_NOTICE, CONSENT_NOTICE_VERSION } from "./notice";
export { CONSENT_NOTICE, CONSENT_NOTICE_VERSION };

const PORTAL_TEXT = CONSENT_NOTICE as Record<string, string>;

export async function noticeHash(purpose: Purpose, notice?: NoticeOverride) {
  return (await sha256Hex(`${notice?.version ?? CONSENT_NOTICE_VERSION}:${notice?.text ?? PORTAL_TEXT[purpose] ?? purpose}`)).slice(0, 32);
}

export async function recordConsent(db: Db, candidateId: string, purpose: Purpose, action: "granted" | "withdrawn", ipHash = "", channel = "web", notice?: NoticeOverride) {
  await db.prepare("INSERT INTO candidate_consents (id, candidate_id, purpose, action, notice_version, notice_hash, channel, ip_hash, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(newId(), candidateId, purpose, action, notice?.version ?? CONSENT_NOTICE_VERSION, await noticeHash(purpose, notice), channel, ipHash, nowIso()).run();
}

/** SQL fragment: true when the latest consent row for the purpose is a grant. */
export const ACTIVE_CONSENT_SQL = (candidateCol: string, purpose: Purpose) =>
  `(SELECT action FROM candidate_consents cc WHERE cc.candidate_id = ${candidateCol} AND cc.purpose = '${purpose}' ORDER BY cc.at DESC, cc.rowid DESC LIMIT 1) = 'granted'`;

export async function consentActive(db: Db, candidateId: string, purpose: Purpose): Promise<boolean> {
  const row = await db.prepare(`SELECT ${ACTIVE_CONSENT_SQL("?", purpose)} AS active`).bind(candidateId).first<{ active: number | null }>();
  return row?.active === 1;
}

/**
 * Withdraw consent to share with companies. Immediately:
 * - removes the candidate from every unreleased match list (match rows deleted),
 * - revokes every active release (previews disappear),
 * - revokes platform access to already-unlocked copies (the unlock and quota
 *   record are kept for audit; companies are asked to delete downloaded copies),
 * - marks open applications and open pipeline entries as withdrawn and cancels
 *   scheduled interviews.
 * Returns the companies that had unlocked the CV, for the deletion notice.
 */
export async function withdrawSharing(db: Db, candidateId: string, actor: string, ipHash = ""): Promise<{ companiesToNotify: string[] }> {
  const at = nowIso();
  const { results } = await db.prepare("SELECT DISTINCT company_id FROM unlocks WHERE candidate_id = ? AND access_revoked_at IS NULL").bind(candidateId).all<{ company_id: string }>();
  const { results: open } = await db.prepare("SELECT p.id, p.company_id, p.jd_id, j.title FROM pipeline p JOIN jds j ON j.id = p.jd_id WHERE p.candidate_id = ? AND p.stage NOT IN ('joined','rejected','offer_declined','no_show','withdrawn')").bind(candidateId).all<{ id: string; company_id: string; jd_id: string; title: string }>();
  await db.batch([
    db.prepare("INSERT INTO candidate_consents (id, candidate_id, purpose, action, notice_version, notice_hash, channel, ip_hash, at) VALUES (?, ?, 'share_with_companies', 'withdrawn', ?, ?, 'web', ?, ?)")
      .bind(newId(), candidateId, CONSENT_NOTICE_VERSION, await noticeHash("share_with_companies"), ipHash, at),
    // Recruiter-reviewed sharing (website consent) ends with any withdrawal of sharing.
    db.prepare("INSERT INTO candidate_consents (id, candidate_id, purpose, action, notice_version, notice_hash, channel, ip_hash, at) SELECT ?, ?, 'recruiter_sharing', 'withdrawn', ?, ?, 'web', ?, ? WHERE " + ACTIVE_CONSENT_SQL("?", "recruiter_sharing"))
      .bind(newId(), candidateId, CONSENT_NOTICE_VERSION, await noticeHash("recruiter_sharing"), ipHash, at, candidateId),
    db.prepare("DELETE FROM matches WHERE candidate_id = ?").bind(candidateId),
    db.prepare("DELETE FROM score_queue WHERE kind = 'candidate' AND ref_id = ?").bind(candidateId),
    db.prepare("UPDATE releases SET revoked_at = ?, revoke_reason = 'consent_withdrawn' WHERE candidate_id = ? AND revoked_at IS NULL").bind(at, candidateId),
    db.prepare("UPDATE unlocks SET access_revoked_at = ?, access_revoke_reason = 'consent_withdrawn' WHERE candidate_id = ? AND access_revoked_at IS NULL").bind(at, candidateId),
    db.prepare("UPDATE portal_applications SET status = 'withdrawn', updated_at = ? WHERE candidate_id = ? AND status NOT IN ('hired','rejected','withdrawn')").bind(at, candidateId),
    db.prepare("UPDATE interviews SET status = 'cancelled', updated_at = ? WHERE status = 'scheduled' AND pipeline_id IN (SELECT id FROM pipeline WHERE candidate_id = ?)").bind(at, candidateId),
    // The stage history gets a row for every entry closed here (it feeds hiring-speed figures and any later dispute).
    ...open.map(p => db.prepare("INSERT INTO pipeline_events (id, pipeline_id, stage, actor, note, at) VALUES (?, ?, 'withdrawn', 'candidate', 'Candidate withdrew consent', ?)").bind(newId(), p.id, at)),
    db.prepare("UPDATE pipeline SET stage = 'withdrawn', stage_reason = 'consent_withdrawn', updated_at = ? WHERE candidate_id = ? AND stage NOT IN ('joined','rejected','offer_declined','no_show','withdrawn')").bind(at, candidateId),
  ]);
  // The recruiters and the client hear that the person has left the process.
  for (const p of open) {
    await notifyStaff(db, p.company_id, "candidate.withdrew", `A candidate withdrew from ${p.title}`, "They withdrew their consent to share their CV with employers.", { jdId: p.jd_id, pipelineId: p.id });
    await notifyCompany(db, p.company_id, "candidate.withdrew", `A candidate withdrew from ${p.title}`, "The candidate withdrew consent, so their profile is no longer available to you. Please delete any copy you downloaded.");
  }
  await audit(db, actor, "consent.withdrawn", "candidate", candidateId, `share_with_companies; ${results.length} unlocked copies revoked`);
  return { companiesToNotify: results.map(r => r.company_id) };
}

/**
 * The candidate hides their profile from one employer. If that employer already has the profile, its access ends at
 * once and its open entries are closed as withdrawn: the same as withdrawing consent, for that one employer.
 * Returns how many entries were closed (0 when the employer never had the profile).
 */
export async function withdrawFromCompany(db: Db, candidateId: string, companyId: string, actor: string): Promise<number> {
  const at = nowIso();
  const { results: open } = await db.prepare("SELECT p.id, p.jd_id, j.title FROM pipeline p JOIN jds j ON j.id = p.jd_id WHERE p.candidate_id = ? AND p.company_id = ? AND p.stage NOT IN ('joined','rejected','offer_declined','no_show','withdrawn')").bind(candidateId, companyId).all<{ id: string; jd_id: string; title: string }>();
  const unlocked = await db.prepare("SELECT 1 AS x FROM unlocks WHERE candidate_id = ? AND company_id = ? AND access_revoked_at IS NULL").bind(candidateId, companyId).first();
  if (!open.length && !unlocked) return 0;
  await db.batch([
    db.prepare("UPDATE unlocks SET access_revoked_at = ?, access_revoke_reason = 'hidden_by_candidate' WHERE candidate_id = ? AND company_id = ? AND access_revoked_at IS NULL").bind(at, candidateId, companyId),
    db.prepare("UPDATE interviews SET status = 'cancelled', updated_at = ? WHERE status = 'scheduled' AND pipeline_id IN (SELECT id FROM pipeline WHERE candidate_id = ? AND company_id = ?)").bind(at, candidateId, companyId),
    db.prepare("UPDATE portal_applications SET status = 'withdrawn', updated_at = ? WHERE candidate_id = ? AND status NOT IN ('hired','rejected','withdrawn') AND jd_id IN (SELECT id FROM jds WHERE company_id = ?)").bind(at, candidateId, companyId),
    ...open.map(p => db.prepare("INSERT INTO pipeline_events (id, pipeline_id, stage, actor, note, at) VALUES (?, ?, 'withdrawn', 'candidate', 'Candidate hid their profile from this employer', ?)").bind(newId(), p.id, at)),
    db.prepare("UPDATE pipeline SET stage = 'withdrawn', stage_reason = 'candidate_withdrew', updated_at = ? WHERE candidate_id = ? AND company_id = ? AND stage NOT IN ('joined','rejected','offer_declined','no_show','withdrawn')").bind(at, candidateId, companyId),
  ]);
  await audit(db, actor, "consent.hidden_from_company", "candidate", candidateId, `company ${companyId}; ${open.length} entr${open.length === 1 ? "y" : "ies"} closed`);
  for (const p of open) {
    await notifyStaff(db, companyId, "candidate.withdrew", `A candidate withdrew from ${p.title}`, "They chose to hide their profile from this employer.", { jdId: p.jd_id, pipelineId: p.id });
    await notifyCompany(db, companyId, "candidate.withdrew", `A candidate withdrew from ${p.title}`, "The candidate chose not to share their profile with you, so it is no longer available. Please delete any copy you downloaded.");
  }
  return open.length;
}
