// Consent ledger (DPDP Act 2023 s.6; DPDP Rules 2025 r.3). Consent is recorded
// per purpose as append-only grant/withdraw rows tied to the notice version.
// Withdrawal is as easy as granting and takes effect immediately.

import { audit, newId, nowIso, sha256Hex, type Db } from "./db";

export type Purpose = "profile_processing" | "share_with_companies" | "service_offers";

export const CONSENT_NOTICE_VERSION = "portal-2026-11-09";
export const CONSENT_NOTICE = {
  profile_processing: "Job Point will store your CV and the details read from it (work history, education, skills, certifications, current and preferred cities, notice period and CTC) to build your profile, match it with job descriptions, and show you suitable jobs. Your name, gender, age, religion, caste, marital status and photo are never used for matching.",
  share_with_companies: "When your profile closely matches a job, Job Point will show the hiring company an anonymous summary (title, years of experience, key skills, city, match score and the reasons for it). If the company unlocks your profile, it will see your full CV and contact details for that hiring purpose. You can withdraw this consent at any time from Privacy and consent; we then stop showing your profile to companies immediately.",
  service_offers: "Optional: Job Point may tell you about paid services such as CV writing, LinkedIn profile optimisation, spoken English and technical training.",
} as const;

export async function noticeHash(purpose: Purpose) {
  return (await sha256Hex(`${CONSENT_NOTICE_VERSION}:${CONSENT_NOTICE[purpose]}`)).slice(0, 32);
}

export async function recordConsent(db: Db, candidateId: string, purpose: Purpose, action: "granted" | "withdrawn", ipHash = "", channel = "web") {
  await db.prepare("INSERT INTO candidate_consents (id, candidate_id, purpose, action, notice_version, notice_hash, channel, ip_hash, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(newId(), candidateId, purpose, action, CONSENT_NOTICE_VERSION, await noticeHash(purpose), channel, ipHash, nowIso()).run();
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
 * - marks open applications as withdrawn.
 * Returns the companies that had unlocked the CV, for the deletion notice.
 */
export async function withdrawSharing(db: Db, candidateId: string, actor: string, ipHash = ""): Promise<{ companiesToNotify: string[] }> {
  const at = nowIso();
  const { results } = await db.prepare("SELECT DISTINCT company_id FROM unlocks WHERE candidate_id = ? AND access_revoked_at IS NULL").bind(candidateId).all<{ company_id: string }>();
  await db.batch([
    db.prepare("INSERT INTO candidate_consents (id, candidate_id, purpose, action, notice_version, notice_hash, channel, ip_hash, at) VALUES (?, ?, 'share_with_companies', 'withdrawn', ?, ?, 'web', ?, ?)")
      .bind(newId(), candidateId, CONSENT_NOTICE_VERSION, await noticeHash("share_with_companies"), ipHash, at),
    db.prepare("DELETE FROM matches WHERE candidate_id = ?").bind(candidateId),
    db.prepare("DELETE FROM score_queue WHERE kind = 'candidate' AND ref_id = ?").bind(candidateId),
    db.prepare("UPDATE releases SET revoked_at = ?, revoke_reason = 'consent_withdrawn' WHERE candidate_id = ? AND revoked_at IS NULL").bind(at, candidateId),
    db.prepare("UPDATE unlocks SET access_revoked_at = ?, access_revoke_reason = 'consent_withdrawn' WHERE candidate_id = ? AND access_revoked_at IS NULL").bind(at, candidateId),
    db.prepare("UPDATE portal_applications SET status = 'withdrawn', updated_at = ? WHERE candidate_id = ? AND status NOT IN ('hired','rejected','withdrawn')").bind(at, candidateId),
  ]);
  await audit(db, actor, "consent.withdrawn", "candidate", candidateId, `share_with_companies; ${results.length} unlocked copies revoked`);
  return { companiesToNotify: results.map(r => r.company_id) };
}
