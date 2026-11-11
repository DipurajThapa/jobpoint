// Question banks, adaptive tests and Fast Track.
//
// Three kinds of test share one engine:
// - technical: a candidate on Fast Track takes it when they choose, to certify a skill;
// - aptitude: Jobboard300's aptitude and soft-skills test, sent to chosen candidates
//   when the client has opted for it on a job;
// - client: questions the client supplied (plus any Jobboard300 adds), sent to chosen
//   candidates for that client's jobs.
//
// A test starts at level 5 of 10. A correct answer raises the level and a wrong one
// lowers it, in steps of two for the first four questions and one after that, so the
// test settles near the level where the candidate gets about half right. The result
// is that level: 1 to 4 beginner, 5 to 7 intermediate, 8 to 10 expert. Questions are
// drawn at random from the bank and the answer options are shuffled for every sitting.
//
// Who sees what: the candidate sees their level; Fast Track candidates also see their
// weak topics. Staff see levels. Clients never see levels, scores or answers.

import { audit, newId, now, nowIso, parseJson, PortalError, sha256Hex, type Db } from "./db";
import { notifyCandidate } from "./notify";
import { PILOT_RULES } from "./policy";

export const TEST = { questions: 20, minutes: 25, startLevel: 5, levels: 10, cooldownDays: 30, validityDays: 365, inviteDays: 7 } as const;
export const KINDS = ["technical", "aptitude", "client"] as const;
export type Kind = typeof KINDS[number];
export const bandOf = (level: number) => level >= 8 ? "expert" : level >= 5 ? "intermediate" : "beginner";

// ---------- Question banks (admin and invigilators) ----------

export type QuestionInput = { level: number; topic?: string; stem: string; options: string[]; answerIndex: number; explanation?: string };

/** Why a question cannot be saved, or null. Options are shuffled at each sitting, so answers that depend on position are refused. */
export function questionProblem(q: QuestionInput): string | null {
  const stem = (q.stem ?? "").trim(), options = (q.options ?? []).map(o => String(o ?? "").trim());
  if (!Number.isInteger(q.level) || q.level < 1 || q.level > TEST.levels) return "The level must be a whole number from 1 to 10.";
  if (stem.length < 10) return "The question is too short.";
  if (options.length < 3 || options.length > 6) return "Give between three and six answer options.";
  if (options.some(o => !o)) return "An answer option is empty.";
  if (new Set(options.map(o => o.toLowerCase())).size !== options.length) return "Two answer options are the same.";
  if (options.some(o => /\b(all|none|both) of the above\b|\b(both|neither) [a-d] (and|nor) [a-d]\b|^[a-d] and [a-d]$/i.test(o))) return "Options are shuffled for each candidate, so \"all of the above\", \"none of the above\" and \"A and B\" cannot be used. Write the full answer instead.";
  if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex >= options.length) return "Mark which option is correct.";
  return null;
}

