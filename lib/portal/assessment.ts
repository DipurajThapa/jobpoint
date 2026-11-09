// Assessments: platform skill tests (voluntary) and company tests attached to a
// JD. Classical test theory for Phase 1 (item p-values, point-biserial, KR-20);
// randomised forms; server-enforced time limits; retake cooldown and cap;
// recency-weighted pooled score of record with its standard error.
// An integrity flag puts an attempt on hold for review; it never penalises by itself.

import { audit, newId, now, nowIso, parseJson, PortalError, type Db } from "./db";

export const RETAKE_COOLDOWN_DAYS = 30, MAX_ATTEMPTS_PER_YEAR = 3, JOB_READY_CUT = 0.7, DEFAULT_SCORE_SD = 0.18, DEFAULT_RELIABILITY = 0.7;
const RAPID_MS = 2500;

// Content that must not appear in company-authored items (protected or irrelevant traits).
const PROHIBITED = /\b(religio\w*|caste|jati|gotra|marital|married|marry|pregnan\w*|husband|wife|father'?s|mother'?s|native place|hometown|age|date of birth|birth ?date|gender|sex|community|surname|blood group|horoscope|vegetarian|diet)\b/i;

export type ItemInput = { stem: string; options: string[]; answerIndex: number; difficulty?: number };

export function validateItems(items: ItemInput[]): string[] {
  const problems: string[] = [];
  items.forEach((it, i) => {
    if (!it.stem?.trim() || it.stem.length > 600) problems.push(`Question ${i + 1}: write a question of up to 600 characters.`);
    if (!Array.isArray(it.options) || it.options.length < 2 || it.options.length > 6 || it.options.some(o => !o?.trim())) problems.push(`Question ${i + 1}: give 2–6 non-empty options.`);
    if (!Number.isInteger(it.answerIndex) || it.answerIndex < 0 || it.answerIndex >= (it.options?.length ?? 0)) problems.push(`Question ${i + 1}: mark the correct option.`);
    if (PROHIBITED.test(`${it.stem} ${(it.options ?? []).join(" ")}`)) problems.push(`Question ${i + 1}: asks about a protected or irrelevant personal characteristic.`);
  });
  return problems;
}

