// Access logging, rate limits and scraping detection for company browsing.
// Every list, preview, unlock, full view and download is logged. Exceeding a
// limit blocks the request (429) and raises an abuse flag for the admin.

import { newId, now, nowIso, type Db } from "./db";

export type AccessAction = "list" | "preview" | "unlock" | "view_full" | "download" | "apply" | "match_list";

export const LIMITS: Record<string, { windowSec: number; max: number }[]> = {
  list: [{ windowSec: 3600, max: 120 }, { windowSec: 86_400, max: 600 }],
  view_full: [{ windowSec: 3600, max: 60 }, { windowSec: 86_400, max: 300 }],
  download: [{ windowSec: 3600, max: 60 }, { windowSec: 86_400, max: 200 }],
  unlock: [{ windowSec: 3600, max: 30 }, { windowSec: 86_400, max: 150 }],
  match_list: [{ windowSec: 3600, max: 120 }],
  auth: [{ windowSec: 900, max: 20 }],
  register: [{ windowSec: 3600, max: 10 }],
  cv_upload: [{ windowSec: 30 * 86_400, max: 3 }, { windowSec: 86_400, max: 3 }],
};

export async function logAccess(db: Db, e: { actorKind: "company_user" | "candidate" | "admin"; actorId: string; companyId?: string | null; action: AccessAction; jdId?: string | null; candidateRef?: string | null; ipHash?: string; detail?: string }) {
  await db.prepare("INSERT INTO access_log (id, actor_kind, actor_id, company_id, action, jd_id, candidate_ref, ip_hash, detail, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(newId(), e.actorKind, e.actorId, e.companyId ?? null, e.action, e.jdId ?? null, e.candidateRef ?? null, e.ipHash ?? "", (e.detail ?? "").slice(0, 200), nowIso()).run();
}

/** Fixed-window counters in the existing rate_limits table. Returns false when over the limit. */
export async function withinLimits(db: Db, subject: string, action: string): Promise<{ ok: boolean; rule?: string }> {
  const nowSec = Math.floor(now().getTime() / 1000);
  for (const { windowSec, max } of LIMITS[action] ?? []) {
    const key = `portal:${action}:${windowSec}:${subject}`;
    const row = await db.prepare(`INSERT INTO rate_limits (key, window_start, hits) VALUES (?, ?, 1)
      ON CONFLICT(key) DO UPDATE SET window_start = CASE WHEN ? - rate_limits.window_start >= ? THEN ? ELSE rate_limits.window_start END,
        hits = CASE WHEN ? - rate_limits.window_start >= ? THEN 1 ELSE rate_limits.hits + 1 END RETURNING hits`)
      .bind(key, nowSec, nowSec, windowSec, nowSec, nowSec, windowSec).first<{ hits: number }>();
    if ((row?.hits ?? 0) > max) return { ok: false, rule: `${action} > ${max} per ${windowSec >= 86_400 ? "day" : "hour"}` };
  }
  return { ok: true };
}

/** Raise an abuse flag, at most one open flag per subject and rule. */
export async function flagAbuse(db: Db, subjectKind: "company_user" | "candidate", subjectId: string, companyId: string | null, rule: string, detail = "") {
  const open = await db.prepare("SELECT 1 FROM abuse_flags WHERE subject_id = ? AND rule = ? AND status = 'open'").bind(subjectId, rule).first();
  if (open) return;
  await db.prepare("INSERT INTO abuse_flags (id, subject_kind, subject_id, company_id, rule, detail, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)")
    .bind(newId(), subjectKind, subjectId, companyId, rule, detail.slice(0, 300), nowIso()).run();
}

/** Pattern checks run after each company list view: browsing many previews but unlocking almost none. */
export async function detectScraping(db: Db, userId: string, companyId: string) {
  const since = new Date(now().getTime() - 86_400_000).toISOString();
  const row = await db.prepare("SELECT SUM(action IN ('list','match_list')) AS views, SUM(action = 'unlock') AS unlocks, COUNT(DISTINCT jd_id) AS jds FROM access_log WHERE actor_id = ? AND at >= ?")
    .bind(userId, since).first<{ views: number | null; unlocks: number | null; jds: number | null }>();
  const views = row?.views ?? 0, unlocks = row?.unlocks ?? 0;
  if (views >= 200 && unlocks <= views / 100) await flagAbuse(db, "company_user", userId, companyId, "high_browse_low_unlock", `${views} list views and ${unlocks} unlocks in 24 hours`);
}

/** Wrap a guarded company action: check limits, log, flag on breach. */
export async function guard(db: Db, args: { userId: string; companyId: string; action: AccessAction; jdId?: string; candidateRef?: string; ipHash?: string }) {
  const limit = await withinLimits(db, args.userId, args.action);
  if (!limit.ok) {
    await flagAbuse(db, "company_user", args.userId, args.companyId, `rate:${args.action}`, limit.rule);
    await logAccess(db, { actorKind: "company_user", actorId: args.userId, companyId: args.companyId, action: args.action, jdId: args.jdId, candidateRef: args.candidateRef, ipHash: args.ipHash, detail: `blocked: ${limit.rule}` });
    return false;
  }
  await logAccess(db, { actorKind: "company_user", actorId: args.userId, companyId: args.companyId, action: args.action, jdId: args.jdId, candidateRef: args.candidateRef, ipHash: args.ipHash });
  return true;
}
