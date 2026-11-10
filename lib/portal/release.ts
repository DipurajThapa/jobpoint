// A "release" is the record that a candidate was put in front of a client for a
// job. In the placement-fee model the only way that happens is a recruiter's
// submission (lib/portal/client.ts). Closing or pausing a job ends its releases.

import { nowIso, parseJson, type Db } from "./db";

/** Revoke all active releases of a JD that is paused or closed (candidates already in the pipeline stay there). */
export async function revokeJdReleases(db: Db, jdId: string, reason: "jd_closed" | "params_changed" | "admin") {
  await db.prepare("UPDATE releases SET revoked_at = ?, revoke_reason = ? WHERE jd_id = ? AND revoked_at IS NULL").bind(nowIso(), reason, jdId).run();
}

export const parseExplanation = (value: unknown) => parseJson<{ summary: string; meets: string[]; misses: string[]; why: string }>(value, { summary: "", meets: [], misses: [], why: "" });