export async function createBank(db: Db, input: { kind: string; title: string; skillId?: string; companyId?: string | null; sample?: boolean }, actor: string) {
  if (!(KINDS as readonly string[]).includes(input.kind)) throw new PortalError("KIND", "Choose the kind of test.");
  const title = input.title.trim().slice(0, 160);
  if (title.length < 3) throw new PortalError("TITLE", "Give the question bank a name.");
  if (input.kind === "client") {
    if (!input.companyId || !await db.prepare("SELECT 1 AS x FROM companies WHERE id = ?").bind(input.companyId).first()) throw new PortalError("COMPANY", "Choose the client this test belongs to.");
  }
  const id = newId(), at = nowIso();
  await db.prepare("INSERT INTO question_banks (id, kind, title, skill_id, company_id, is_sample, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, input.kind, title, (input.skillId ?? "").trim().toLowerCase().slice(0, 60), input.kind === "client" ? input.companyId : null, input.sample ? 1 : 0, actor, at, at).run();
  await audit(db, actor, "bank.created", "question_bank", id, `${input.kind}: ${title}`);
  return id;
}

/** Add questions. Each is checked; bad or duplicate rows are reported and skipped, good rows are saved. */
export async function addQuestions(db: Db, bankId: string, questions: QuestionInput[], actor: string) {
  if (!await db.prepare("SELECT 1 AS x FROM question_banks WHERE id = ?").bind(bankId).first()) throw new PortalError("NOT_FOUND", "Question bank not found.", 404);
  if (!questions.length) throw new PortalError("EMPTY", "There are no questions to add.");
  if (questions.length > 500) throw new PortalError("TOO_MANY", "Add at most 500 questions at a time.");
  const errors: string[] = [], at = nowIso();
  let added = 0;
  for (const [i, q] of questions.entries()) {
    const problem = questionProblem(q);
    if (problem) { errors.push(`Row ${i + 1}: ${problem}`); continue; }
    const r = await db.prepare("INSERT OR IGNORE INTO bank_questions (id, bank_id, level, topic, stem, options, answer_index, explanation, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(newId(), bankId, q.level, (q.topic ?? "").trim().slice(0, 80), q.stem.trim().slice(0, 1000), JSON.stringify(q.options.map(o => String(o).trim().slice(0, 300))), q.answerIndex, (q.explanation ?? "").trim().slice(0, 600), actor, at).run();
    if (r.meta.changes) added++; else errors.push(`Row ${i + 1}: this question is already in the bank.`);
  }
  await db.prepare("UPDATE question_banks SET updated_at = ? WHERE id = ?").bind(at, bankId).run();
  await audit(db, actor, "bank.questions", "question_bank", bankId, `${added} added, ${errors.length} refused`);
  return { added, errors };
}

/** Rows of: level, topic, question, option 1..n, answer (a letter, A for the first option, or the option's exact text), explanation. First row may be a header. */
export function parseQuestionRows(text: string): { questions: QuestionInput[]; errors: string[] } {
  const rows: string[][] = [];
  let cell = "", row: string[] = [], quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === "," || c === "\t") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some(x => x.trim())) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some(x => x.trim())) rows.push(row);
  if (rows.length && /^level$/i.test(rows[0][0].trim())) rows.shift();
  const questions: QuestionInput[] = [], errors: string[] = [];
  rows.forEach((r, i) => {
    const cells = r.map(x => x.trim());
    if (cells.length < 7) { errors.push(`Row ${i + 1}: expected level, topic, question, at least three options, answer and (optionally) an explanation.`); return; }
    const [level, topic, stem, ...rest] = cells;
    // The answer is the last cell that names an option: a letter (A for the first option) or the option's exact text.
    // Anything after it is the explanation. Numbers are always read as text, because numeric options are common.
    const letter = (v: string, count: number) => /^[A-Fa-f]$/.test(v) && v.toUpperCase().charCodeAt(0) - 65 < count ? v.toUpperCase().charCodeAt(0) - 65 : -1;
    let answerAt = -1;
    for (let k = rest.length - 1; k >= 3; k--) { const v = rest[k]; if (v && (letter(v, k) >= 0 || rest.slice(0, k).some(o => o.toLowerCase() === v.toLowerCase()))) { answerAt = k; break; } }
    if (answerAt < 0) { errors.push(`Row ${i + 1}: the answer must be a letter (A for the first option) or the exact text of one option.`); return; }
    const options = rest.slice(0, answerAt).filter(Boolean), a = rest[answerAt];
    const byText = options.findIndex(o => o.toLowerCase() === a.toLowerCase()), byLetter = letter(a, options.length);
    if (byText >= 0 && byLetter >= 0 && byText !== byLetter) { errors.push(`Row ${i + 1}: the answer "${a}" could mean option ${a.toUpperCase()} or the option with that text. Reword the option.`); return; }
    const answerIndex = byText >= 0 ? byText : byLetter;
    questions.push({ level: Number(level), topic, stem, options, answerIndex, explanation: rest.slice(answerAt + 1).join(", ") });
  });
  return { questions, errors };
}

export async function bankSummary(db: Db, bankId?: string) {
  const { results } = await db.prepare(`SELECT b.id, b.kind, b.title, b.skill_id, b.company_id, b.status, b.is_sample, b.updated_at, c.display_name AS company,
      (SELECT COUNT(*) FROM bank_questions q WHERE q.bank_id = b.id AND q.active = 1) AS questions,
      (SELECT COUNT(DISTINCT q.level) FROM bank_questions q WHERE q.bank_id = b.id AND q.active = 1) AS levels,
      (SELECT COUNT(*) FROM adaptive_tests t WHERE t.bank_id = b.id AND t.status = 'completed') AS completed
    FROM question_banks b LEFT JOIN companies c ON c.id = b.company_id ${bankId ? "WHERE b.id = ?" : ""} ORDER BY b.kind, b.title`).bind(...(bankId ? [bankId] : [])).all<{ id: string; kind: Kind; title: string; status: string; questions: number; levels: number }>();
  return results;
}