export async function createAssessment(db: Db, input: { ownerKind: "platform" | "company"; companyId?: string | null; jdId?: string | null; skillId: string; title: string; description?: string; itemsPerForm: number; timeLimitSec: number; validityDays?: number; items: ItemInput[] }, actor: string) {
  const problems = validateItems(input.items);
  if (input.items.length < input.itemsPerForm) problems.push(`The item bank (${input.items.length}) must be at least as large as one form (${input.itemsPerForm}).`);
  if (input.itemsPerForm < 5 || input.itemsPerForm > 60) problems.push("A form needs 5–60 questions.");
  if (problems.length) throw new PortalError("INVALID_ASSESSMENT", problems.join(" "));
  const id = newId(), at = nowIso();
  await db.batch([
    db.prepare("INSERT INTO assessments (id, owner_kind, company_id, jd_id, skill_id, title, description, items_per_form, time_limit_sec, validity_days, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, input.ownerKind, input.companyId ?? null, input.jdId ?? null, input.skillId, input.title.slice(0, 160), (input.description ?? "").slice(0, 1000), input.itemsPerForm, input.timeLimitSec, input.validityDays ?? 365, input.ownerKind === "platform" ? "approved" : "pending", actor, at),
    ...input.items.map(it => db.prepare("INSERT INTO assessment_items (id, assessment_id, stem, options, answer_index, difficulty, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(newId(), id, it.stem.trim(), JSON.stringify(it.options.map(o => o.trim())), it.answerIndex, it.difficulty ?? null, at)),
  ]);
  await audit(db, actor, "assessment.created", "assessment", id, input.ownerKind);
  return id;
}

/** Admin review of a company assessment. Approval is required before candidates can take it. */
export async function decideAssessment(db: Db, assessmentId: string, approve: boolean, adminId: string) {
  const a = await db.prepare("SELECT status FROM assessments WHERE id = ?").bind(assessmentId).first<{ status: string }>();
  if (a?.status !== "pending") throw new PortalError("NOT_PENDING", "This assessment is not waiting for review.", 409);
  await db.prepare("UPDATE assessments SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?").bind(approve ? "approved" : "rejected", adminId, nowIso(), assessmentId).run();
  await audit(db, adminId, approve ? "assessment.approved" : "assessment.rejected", "assessment", assessmentId);
}

type FormItem = { itemId: string; perm: number[] };

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Start an attempt: enforces the retake cooldown and yearly cap, then assembles a randomised form. */
export async function startAttempt(db: Db, candidateId: string, assessmentId: string, opts: { jdId?: string | null; extraTime?: boolean } = {}) {
  const a = await db.prepare("SELECT id, status, items_per_form, time_limit_sec, owner_kind, jd_id FROM assessments WHERE id = ?").bind(assessmentId).first<{ id: string; status: string; items_per_form: number; time_limit_sec: number; owner_kind: string; jd_id: string | null }>();
  if (a?.status !== "approved") throw new PortalError("NOT_AVAILABLE", "This assessment is not available.", 404);
  const open = await db.prepare("SELECT id FROM assessment_attempts WHERE candidate_id = ? AND assessment_id = ? AND status = 'in_progress' AND deadline_at > ?").bind(candidateId, assessmentId, nowIso()).first<{ id: string }>();
  if (open) return { attemptId: open.id, resumed: true };
  const yearAgo = new Date(now().getTime() - 365 * 86_400_000).toISOString();
  const { results: past } = await db.prepare("SELECT started_at, form FROM assessment_attempts WHERE candidate_id = ? AND assessment_id = ? AND started_at >= ? ORDER BY started_at DESC").bind(candidateId, assessmentId, yearAgo).all<{ started_at: string; form: string }>();
  if (past.length >= MAX_ATTEMPTS_PER_YEAR) throw new PortalError("ATTEMPT_LIMIT", `You can take this assessment ${MAX_ATTEMPTS_PER_YEAR} times in 12 months.`, 429);
  if (past[0]) {
    const next = Date.parse(past[0].started_at) + RETAKE_COOLDOWN_DAYS * 86_400_000;
    if (next > now().getTime()) throw new PortalError("COOLDOWN", `You can retake this assessment after ${new Date(next).toISOString().slice(0, 10)}.`, 429);
  }
  const seen = new Set(past.flatMap(p => parseJson<FormItem[]>(p.form, []).map(f => f.itemId)));
  const { results: items } = await db.prepare("SELECT id, options, difficulty, exposure_count FROM assessment_items WHERE assessment_id = ? AND active = 1").bind(assessmentId).all<{ id: string; options: string; difficulty: number | null; exposure_count: number }>();
  if (items.length < a.items_per_form) throw new PortalError("NOT_AVAILABLE", "This assessment is not ready yet.", 409);
  // Prefer unseen, less-exposed items; stratify by difficulty so forms are comparable.
  const ranked = shuffle(items).sort((x, y) => Number(seen.has(x.id)) - Number(seen.has(y.id)) || x.exposure_count - y.exposure_count);
  const bands = [0, 1, 2].map(b => ranked.filter(it => (it.difficulty === null ? 1 : it.difficulty >= 0.75 ? 0 : it.difficulty >= 0.45 ? 1 : 2) === b));
  const chosen: typeof items = [];
  for (let i = 0; chosen.length < a.items_per_form; i++) for (const band of bands) if (band[i] && chosen.length < a.items_per_form) chosen.push(band[i]);
  const form: FormItem[] = shuffle(chosen).map(it => ({ itemId: it.id, perm: shuffle([...Array(parseJson<string[]>(it.options, []).length).keys()]) }));
  const id = newId(), start = now();
  const limit = Math.round(a.time_limit_sec * (opts.extraTime ? 1.5 : 1));
  await db.batch([
    db.prepare("INSERT INTO assessment_attempts (id, assessment_id, candidate_id, jd_id, form, started_at, deadline_at, status, items, integrity) VALUES (?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?)")
      .bind(id, assessmentId, candidateId, opts.jdId ?? a.jd_id, JSON.stringify(form), start.toISOString(), new Date(start.getTime() + limit * 1000).toISOString(), form.length, JSON.stringify({ extraTime: !!opts.extraTime })),
    ...form.map(f => db.prepare("UPDATE assessment_items SET exposure_count = exposure_count + 1 WHERE id = ?").bind(f.itemId)),
  ]);
  return { attemptId: id, resumed: false };
}

/** Questions for an attempt, with options in the attempt's own order and no answers. */
export async function attemptQuestions(db: Db, attemptId: string, candidateId: string) {
  const at = await db.prepare("SELECT form, deadline_at, status FROM assessment_attempts WHERE id = ? AND candidate_id = ?").bind(attemptId, candidateId).first<{ form: string; deadline_at: string; status: string }>();
  if (!at) throw new PortalError("NOT_FOUND", "Attempt not found.", 404);
  const form = parseJson<FormItem[]>(at.form, []);
  const out = [];
  for (const f of form) {
    const item = await db.prepare("SELECT stem, options FROM assessment_items WHERE id = ?").bind(f.itemId).first<{ stem: string; options: string }>();
    const options = parseJson<string[]>(item?.options, []);
    out.push({ itemId: f.itemId, stem: item?.stem ?? "", options: f.perm.map(i => options[i]) });
  }
  return { deadline: at.deadline_at, status: at.status, questions: out };
}

export type Answer = { itemId: string; choice: number | null; ms: number };
export type IntegrityEvents = { hidden: number; pastes: number };

/** Score an attempt on the server. Late submissions beyond a 30-second grace are marked expired. */
export async function submitAttempt(db: Db, attemptId: string, candidateId: string, answers: Answer[], events: IntegrityEvents) {
  const at = await db.prepare("SELECT a.form, a.started_at, a.deadline_at, a.status, a.integrity, s.reliability, a.assessment_id FROM assessment_attempts a JOIN assessments s ON s.id = a.assessment_id WHERE a.id = ? AND a.candidate_id = ?")
    .bind(attemptId, candidateId).first<{ form: string; started_at: string; deadline_at: string; status: string; integrity: string; reliability: number | null; assessment_id: string }>();
  if (!at) throw new PortalError("NOT_FOUND", "Attempt not found.", 404);
  if (at.status !== "in_progress") throw new PortalError("ALREADY_SUBMITTED", "This attempt has already been submitted.", 409);
  const late = now().getTime() > Date.parse(at.deadline_at) + 30_000;
  const form = parseJson<FormItem[]>(at.form, []);
  const byId = new Map(answers.filter(a => a && typeof a.itemId === "string").map(a => [a.itemId, a]));
  let correct = 0, rapid = 0;
  const statements = [];
  for (const [position, f] of form.entries()) {
    const item = await db.prepare("SELECT answer_index FROM assessment_items WHERE id = ?").bind(f.itemId).first<{ answer_index: number }>();
    const a = byId.get(f.itemId);
    const original = a && Number.isInteger(a.choice) && a.choice! >= 0 && a.choice! < f.perm.length ? f.perm[a.choice!] : null;
    const ms = a && Number.isFinite(a.ms) ? Math.max(0, Math.round(a.ms)) : null;
    const isRapid = original !== null && ms !== null && ms < RAPID_MS;
    // Rapid guesses count as incorrect so skipping hard items cannot inflate a score.
    const ok = original !== null && !isRapid && original === item?.answer_index;
    if (isRapid) rapid++;
    if (ok) correct++;
    statements.push(db.prepare("INSERT OR REPLACE INTO assessment_responses (attempt_id, item_id, position, choice, correct, response_ms) VALUES (?, ?, ?, ?, ?, ?)").bind(attemptId, f.itemId, position, original, ok ? 1 : 0, ms));
  }
  const n = form.length, x = n ? correct / n : 0;
  const reliability = at.reliability ?? DEFAULT_RELIABILITY;
  const sem = Math.max(Math.sqrt(Math.max(x * (1 - x), 0.04) / Math.max(1, n)), DEFAULT_SCORE_SD * Math.sqrt(1 - reliability));
  const integrity = { ...parseJson<Record<string, unknown>>(at.integrity, {}), hidden: Math.max(0, Math.round(events?.hidden ?? 0)), pastes: Math.max(0, Math.round(events?.pastes ?? 0)), rapid };
  const hold = integrity.hidden > 3 || integrity.pastes > 0 || rapid > n / 3;
  statements.push(db.prepare("UPDATE assessment_attempts SET status = ?, submitted_at = ?, raw_correct = ?, score = ?, sem = ?, integrity = ?, integrity_status = ? WHERE id = ?")
    .bind(late ? "expired" : "submitted", nowIso(), correct, x, sem, JSON.stringify(integrity), hold ? "review" : "ok", attemptId));
  await db.batch(statements);
  return { score: x, sem, status: late ? "expired" : "submitted", onHold: hold };
}

export type AttemptRecord = { score: number; sem: number; submitted_at: string };

/**
 * Score of record: recency-weighted pooled mean of valid attempts (half-life
 * 180 days), weighted by precision. Resists "retake until lucky": a lucky last
 * attempt is diluted by earlier ones, while genuine improvement still counts.
 */
export function scoreOfRecord(attempts: AttemptRecord[], at = now()): { x: number; e: number } | null {
  if (!attempts.length) return null;
  const w = attempts.map(a => Math.pow(2, -((at.getTime() - Date.parse(a.submitted_at)) / 86_400_000) / 180) / (a.sem * a.sem));
  const sw = w.reduce((s, x) => s + x, 0);
  const x = attempts.reduce((s, a, i) => s + w[i] * a.score, 0) / sw;
  const variance = attempts.reduce((s, a, i) => s + w[i] * w[i] * a.sem * a.sem, 0) / (sw * sw);
  return { x, e: Math.sqrt(variance) };
}

/** Valid platform skill scores for a candidate, keyed by skill id, scaled to the job-ready cut. */
export async function skillEvidence(db: Db, candidateId: string): Promise<Record<string, { y: number; e: number; label: string }>> {
  const { results } = await db.prepare(`SELECT s.skill_id, s.title, s.validity_days, a.score, a.sem, a.submitted_at FROM assessment_attempts a JOIN assessments s ON s.id = a.assessment_id
    WHERE a.candidate_id = ? AND s.owner_kind = 'platform' AND s.status = 'approved' AND a.status = 'submitted' AND a.integrity_status = 'ok' AND a.score IS NOT NULL`).bind(candidateId).all<{ skill_id: string; title: string; validity_days: number; score: number; sem: number; submitted_at: string }>();
  const groups = new Map<string, { title: string; attempts: AttemptRecord[] }>();
  for (const r of results) {
    if (Date.parse(r.submitted_at) + r.validity_days * 86_400_000 < now().getTime()) continue;
    const g = groups.get(r.skill_id) ?? { title: r.title, attempts: [] };
    g.attempts.push(r);
    groups.set(r.skill_id, g);
  }
  const out: Record<string, { y: number; e: number; label: string }> = {};
  for (const [skill, g] of groups) {
    const rec = scoreOfRecord(g.attempts);
    if (rec) out[skill] = { y: Math.min(1, rec.x / JOB_READY_CUT), e: rec.e / JOB_READY_CUT, label: `${g.title}: ${Math.round(rec.x * 100)}% (±${Math.round(rec.e * 100)})` };
  }
  return out;
}

/** The company assessment score for a JD, if the candidate took it. */
export async function companyEvidence(db: Db, candidateId: string, jdId: string) {
  const a = await db.prepare("SELECT id, items_per_form, reliability FROM assessments WHERE jd_id = ? AND owner_kind = 'company' AND status = 'approved' ORDER BY created_at DESC LIMIT 1").bind(jdId).first<{ id: string; items_per_form: number; reliability: number | null }>();
  if (!a) return undefined;
  const { results } = await db.prepare("SELECT score, sem, submitted_at FROM assessment_attempts WHERE assessment_id = ? AND candidate_id = ? AND status = 'submitted' AND integrity_status = 'ok' AND score IS NOT NULL").bind(a.id, candidateId).all<AttemptRecord>();
  const rec = scoreOfRecord(results);
  return { attached: true, coverage: 1, reliability: a.reliability, ...(rec ? { score: { y: Math.min(1, rec.x / JOB_READY_CUT), e: rec.e / JOB_READY_CUT } } : {}) };
}

/** Item statistics and KR-20 reliability once enough candidates have taken a test. */
export async function recomputeItemStats(db: Db, assessmentId: string, minAttempts = 30) {
  const { results: attempts } = await db.prepare("SELECT id, score FROM assessment_attempts WHERE assessment_id = ? AND status = 'submitted' AND integrity_status = 'ok'").bind(assessmentId).all<{ id: string; score: number }>();
  if (attempts.length < minAttempts) return null;
  const { results: rows } = await db.prepare("SELECT r.attempt_id, r.item_id, r.correct FROM assessment_responses r JOIN assessment_attempts a ON a.id = r.attempt_id WHERE a.assessment_id = ? AND a.status = 'submitted' AND a.integrity_status = 'ok'").bind(assessmentId).all<{ attempt_id: string; item_id: string; correct: number }>();
  const total = new Map(attempts.map(a => [a.id, a.score]));
  const byItem = new Map<string, { c: number; n: number; xs: number[]; ys: number[] }>();
  for (const r of rows) {
    const s = byItem.get(r.item_id) ?? { c: 0, n: 0, xs: [], ys: [] };
    s.n++; s.c += r.correct; s.xs.push(r.correct); s.ys.push(total.get(r.attempt_id) ?? 0);
    byItem.set(r.item_id, s);
  }
  const statements = [];
  let pqSum = 0;
  for (const [id, s] of byItem) {
    const p = s.c / s.n;
    pqSum += p * (1 - p);
    const my = s.ys.reduce((a, b) => a + b, 0) / s.n;
    const sy = Math.sqrt(s.ys.reduce((a, y) => a + (y - my) ** 2, 0) / s.n) || 1;
    const m1 = s.ys.filter((_, i) => s.xs[i] === 1), m0 = s.ys.filter((_, i) => s.xs[i] === 0);
    const rpb = m1.length && m0.length ? ((m1.reduce((a, b) => a + b, 0) / m1.length - m0.reduce((a, b) => a + b, 0) / m0.length) / sy) * Math.sqrt(p * (1 - p)) : 0;
    // Retire items that do not separate stronger from weaker candidates (point-biserial < .20 after 100 responses).
    statements.push(db.prepare("UPDATE assessment_items SET difficulty = ?, discrimination = ?, active = CASE WHEN ? >= 100 AND ? < 0.2 THEN 0 ELSE active END WHERE id = ?").bind(p, rpb, s.n, rpb, id));
  }
  const k = byItem.size, scores = attempts.map(a => a.score * k);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, s) => a + (s - mean) ** 2, 0) / scores.length;
  const kr20 = k > 1 && variance > 0 ? (k / (k - 1)) * (1 - pqSum / variance) : null;
  if (kr20 !== null) statements.push(db.prepare("UPDATE assessments SET reliability = ? WHERE id = ?").bind(Math.max(0, Math.min(1, kr20)), assessmentId));
  if (statements.length) await db.batch(statements);
  return { items: k, attempts: attempts.length, reliability: kr20 };
}

/**
 * Admin decision on an attempt held for integrity review. Clearing it lets the
 * score count; voiding it removes it from the score of record. Neither applies
 * a penalty. The caller re-scores the candidate afterwards.
 */
export async function decideHeldAttempt(db: Db, attemptId: string, accept: boolean, actor: string) {
  const row = await db.prepare("SELECT candidate_id FROM assessment_attempts WHERE id = ? AND integrity_status = 'review'").bind(attemptId).first<{ candidate_id: string }>();
  if (!row) throw new PortalError("NOT_FOUND", "No attempt on hold with that ID.", 404);
  await db.prepare("UPDATE assessment_attempts SET integrity_status = ? WHERE id = ? AND integrity_status = 'review'").bind(accept ? "ok" : "voided", attemptId).run();
  await audit(db, actor, accept ? "attempt.cleared" : "attempt.voided", "candidate", row.candidate_id, attemptId);
  return row.candidate_id;
}
