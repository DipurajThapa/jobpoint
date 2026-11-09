// Automatic release of matched CVs to companies, within the admin-approved
// parameters only. Nothing outside these rules ever reaches a company:
//   JD live, on the company's current approved parameter version, company active;
//   candidate active, sharing consent active, not hiding from this company;
//   hard filters passed and the lower confidence bound (score - 1 SD) at or
//   above the approved minimum, so thin evidence cannot slip through;
//   at most maxReleasePerJd active releases (highest ranked first).

import { candidateRef, newId, nowIso, parseJson, type Db } from "./db";
import { ACTIVE_CONSENT_SQL } from "./consent";
import { currentParams } from "./company";

export type ReleaseOutcome = { released: number; revoked: number; active: number };

export async function runReleases(db: Db, jdId: string, secret: string): Promise<ReleaseOutcome> {
  const jd = await db.prepare("SELECT j.id, j.company_id, j.status, j.params_version, c.status AS company_status FROM jds j JOIN companies c ON c.id = j.company_id WHERE j.id = ?")
    .bind(jdId).first<{ id: string; company_id: string; status: string; params_version: number | null; company_status: string }>();
  if (!jd) return { released: 0, revoked: 0, active: 0 };
  const at = nowIso();
  const current = await currentParams(db, jd.company_id);
  const { results: active } = await db.prepare("SELECT r.id, r.candidate_id, EXISTS (SELECT 1 FROM unlocks u WHERE u.company_id = r.company_id AND u.candidate_id = r.candidate_id) AS unlocked FROM releases r WHERE r.jd_id = ? AND r.revoked_at IS NULL")
    .bind(jdId).all<{ id: string; candidate_id: string; unlocked: number }>();
  // A JD that is not live (or no longer on the approved version) releases nothing new.
  if (jd.status !== "live" || jd.company_status !== "active" || !current || jd.params_version !== current.version) return { released: 0, revoked: 0, active: active.length };

  const minScore = current.params.minScore, cap = current.params.maxReleasePerJd;
  const { results: eligible } = await db.prepare(`SELECT m.candidate_id, m.score, m.lower_bound FROM matches m JOIN candidates c ON c.id = m.candidate_id
      WHERE m.jd_id = ? AND m.hard_pass = 1 AND m.lower_bound >= ? AND c.status = 'active' AND c.open_to_work = 1
        AND ${ACTIVE_CONSENT_SQL("m.candidate_id", "share_with_companies")}
        AND NOT EXISTS (SELECT 1 FROM json_each(c.hidden_company_ids) h WHERE h.value = ?)
        -- An unresolved duplicate CV is withheld while its earlier twin is eligible, so a company never sees (or pays for) one person twice.
        AND NOT EXISTS (SELECT 1 FROM duplicate_flags d JOIN candidates o ON o.id = CASE WHEN d.a_id = c.id THEN d.b_id ELSE d.a_id END
          WHERE d.kind = 'cv' AND d.status = 'open' AND (d.a_id = c.id OR d.b_id = c.id) AND o.status = 'active' AND (o.created_at < c.created_at OR (o.created_at = c.created_at AND o.id < c.id)))
      ORDER BY m.lower_bound DESC, m.score DESC, m.candidate_id LIMIT ?`)
    .bind(jdId, minScore, jd.company_id, cap).all<{ candidate_id: string; score: number; lower_bound: number }>();
  const eligibleIds = new Set(eligible.map(e => e.candidate_id));
  const activeIds = new Set(active.map(a => a.candidate_id));
  const statements = [];
  let revoked = 0;
  // Releases that no longer qualify are withdrawn, unless the company already unlocked the candidate.
  for (const r of active) {
    if (!eligibleIds.has(r.candidate_id) && !r.unlocked) {
      statements.push(db.prepare("UPDATE releases SET revoked_at = ?, revoke_reason = 'no_longer_eligible' WHERE id = ?").bind(at, r.id));
      revoked++;
    }
  }
  let released = 0;
  for (const e of eligible) {
    if (activeIds.has(e.candidate_id)) continue;
    const ref = await candidateRef(secret, jd.company_id, e.candidate_id);
    statements.push(db.prepare("INSERT OR IGNORE INTO releases (id, jd_id, company_id, candidate_id, candidate_ref, score, params_version, released_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(newId(), jdId, jd.company_id, e.candidate_id, ref, e.score, current.version, at));
    released++;
  }
  // Applications follow the release decision for this JD.
  statements.push(db.prepare(`UPDATE portal_applications SET status = CASE WHEN EXISTS (SELECT 1 FROM releases r WHERE r.jd_id = portal_applications.jd_id AND r.candidate_id = portal_applications.candidate_id AND r.revoked_at IS NULL) THEN 'released' ELSE 'not_released' END, updated_at = ?
      WHERE jd_id = ? AND status IN ('applied','released','not_released')`).bind(at, jdId));
  await db.batch(statements);
  const count = await db.prepare("SELECT COUNT(*) AS n FROM releases WHERE jd_id = ? AND revoked_at IS NULL").bind(jdId).first<{ n: number }>();
  return { released, revoked, active: count?.n ?? 0 };
}

/** Revoke all active releases of a JD that is paused or closed (unlocked candidates stay unlocked). */
export async function revokeJdReleases(db: Db, jdId: string, reason: "jd_closed" | "params_changed" | "admin") {
  await db.prepare("UPDATE releases SET revoked_at = ?, revoke_reason = ? WHERE jd_id = ? AND revoked_at IS NULL").bind(nowIso(), reason, jdId).run();
}

export const parseExplanation = (value: unknown) => parseJson<{ summary: string; meets: string[]; misses: string[]; why: string }>(value, { summary: "", meets: [], misses: [], why: "" });