export async function bankQuestions(db: Db, bankId: string) {
  const { results } = await db.prepare("SELECT id, level, topic, stem, options, answer_index, explanation, active FROM bank_questions WHERE bank_id = ? ORDER BY level, created_at LIMIT 2000").bind(bankId).all<{ options: string }>();
  return results.map(r => ({ ...r, options: parseJson<string[]>(r.options, []) }));
}

/** A bank can go live once it has enough questions for one sitting; fewer than ten per level is allowed but reported. */
export async function setBankStatus(db: Db, bankId: string, status: string, actor: string) {
  if (!["draft", "active", "retired"].includes(status)) throw new PortalError("STATUS", "Choose draft, active or retired.");
  const [bank] = await bankSummary(db, bankId);
  if (!bank) throw new PortalError("NOT_FOUND", "Question bank not found.", 404);
  if (status === "active" && bank.questions < TEST.questions) throw new PortalError("TOO_FEW", `A test asks ${TEST.questions} questions, so the bank needs at least ${TEST.questions} active questions. It has ${bank.questions}.`);
  await db.prepare("UPDATE question_banks SET status = ?, updated_at = ? WHERE id = ?").bind(status, nowIso(), bankId).run();
  await audit(db, actor, "bank.status", "question_bank", bankId, status);
  return { thin: status === "active" && (bank.levels < TEST.levels || bank.questions < TEST.levels * 10) };
}

export async function setQuestionActive(db: Db, questionId: string, active: boolean, actor: string) {
  const r = await db.prepare("UPDATE bank_questions SET active = ? WHERE id = ?").bind(active ? 1 : 0, questionId).run();
  if (!r.meta.changes) throw new PortalError("NOT_FOUND", "Question not found.", 404);
  await audit(db, actor, "bank.question", "bank_question", questionId, active ? "restored" : "withdrawn");
}

/** Working sample banks: arithmetic and number-base questions whose answers are computed, so marking can be checked. */
export async function loadSampleBanks(db: Db, actor: string) {
  if (await db.prepare("SELECT 1 AS x FROM question_banks WHERE is_sample = 1").first()) throw new PortalError("EXISTS", "The sample banks are already loaded.", 409);
  const make = (kind: Kind) => {
    const out: QuestionInput[] = [];
    for (let level = 1; level <= TEST.levels; level++) for (let n = 0; n < 12; n++) {
      const a = level * 7 + n * 3 + 2, b = level * 2 + n + 3;
      let stem: string, answer: number, topic: string;
      if (kind === "aptitude") {
        if (n % 3 === 0) { topic = "Percentages"; answer = a * b; stem = `Sample L${level}.${n + 1}: What is ${b * 10}% of ${a * 10}?`; }
        else if (n % 3 === 1) { topic = "Number series"; answer = a + 4 * b; stem = `Sample L${level}.${n + 1}: What comes next in the series ${a}, ${a + b}, ${a + 2 * b}, ${a + 3 * b}?`; }
        else { topic = "Ratios"; answer = a * (b + 1); stem = `Sample L${level}.${n + 1}: Two amounts are in the ratio 1 : ${b}. The smaller is ${a}. What is their total?`; }
      } else {
        if (n % 3 === 0) { topic = "Operators"; answer = a % b; stem = `Sample L${level}.${n + 1}: What is the value of ${a} % ${b} (remainder after division)?`; }
        else if (n % 3 === 1) { topic = "Number bases"; answer = a + b; stem = `Sample L${level}.${n + 1}: What is the decimal value of binary ${(a + b).toString(2)}?`; }
        else { topic = "Expressions"; answer = a + b * level; stem = `Sample L${level}.${n + 1}: What does ${a} + ${b} * ${level} evaluate to under normal operator precedence?`; }
      }
      const low = answer - (level + n + 3);
      const options = [answer, answer + level + 1, answer + 2 * n + 25, low > 0 ? low : answer + 1000 + n].map(String);
      out.push({ level, topic, stem, options, answerIndex: 0, explanation: `Computed answer: ${answer}.` });
    }
    return out;
  };
  const ids: string[] = [];
  for (const [kind, title, skill] of [["technical", "Sample technical test (replace with real questions)", "sample"], ["aptitude", "Sample aptitude test (replace with real questions)", ""]] as const) {
    const id = await createBank(db, { kind, title, skillId: skill, sample: true }, actor);
    const r = await addQuestions(db, id, make(kind), actor);
    if (r.errors.length) throw new PortalError("SAMPLE", `Sample questions failed their own checks: ${r.errors[0]}`, 500);
    await setBankStatus(db, id, "active", actor);
    ids.push(id);
  }
  return ids;
}

