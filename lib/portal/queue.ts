// Scoring work queue. Every CV upload or correction, JD approval or change,
// parameter approval, application and assessment result enqueues work; the
// queue is drained in small, request-sized batches (and by a cron if the host
// provides one), then releases are re-evaluated for every affected JD.

import { nowIso, parseJson, type Db } from "./db";
import { ACTIVE_CONSENT_SQL } from "./consent";
import { currentParams } from "./company";
import { adaptiveEvidence } from "./adaptive";
import { scoreMatch, type MatchResult } from "./match";
import { runReleases } from "./release";
import type { PortalProfile } from "./profile";
import type { PortalRequirements } from "./jd";

const MAX_PAIRS_PER_RUN = 400;

type Cand = { id: string; cv_id: string; version: number; data: string };

async function activeCandidates(db: Db, ids?: string[]): Promise<Cand[]> {
  const filter = ids ? `AND c.id IN (${ids.map(() => "?").join(",")})` : "";
  const { results } = await db.prepare(`SELECT c.id, v.id AS cv_id, p.version, p.data FROM candidates c
      JOIN cvs v ON v.candidate_id = c.id AND v.is_primary = 1 AND v.parse_status = 'parsed'
      JOIN cv_profiles p ON p.cv_id = v.id AND p.version = (SELECT MAX(version) FROM cv_profiles WHERE cv_id = v.id)
      WHERE c.status = 'active' AND ${ACTIVE_CONSENT_SQL("c.id", "profile_processing")} ${filter}`).bind(...(ids ?? [])).all<Cand>();
  return results;
}

type Jd = { id: string; company_id: string; requirements: string };
async function liveJds(db: Db, ids?: string[]): Promise<Jd[]> {
  const filter = ids ? `AND j.id IN (${ids.map(() => "?").join(",")})` : "";
  const { results } = await db.prepare(`SELECT j.id, j.company_id, j.requirements FROM jds j JOIN companies c ON c.id = j.company_id WHERE j.status = 'live' AND c.status = 'active' ${filter}`).bind(...(ids ?? [])).all<Jd>();
  return results;
}

export function storedResult(r: MatchResult) {
  return JSON.stringify({ ...r.explanation, band: r.band, gaps: r.gaps, sd: r.sd, nearThreshold: r.nearThreshold, failedFilters: r.failedFilters, weights: r.weights, weightTrace: r.weightTrace, components: r.components, checks: r.checks.map(c => ({ requirement: c.requirement, kind: c.kind, status: c.status, mean: Math.round(c.mean * 100) / 100, sd: Math.round(c.sd * 100) / 100 })) });
}

async function scorePairs(db: Db, cands: Cand[], jds: Jd[]) {
  const paramsCache = new Map<string, Awaited<ReturnType<typeof currentParams>>>();
  const skillCache = new Map<string, Awaited<ReturnType<typeof adaptiveEvidence>>>();
  const statements = [];
  for (const jd of jds) {
    if (!paramsCache.has(jd.company_id)) paramsCache.set(jd.company_id, await currentParams(db, jd.company_id));
    const params = paramsCache.get(jd.company_id)?.params ?? null;
    const req = parseJson<PortalRequirements>(jd.requirements, null as unknown as PortalRequirements);
    for (const c of cands) {
      const profile = parseJson<PortalProfile>(c.data, null as unknown as PortalProfile);
      if (!profile?.india) continue;
      if (!skillCache.has(c.id)) skillCache.set(c.id, await adaptiveEvidence(db, c.id));
      const result = scoreMatch(profile, req, params, { skillScores: skillCache.get(c.id) });
      statements.push(db.prepare(`INSERT INTO matches (jd_id, candidate_id, cv_id, profile_version, score, lower_bound, hard_pass, failed_filters, explanation, engine_version, scored_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(jd_id, candidate_id) DO UPDATE SET cv_id = excluded.cv_id, profile_version = excluded.profile_version, score = excluded.score, lower_bound = excluded.lower_bound, hard_pass = excluded.hard_pass, failed_filters = excluded.failed_filters, explanation = excluded.explanation, engine_version = excluded.engine_version, scored_at = excluded.scored_at`)
        .bind(jd.id, c.id, c.cv_id, c.version, result.score, result.lowerBound, result.hardPass ? 1 : 0, JSON.stringify(result.failedFilters), storedResult(result), result.engineVersion, nowIso()));
      if (statements.length >= 50) await db.batch(statements.splice(0));
    }
  }
  if (statements.length) await db.batch(statements);
}

/** Drain up to a bounded number of candidate-JD pairs. Returns what was processed. */
export async function drainQueue(db: Db, secret: string, maxPairs = MAX_PAIRS_PER_RUN) {
  const { results: items } = await db.prepare("SELECT id, kind, ref_id FROM score_queue ORDER BY enqueued_at LIMIT 50").all<{ id: string; kind: "candidate" | "jd"; ref_id: string }>();
  const touched = new Set<string>();
  let pairs = 0, done = 0;
  for (const item of items) {
    if (item.kind === "candidate") {
      const cands = await activeCandidates(db, [item.ref_id]);
      const jds = await liveJds(db);
      if (pairs && pairs + jds.length > maxPairs) break;
      if (cands.length) await scorePairs(db, cands, jds);
      else await db.prepare("DELETE FROM matches WHERE candidate_id = ?").bind(item.ref_id).run();
      pairs += jds.length;
      jds.forEach(j => touched.add(j.id));
    } else {
      const jds = await liveJds(db, [item.ref_id]);
      const cands = jds.length ? await activeCandidates(db) : [];
      if (pairs && pairs + cands.length > maxPairs) break;
      if (jds.length) await scorePairs(db, cands, jds);
      pairs += cands.length;
      touched.add(item.ref_id);
    }
    await db.prepare("DELETE FROM score_queue WHERE id = ?").bind(item.id).run();
    done++;
  }
  const releases: Record<string, unknown> = {};
  for (const jdId of touched) releases[jdId] = await runReleases(db, jdId, secret);
  const left = await db.prepare("SELECT COUNT(*) AS n FROM score_queue").first<{ n: number }>();
  return { processed: done, pairs, remaining: left?.n ?? 0, releases };
}
