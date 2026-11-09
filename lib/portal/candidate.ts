// Candidate records, CV versions, duplicate detection and applications.

import { audit, newId, nowIso, parseJson, PortalError, sha256Hex, type Db } from "./db";
import { enqueue } from "./company";
import { applyCorrection, type Correction, type PortalProfile } from "./profile";
import { consentActive } from "./consent";

export const normEmail = (email: string) => email.trim().toLowerCase().replace(/\+[^@]*@/, "@").replace(/\.(?=[^@]*@gmail\.com$)/g, "");
export const normPhone = (phone: string) => phone.replace(/\D/g, "").slice(-10);

// Near-duplicate CVs: MinHash over 5-word shingles (Broder). The estimated Jaccard
// similarity of two signatures approximates the share of shingles they have in
// common; on the seed set a re-uploaded CV scores 0.92 and different people at
// most 0.04, so 0.8 is the duplicate threshold.
const MINHASH_K = 64;
const fmix = (h: number) => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };
export function minhash(text: string): string {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 1);
  const mins = new Array<number>(MINHASH_K).fill(0xffffffff);
  for (let i = 0; i + 4 < words.length; i++) {
    let h = 0x811c9dc5;
    const shingle = words.slice(i, i + 5).join(" ");
    for (let c = 0; c < shingle.length; c++) h = Math.imul(h ^ shingle.charCodeAt(c), 16777619) >>> 0;
    for (let k = 0; k < MINHASH_K; k++) { const v = fmix(h ^ Math.imul(k + 1, 0x9e3779b1)); if (v < mins[k]) mins[k] = v; }
  }
  return words.length < 5 ? "" : mins.map(m => m.toString(16).padStart(8, "0")).join("");
}
export function similarity(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 0;
  let same = 0;
  for (let k = 0; k < a.length; k += 8) if (a.slice(k, k + 8) === b.slice(k, k + 8)) same++;
  return same / (a.length / 8);
}