// ---------- Fast Track (paid candidate package) ----------

export async function setting(db: Db, key: string) { return (await db.prepare("SELECT value FROM portal_settings WHERE key = ?").bind(key).first<{ value: string }>())?.value ?? ""; }
export async function saveFastTrackSettings(db: Db, priceInr: number, payNote: string, admin: string) {
  const price = Math.round(Number(priceInr));
  if (!(price >= 1 && price <= 500_000)) throw new PortalError("PRICE", "Enter the Fast Track price in rupees.");
  if (payNote.trim().length < 10) throw new PortalError("PAY_NOTE", "Say how the candidate pays: for example the UPI ID or bank details, and to quote the reference.");
  const at = nowIso(), put = (k: string, v: string) => db.prepare("INSERT INTO portal_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at").bind(k, v, admin, at);
  await db.batch([put("fast_track_price_inr", String(price)), put("fast_track_pay_note", payNote.trim().slice(0, 600))]);
  await audit(db, admin, "fast_track.settings", "settings", "fast_track", `INR ${price}`);
}
export const fastTrackOffer = async (db: Db) => ({ priceInr: Number(await setting(db, "fast_track_price_inr")) || null, payNote: await setting(db, "fast_track_pay_note") });
export const isFastTrack = async (db: Db, candidateId: string) => !!(await db.prepare("SELECT fast_track_at FROM candidates WHERE id = ?").bind(candidateId).first<{ fast_track_at: string | null }>())?.fast_track_at;