export async function createCandidate(db: Db, input: { accountId: string | null; displayName: string; email: string; phone: string; currentCity?: string }) {
  const id = newId(), at = nowIso();
  const emailHash = input.email ? await sha256Hex(normEmail(input.email)) : "";
  const phoneHash = normPhone(input.phone).length === 10 ? await sha256Hex(normPhone(input.phone)) : "";
  await db.prepare("INSERT INTO candidates (id, account_id, display_name, current_city, dedupe_email_hash, dedupe_phone_hash, last_active_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, input.accountId, input.displayName.trim().slice(0, 120), (input.currentCity ?? "").slice(0, 80), emailHash, phoneHash, at, at).run();
  // Duplicate accounts: same normalised email or phone as another live candidate.
  const { results } = await db.prepare("SELECT id, CASE WHEN dedupe_email_hash = ? AND ? != '' THEN 'same_email' ELSE 'same_phone' END AS signal FROM candidates WHERE id != ? AND status NOT IN ('merged','deleted') AND ((dedupe_email_hash = ? AND ? != '') OR (dedupe_phone_hash = ? AND ? != ''))")
    .bind(emailHash, emailHash, id, emailHash, emailHash, phoneHash, phoneHash).all<{ id: string; signal: string }>();
  for (const r of results) await flagDuplicate(db, "account", r.id, id, r.signal);
  return id;
}

async function flagDuplicate(db: Db, kind: "account" | "cv", a: string, b: string, signal: string) {
  const [x, y] = [a, b].sort();
  await db.prepare("INSERT OR IGNORE INTO duplicate_flags (id, kind, a_id, b_id, signal, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)").bind(newId(), kind, x, y, signal, nowIso()).run();
}

export type NewCv = { r2Key: string; fileName: string; fileType: "pdf" | "docx"; size: number; sha256: string; text: string; profile: PortalProfile; parseOk: boolean };

/** Store a new primary CV and its parsed profile. Unreadable CVs go to manual review, never dropped. */
export async function addCv(db: Db, candidateId: string, cv: NewCv) {
  const id = newId(), at = nowIso();
  const fingerprint = minhash(cv.text);
  const status = cv.parseOk ? "parsed" : "needs_review";
  await db.batch([
    db.prepare("UPDATE cvs SET is_primary = 0, superseded_at = ? WHERE candidate_id = ? AND is_primary = 1").bind(at, candidateId),
    db.prepare("INSERT INTO cvs (id, candidate_id, r2_key, file_name, file_type, size, sha256, text_fingerprint, parse_status, parse_confidence, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)")
      .bind(id, candidateId, cv.r2Key, cv.fileName.slice(0, 140), cv.fileType, cv.size, cv.sha256, fingerprint, status, cv.profile.parse.confidence, at),
    db.prepare("INSERT INTO cv_profiles (cv_id, version, data, source, created_at) VALUES (?, 1, ?, 'parser', ?)").bind(id, JSON.stringify(cv.profile), at),
    db.prepare("UPDATE candidates SET status = CASE WHEN status = 'active' AND ? = 'needs_review' THEN 'review' WHEN status = 'review' AND ? = 'parsed' THEN 'active' ELSE status END, last_active_at = ? WHERE id = ?").bind(status, status, at, candidateId),
    enqueue(db, "candidate", candidateId, "cv_uploaded"),
  ]);
  // Duplicate CVs: the same file, or near-identical text, under another candidate.
  const { results } = await db.prepare("SELECT c.id AS cv_id, c.candidate_id, c.sha256, c.text_fingerprint FROM cvs c JOIN candidates k ON k.id = c.candidate_id WHERE c.candidate_id != ? AND c.is_primary = 1 AND k.status NOT IN ('merged','deleted')")
    .bind(candidateId).all<{ cv_id: string; candidate_id: string; sha256: string; text_fingerprint: string }>();
  for (const r of results) {
    if (r.sha256 === cv.sha256) await flagDuplicate(db, "cv", r.candidate_id, candidateId, "same_file");
    else if (r.text_fingerprint && similarity(r.text_fingerprint, fingerprint) >= 0.8) await flagDuplicate(db, "cv", r.candidate_id, candidateId, "near_identical_text");
  }
  return { cvId: id, status };
}

export async function primaryProfile(db: Db, candidateId: string): Promise<{ cvId: string; version: number; profile: PortalProfile; status: string; r2Key: string; fileName: string } | null> {
  const row = await db.prepare(`SELECT c.id, c.parse_status, c.r2_key, c.file_name, p.version, p.data FROM cvs c JOIN cv_profiles p ON p.cv_id = c.id
    WHERE c.candidate_id = ? AND c.is_primary = 1 ORDER BY p.version DESC LIMIT 1`).bind(candidateId).first<{ id: string; parse_status: string; r2_key: string; file_name: string; version: number; data: string }>();
  return row ? { cvId: row.id, version: row.version, profile: parseJson<PortalProfile>(row.data, null as unknown as PortalProfile), status: row.parse_status, r2Key: row.r2_key, fileName: row.file_name } : null;
}

/** Candidate or admin correction: stored as a new profile version; the parsed version is kept. */
export async function correctProfile(db: Db, candidateId: string, correction: Correction, cvText: string, source: "candidate" | "admin", actor: string) {
  const current = await primaryProfile(db, candidateId);
  if (!current) throw new PortalError("NO_CV", "Upload a CV first.", 404);
  const { profile, changed } = applyCorrection(current.profile, correction, cvText);
  if (!changed.length) return { changed };
  await db.batch([
    db.prepare("INSERT INTO cv_profiles (cv_id, version, data, source, corrected_fields, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(current.cvId, current.version + 1, JSON.stringify(profile), source, JSON.stringify(changed), nowIso()),
    db.prepare("UPDATE candidates SET current_city = ?, preferred_cities = ?, willing_to_relocate = ?, last_active_at = ? WHERE id = ?")
      .bind(profile.india.currentCity, JSON.stringify(profile.india.preferredCities), profile.india.willingToRelocate ? 1 : 0, nowIso(), candidateId),
    enqueue(db, "candidate", candidateId, "profile_corrected"),
  ]);
  await audit(db, actor, "profile.corrected", "candidate", candidateId, changed.join(",").slice(0, 200));
  return { changed };
}

/** Admin fix for a CV in manual review: supply the profile and mark it parsed. */
export async function resolveReview(db: Db, candidateId: string, profile: PortalProfile, adminId: string) {
  const current = await primaryProfile(db, candidateId);
  if (!current) throw new PortalError("NO_CV", "No CV on file.", 404);
  await db.batch([
    db.prepare("INSERT INTO cv_profiles (cv_id, version, data, source, corrected_fields, created_at) VALUES (?, ?, ?, 'admin', '[\"manual_review\"]', ?)").bind(current.cvId, current.version + 1, JSON.stringify(profile), nowIso()),
    db.prepare("UPDATE cvs SET parse_status = 'parsed' WHERE id = ?").bind(current.cvId),
    db.prepare("UPDATE candidates SET status = 'active' WHERE id = ? AND status = 'review'").bind(candidateId),
    enqueue(db, "candidate", candidateId, "review_resolved"),
  ]);
  await audit(db, adminId, "cv.review_resolved", "candidate", candidateId);
}

/** Merge a duplicate into the surviving candidate. Releases and unlocks follow the survivor. */
export async function mergeCandidates(db: Db, survivorId: string, duplicateId: string, adminId: string) {
  if (survivorId === duplicateId) throw new PortalError("INVALID", "Choose two different candidates.");
  const at = nowIso();
  await db.batch([
    db.prepare("UPDATE candidates SET status = 'merged', merged_into = ? WHERE id = ?").bind(survivorId, duplicateId),
    db.prepare("DELETE FROM matches WHERE candidate_id = ?").bind(duplicateId),
    db.prepare("UPDATE releases SET revoked_at = ?, revoke_reason = 'merged_duplicate' WHERE candidate_id = ? AND revoked_at IS NULL").bind(at, duplicateId),
    // An unlock of the duplicate counts as an unlock of the survivor, so the company never pays twice.
    db.prepare("UPDATE OR IGNORE unlocks SET candidate_id = ? WHERE candidate_id = ?").bind(survivorId, duplicateId),
    db.prepare("UPDATE OR IGNORE portal_applications SET candidate_id = ? WHERE candidate_id = ?").bind(survivorId, duplicateId),
    db.prepare("UPDATE duplicate_flags SET status = 'merged', resolved_by = ? WHERE (a_id IN (?, ?) AND b_id IN (?, ?)) AND status = 'open'").bind(adminId, survivorId, duplicateId, survivorId, duplicateId),
    enqueue(db, "candidate", survivorId, "merged"),
  ]);
  await audit(db, adminId, "candidate.merged", "candidate", survivorId, `merged ${duplicateId}`);
}

/**
 * Candidate deletes their account. Effective immediately: sharing stops, then
 * CV files, profiles, matches, applications and assessment data are erased.
 * A content-free stub remains (no name, contacts or CV) holding the consent
 * ledger and the record of which companies received the CV, as the DPDP Rules
 * require logs to be kept for at least one year; purgeExpiredStubs removes it.
 * Returns the R2 keys the caller must delete.
 */
export async function deleteCandidateData(db: Db, candidateId: string, actor: string): Promise<{ r2Keys: string[]; companiesToNotify: string[] }> {
  const { withdrawSharing } = await import("./consent");
  const { companiesToNotify } = await withdrawSharing(db, candidateId, actor);
  const { results } = await db.prepare("SELECT r2_key FROM cvs WHERE candidate_id = ?").bind(candidateId).all<{ r2_key: string }>();
  const account = await db.prepare("SELECT account_id FROM candidates WHERE id = ?").bind(candidateId).first<{ account_id: string | null }>();
  const at = nowIso();
  await db.batch([
    db.prepare("DELETE FROM cvs WHERE candidate_id = ?").bind(candidateId),
    db.prepare("DELETE FROM portal_applications WHERE candidate_id = ?").bind(candidateId),
    db.prepare("DELETE FROM assessment_attempts WHERE candidate_id = ?").bind(candidateId),
    db.prepare("DELETE FROM service_orders WHERE candidate_id = ?").bind(candidateId),
    db.prepare("UPDATE candidates SET status = 'deleted', account_id = NULL, display_name = '', current_city = '', preferred_cities = '[]', hidden_company_ids = '[]', dedupe_email_hash = '', dedupe_phone_hash = '', last_active_at = ? WHERE id = ?").bind(at, candidateId),
    ...(account?.account_id ? [db.prepare("UPDATE portal_accounts SET status = 'deleted', email = 'deleted-' || id || '@invalid', phone = '', password_hash = NULL WHERE id = ?").bind(account.account_id), db.prepare("DELETE FROM portal_sessions WHERE account_id = ?").bind(account.account_id)] : []),
  ]);
  await audit(db, actor, "candidate.deleted", "candidate", candidateId, `${results.length} CV file(s) erased`);
  return { r2Keys: results.map(r => r.r2_key), companiesToNotify };
}

/** Remove deletion stubs older than one year (consent ledger and unlock records go with them). */
export async function purgeExpiredStubs(db: Db) {
  const cutoff = new Date(Date.parse(nowIso()) - 366 * 86_400_000).toISOString();
  const { results } = await db.prepare("SELECT id FROM candidates WHERE status = 'deleted' AND last_active_at < ?").bind(cutoff).all<{ id: string }>();
  for (const r of results) await db.batch([db.prepare("DELETE FROM unlocks WHERE candidate_id = ?").bind(r.id), db.prepare("DELETE FROM releases WHERE candidate_id = ?").bind(r.id), db.prepare("DELETE FROM candidates WHERE id = ?").bind(r.id)]);
  return results.length;
}

export async function applyToJd(db: Db, candidateId: string, jdId: string) {
  const jd = await db.prepare("SELECT status FROM jds WHERE id = ?").bind(jdId).first<{ status: string }>();
  if (jd?.status !== "live") throw new PortalError("NOT_LIVE", "This job is not open for applications.", 410);
  if (!await consentActive(db, candidateId, "share_with_companies")) throw new PortalError("NO_CONSENT", "Allow sharing with companies in Privacy and consent to apply.", 403);
  const at = nowIso(), id = newId();
  await db.batch([
    db.prepare("INSERT INTO portal_applications (id, candidate_id, jd_id, status, created_at, updated_at) VALUES (?, ?, ?, 'applied', ?, ?) ON CONFLICT(candidate_id, jd_id) DO UPDATE SET status = CASE WHEN portal_applications.status = 'withdrawn' THEN 'applied' ELSE portal_applications.status END, updated_at = excluded.updated_at")
      .bind(id, candidateId, jdId, at, at),
    db.prepare("INSERT INTO portal_application_events (id, application_id, status, actor, at) SELECT ?, id, 'applied', 'candidate', ? FROM portal_applications WHERE candidate_id = ? AND jd_id = ?").bind(newId(), at, candidateId, jdId),
    enqueue(db, "jd", jdId, "application"),
  ]);
}