/** The candidate asks for Fast Track: an order with a payment reference. They become Fast Track only when the admin confirms the money arrived. */
export async function requestFastTrack(db: Db, candidateId: string) {
  if (!PILOT_RULES.fastTrack) throw new PortalError("NOT_OFFERED", "Fast Track is not offered at the moment. Registering and applying are free, and payment never affects who is shortlisted.", 409);
  if (await isFastTrack(db, candidateId)) throw new PortalError("ALREADY", "You are already on Fast Track.", 409);
  const offer = await fastTrackOffer(db);
  if (!offer.priceInr) throw new PortalError("NOT_OPEN", "Fast Track is not open for payment yet.", 409);
  const open = await db.prepare("SELECT id, reference, amount_inr FROM orders WHERE kind = 'fast_track' AND candidate_id = ? AND status = 'awaiting_payment'").bind(candidateId).first<{ id: string; reference: string; amount_inr: number }>();
  if (open) return { ...open, payNote: offer.payNote, created: false };
  const id = newId(), reference = `FT-${newId().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  await db.prepare("INSERT INTO orders (id, candidate_id, reference, amount_inr, created_at) VALUES (?, ?, ?, ?, ?)").bind(id, candidateId, reference, offer.priceInr, nowIso()).run();
  await audit(db, `candidate:${candidateId}`, "fast_track.requested", "fast_track_order", id, reference);
  return { id, reference, amount_inr: offer.priceInr, payNote: offer.payNote, created: true };
}

export async function fastTrackOrders(db: Db) {
  return (await db.prepare(`SELECT o.id, o.reference, o.amount_inr, o.status, o.created_at, o.paid_at, o.note, k.display_name FROM orders o JOIN candidates k ON k.id = o.candidate_id ORDER BY CASE o.status WHEN 'awaiting_payment' THEN 0 ELSE 1 END, o.created_at DESC LIMIT 200`).all()).results;
}

/** The admin confirms payment was received (or cancels the order). Confirmation is what marks the candidate Fast Track. */
export async function decideFastTrackOrder(db: Db, orderId: string, paid: boolean, note: string, admin: string) {
  const o = await db.prepare("SELECT candidate_id, status, reference FROM orders WHERE kind = 'fast_track' AND id = ?").bind(orderId).first<{ candidate_id: string; status: string; reference: string }>();
  if (!o) throw new PortalError("NOT_FOUND", "Order not found.", 404);
  if (o.status !== "awaiting_payment") throw new PortalError("DECIDED", "This order was already decided.", 409);
  if (paid && note.trim().length < 3) throw new PortalError("NOTE", "Record how the payment was received (for example the UPI or bank reference).");
  const at = nowIso();
  await db.batch([
    db.prepare("UPDATE orders SET status = ?, paid_at = ?, confirmed_by = ?, note = ? WHERE id = ? AND status = 'awaiting_payment'").bind(paid ? "paid" : "cancelled", paid ? at : null, admin, note.trim().slice(0, 300), orderId),
    ...(paid ? [db.prepare("UPDATE candidates SET fast_track_at = ? WHERE id = ? AND fast_track_at IS NULL").bind(at, o.candidate_id)] : []),
  ]);
  await audit(db, admin, paid ? "fast_track.paid" : "fast_track.cancelled", "fast_track_order", orderId, o.reference);
  if (paid) await notifyCandidate(db, o.candidate_id, "fast_track.active", "You are on Fast Track", "We have received your payment. You can now take the technical tests that match your skills, see your weak topics after each test and what to prepare next.");
}

// ---------- Sitting a test ----------

type Test = { id: string; bank_id: string; candidate_id: string; status: string; level: number; asked: number; correct: number; current_question_id: string | null; current_order: string | null; deadline_at: string | null; final_level: number | null; band: string | null };
const shuffled = (n: number) => { const xs = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; } return xs; };
const getTest = async (db: Db, testId: string, candidateId: string) => {
  const t = await db.prepare("SELECT id, bank_id, candidate_id, status, level, asked, correct, current_question_id, current_order, deadline_at, final_level, band FROM adaptive_tests WHERE id = ? AND candidate_id = ?").bind(testId, candidateId).first<Test>();
  if (!t) throw new PortalError("NOT_FOUND", "Test not found.", 404);
  return t;
};

/** A Fast Track candidate starts a technical test of their choice. */
export async function startTechnicalTest(db: Db, candidateId: string, bankId: string) {
  const bank = await db.prepare("SELECT kind, status FROM question_banks WHERE id = ?").bind(bankId).first<{ kind: string; status: string }>();
  if (!bank || bank.status !== "active" || bank.kind !== "technical") throw new PortalError("NOT_FOUND", "Test not found.", 404);
  if (!await isFastTrack(db, candidateId)) throw new PortalError("FAST_TRACK", "Technical tests are part of Fast Track.", 402);
  const last = await db.prepare("SELECT id, status, completed_at FROM adaptive_tests WHERE candidate_id = ? AND bank_id = ? ORDER BY created_at DESC LIMIT 1").bind(candidateId, bankId).first<{ id: string; status: string; completed_at: string | null }>();
  if (last?.status === "in_progress") return { id: last.id, resumed: true };
  if (last?.completed_at && Date.parse(last.completed_at) + TEST.cooldownDays * 86_400_000 > now().getTime()) throw new PortalError("COOLDOWN", `You can retake this test ${TEST.cooldownDays} days after your last attempt.`, 409);
  const id = newId();
  await db.prepare("INSERT INTO adaptive_tests (id, bank_id, candidate_id, status, level, created_at) VALUES (?, ?, ?, 'invited', ?, ?)").bind(id, bankId, candidateId, TEST.startLevel, nowIso()).run();
  await begin(db, id);
  return { id, resumed: false };
}

/** Staff send an aptitude or client test to one candidate. Returns a one-time link; the candidate needs no account. */
export async function inviteToTest(db: Db, input: { bankId: string; candidateId: string; jdId: string; companyId: string }, staffId: string) {
  const bank = await db.prepare("SELECT kind, status, company_id, title FROM question_banks WHERE id = ?").bind(input.bankId).first<{ kind: Kind; status: string; company_id: string | null; title: string }>();
  if (!bank || bank.status !== "active" || bank.kind === "technical") throw new PortalError("NOT_FOUND", "Test not found.", 404);
  if (bank.kind === "client" && bank.company_id !== input.companyId) throw new PortalError("NOT_FOUND", "Test not found.", 404);
  if (bank.kind === "aptitude" && !(await db.prepare("SELECT aptitude_test FROM jds WHERE id = ?").bind(input.jdId).first<{ aptitude_test: number }>())?.aptitude_test) throw new PortalError("NOT_OPTED", "The client has not opted for the aptitude test on this job.", 409);
  if (await db.prepare("SELECT 1 AS x FROM adaptive_tests WHERE candidate_id = ? AND bank_id = ? AND jd_id = ? AND status IN ('invited','in_progress','completed')").bind(input.candidateId, input.bankId, input.jdId).first()) throw new PortalError("ALREADY", "This candidate already has this test for this job.", 409);
  const id = newId(), token = `${newId()}${newId()}`.replace(/-/g, "");
  await db.prepare("INSERT INTO adaptive_tests (id, bank_id, candidate_id, jd_id, invited_by, token_hash, status, level, deadline_at, created_at) VALUES (?, ?, ?, ?, ?, ?, 'invited', ?, ?, ?)")
    .bind(id, input.bankId, input.candidateId, input.jdId, staffId, await sha256Hex(token), TEST.startLevel, new Date(now().getTime() + TEST.inviteDays * 86_400_000).toISOString(), nowIso()).run();
  const link = `/test?token=${token}`;
  await audit(db, staffId, "test.invited", "adaptive_test", id, bank.kind);
  await notifyCandidate(db, input.candidateId, "test.invited", "You have a test to take", `As part of a role you are being considered for, please take a short test (${TEST.questions} questions, about ${TEST.minutes} minutes) within ${TEST.inviteDays} days. Use the button below to start.`, input.companyId, link);
  return { id, link };
}

export async function testByToken(db: Db, token: string) {
  const t = /^[a-f0-9]{64}$/.test(token) ? await db.prepare("SELECT id, candidate_id FROM adaptive_tests WHERE token_hash = ?").bind(await sha256Hex(token)).first<{ id: string; candidate_id: string }>() : null;
  if (!t) throw new PortalError("NOT_FOUND", "This test link is not valid.", 404);
  return t;
}

async function begin(db: Db, testId: string) {
  await db.prepare("UPDATE adaptive_tests SET status = 'in_progress', started_at = ?, deadline_at = ? WHERE id = ? AND status = 'invited'").bind(nowIso(), new Date(now().getTime() + TEST.minutes * 60_000).toISOString(), testId).run();
}

async function finish(db: Db, t: Test) {
  const { results } = await db.prepare("SELECT level, topic, correct FROM adaptive_answers WHERE test_id = ? ORDER BY position").bind(t.id).all<{ level: number; topic: string; correct: number }>();
  if (!results.length) { await db.prepare("UPDATE adaptive_tests SET status = 'expired', completed_at = ?, current_question_id = NULL WHERE id = ?").bind(nowIso(), t.id).run(); return; }
  // The level the test settled at: the average level of the last ten questions, moved one step by the last answer.
  const tail = results.slice(-10), last = results[results.length - 1];
  const settled = (tail.reduce((s, r) => s + r.level, 0) + (last.level + (last.correct ? 1 : -1))) / (tail.length + 1);
  const level = Math.max(1, Math.min(TEST.levels, Math.round(settled)));
  const topics = new Map<string, { n: number; right: number }>();
  for (const r of results) if (r.topic) { const g = topics.get(r.topic) ?? { n: 0, right: 0 }; g.n++; g.right += r.correct; topics.set(r.topic, g); }
  const weak = [...topics].filter(([, g]) => g.n >= 2 && g.right / g.n < 0.5).sort((a, b) => a[1].right / a[1].n - b[1].right / b[1].n).map(([topic]) => topic).slice(0, 5);
  await db.prepare("UPDATE adaptive_tests SET status = 'completed', completed_at = ?, final_level = ?, band = ?, weak_topics = ?, current_question_id = NULL, current_order = NULL WHERE id = ?")
    .bind(nowIso(), level, bandOf(level), JSON.stringify(weak), t.id).run();
}

/** The next question for a sitting, or the result once it is over. Never includes which option is correct. */
export async function testStep(db: Db, testId: string, candidateId: string, opts: { start?: boolean } = {}) {
  let t = await getTest(db, testId, candidateId);
  const bank = await db.prepare("SELECT title, kind FROM question_banks WHERE id = ?").bind(t.bank_id).first<{ title: string; kind: Kind }>();
  const head = { id: t.id, title: bank?.title ?? "Test", kind: bank?.kind, total: TEST.questions, minutes: TEST.minutes };
  if (t.status === "invited") {
    if (t.deadline_at && t.deadline_at < nowIso()) { await db.prepare("UPDATE adaptive_tests SET status = 'expired' WHERE id = ?").bind(t.id).run(); return { ...head, state: "expired" as const }; }
    if (!opts.start) return { ...head, state: "ready" as const };
    await begin(db, t.id); t = await getTest(db, testId, candidateId);
  }
  if (t.status === "in_progress" && (t.asked >= TEST.questions || (t.deadline_at ?? "") < nowIso())) { await finish(db, t); t = await getTest(db, testId, candidateId); }
  if (t.status === "expired") return { ...head, state: "expired" as const };
  if (t.status === "completed") return { ...head, state: "done" as const, ...(await resultFor(db, t.id, candidateId)) };
  if (!t.current_question_id) {
    // A question at the current level that this sitting has not used; if that level is exhausted, the nearest level that has one.
    const q = await db.prepare(`SELECT id, options FROM bank_questions WHERE bank_id = ? AND active = 1 AND id NOT IN (SELECT question_id FROM adaptive_answers WHERE test_id = ?)
      ORDER BY ABS(level - ?), RANDOM() LIMIT 1`).bind(t.bank_id, t.id, t.level).first<{ id: string; options: string }>();
    if (!q) { await finish(db, t); return { ...head, state: "done" as const, ...(await resultFor(db, t.id, candidateId)) }; }
    await db.prepare("UPDATE adaptive_tests SET current_question_id = ?, current_order = ? WHERE id = ?").bind(q.id, JSON.stringify(shuffled(parseJson<string[]>(q.options, []).length)), t.id).run();
    t = await getTest(db, testId, candidateId);
  }
  const q = await db.prepare("SELECT stem, options FROM bank_questions WHERE id = ?").bind(t.current_question_id).first<{ stem: string; options: string }>();
  const options = parseJson<string[]>(q?.options, []), order = parseJson<number[]>(t.current_order, []);
  return { ...head, state: "question" as const, number: t.asked + 1, deadline: t.deadline_at, question: { stem: q?.stem ?? "", options: order.map(i => options[i]) } };
}

/** Record the answer to the current question (the choice is the position shown to the candidate) and move the level. */
export async function answerTest(db: Db, testId: string, candidateId: string, choice: number | null) {
  const t = await getTest(db, testId, candidateId);
  if (t.status !== "in_progress" || !t.current_question_id) throw new PortalError("NO_QUESTION", "There is no question waiting for an answer.", 409);
  if ((t.deadline_at ?? "") >= nowIso()) {
    const q = await db.prepare("SELECT level, topic, answer_index FROM bank_questions WHERE id = ?").bind(t.current_question_id).first<{ level: number; topic: string; answer_index: number }>();
    const order = parseJson<number[]>(t.current_order, []);
    const picked = choice === null || !Number.isInteger(choice) || choice < 0 || choice >= order.length ? null : order[choice];
    const right = picked !== null && picked === q?.answer_index ? 1 : 0, step = t.asked < 4 ? 2 : 1;
    const level = Math.max(1, Math.min(TEST.levels, t.level + (right ? step : -step)));
    const r = await db.batch([
      db.prepare("UPDATE adaptive_tests SET asked = asked + 1, correct = correct + ?, level = ?, current_question_id = NULL, current_order = NULL WHERE id = ? AND current_question_id = ?").bind(right, level, t.id, t.current_question_id),
      db.prepare("INSERT OR IGNORE INTO adaptive_answers (test_id, position, question_id, level, topic, choice, correct, answered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(t.id, t.asked + 1, t.current_question_id, q?.level ?? t.level, q?.topic ?? "", picked, right, nowIso()),
    ]) as { meta: { changes?: number } }[];
    if (!r[0]?.meta.changes) throw new PortalError("CONFLICT", "That question was already answered.", 409);
  }
  return testStep(db, testId, candidateId);
}

/** What the candidate may see of a finished test: their level always; weak topics only on Fast Track. */
export async function resultFor(db: Db, testId: string, candidateId: string) {
  const t = await db.prepare("SELECT final_level, band, weak_topics, completed_at FROM adaptive_tests WHERE id = ? AND candidate_id = ? AND status = 'completed'").bind(testId, candidateId).first<{ final_level: number; band: string; weak_topics: string; completed_at: string }>();
  if (!t) return { level: null, band: null, weakTopics: null, completedAt: null };
  return { level: t.final_level, band: t.band, completedAt: t.completed_at, weakTopics: await isFastTrack(db, candidateId) ? parseJson<string[]>(t.weak_topics, []) : null };
}

/** The candidate's test page: Fast Track status, technical tests suited to their skills first, invitations and past results. */
export async function candidateTests(db: Db, candidateId: string, profileSkills: string[]) {
  const fastTrack = await isFastTrack(db, candidateId), offer = await fastTrackOffer(db);
  const order = await db.prepare("SELECT reference, amount_inr FROM orders WHERE kind = 'fast_track' AND candidate_id = ? AND status = 'awaiting_payment'").bind(candidateId).first();
  const skills = new Set(profileSkills.map(s => s.toLowerCase()));
  const { results: banks } = await db.prepare("SELECT id, title, skill_id FROM question_banks WHERE kind = 'technical' AND status = 'active' ORDER BY title").all<{ id: string; title: string; skill_id: string }>();
  const { results: tests } = await db.prepare(`SELECT t.id, t.bank_id, t.status, t.final_level, t.band, t.weak_topics, t.completed_at, t.deadline_at, b.title, b.kind FROM adaptive_tests t JOIN question_banks b ON b.id = t.bank_id WHERE t.candidate_id = ? ORDER BY t.created_at DESC LIMIT 50`)
    .bind(candidateId).all<{ weak_topics: string; status: string }>();
  return {
    fastTrack, fastTrackOffered: PILOT_RULES.fastTrack, offer: { priceInr: offer.priceInr, payNote: order ? offer.payNote : "" }, order, test: { questions: TEST.questions, minutes: TEST.minutes },
    technical: banks.map(b => ({ id: b.id, title: b.title, suggested: skills.has(b.skill_id) })).sort((a, b) => Number(b.suggested) - Number(a.suggested)),
    tests: tests.map(t => ({ ...t, weak_topics: undefined, weakTopics: fastTrack && t.status === "completed" ? parseJson<string[]>(t.weak_topics, []) : null })),
  };
}

/** Verified technical levels as evidence for ranking: a strong result lifts the candidate for that skill; paying alone does nothing. */
export async function adaptiveEvidence(db: Db, candidateId: string): Promise<Record<string, { y: number; e: number; label: string }>> {
  // Technical tests are part of the paid package: while that is so, their results must not change the ranking.
  if (!PILOT_RULES.paidResultsAffectSelection) return {};
  const since = new Date(now().getTime() - TEST.validityDays * 86_400_000).toISOString();
  const { results } = await db.prepare(`SELECT b.skill_id, b.title, t.final_level FROM adaptive_tests t JOIN question_banks b ON b.id = t.bank_id
    WHERE t.candidate_id = ? AND t.status = 'completed' AND b.kind = 'technical' AND b.is_sample = 0 AND b.skill_id != '' AND t.completed_at >= ? ORDER BY t.completed_at`).bind(candidateId, since).all<{ skill_id: string; title: string; final_level: number }>();
  const out: Record<string, { y: number; e: number; label: string }> = {};
  for (const r of results) out[r.skill_id] = { y: r.final_level / TEST.levels, e: 0.1, label: `${r.title}: verified by test` };
  return out;
}

/** Staff view of a candidate's test results for a job (levels are for staff only). */
export async function testsForPipeline(db: Db, jdId: string) {
  return (await db.prepare(`SELECT t.candidate_id, t.status, t.final_level, t.band, b.title, b.kind FROM adaptive_tests t JOIN question_banks b ON b.id = t.bank_id WHERE t.jd_id = ? ORDER BY t.created_at`).bind(jdId).all<{ candidate_id: string; status: string; final_level: number | null; band: string | null; title: string; kind: string }>()).results;
}
