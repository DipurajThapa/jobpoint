// The written commitment a candidate accepts when an offer is made. It is created
// when a pipeline entry moves to "offered" and accepted through a one-time link (or
// from the candidate's inbox link). Leaving within 60 days of joining is recorded and shown
// to recruiters; it lowers shortlist priority only if PILOT_RULES.earlyLeaverLowerPriority is
// switched on (off during the pilot). No money is charged.
import { audit, newId, nowIso, PortalError, sha256Hex, type Db } from "./db";
import { notifyCandidate } from "./notify";

export const COMMITMENT_VERSION = "commitment-2026-11b";
export const EARLY_EXIT = { days: 60, lowPriorityMonths: 12 } as const;
export const commitmentText = (role: string) => [
  `I have received an offer for the role of ${role} through Jobboard300.`,
  "If I accept the offer, I will join on the agreed date and I intend to stay in the role for at least 60 days.",
  "If my plans change before joining, I will tell my Jobboard300 recruiter at once.",
  "I understand that Jobboard300 does not charge me any fee or penalty under this commitment.",
].join("\n");

const newToken = () => `${newId()}${newId()}`.replace(/-/g, "");

/** Create the commitment for a pipeline entry at offer stage (once) and send the candidate the link (a path on this site). */
export async function createCommitment(db: Db, pipelineId: string) {
  const p = await db.prepare("SELECT p.candidate_id, p.company_id, j.title FROM pipeline p JOIN jds j ON j.id = p.jd_id WHERE p.id = ?").bind(pipelineId).first<{ candidate_id: string; company_id: string; title: string }>();
  if (!p || await db.prepare("SELECT 1 AS x FROM candidate_commitments WHERE pipeline_id = ?").bind(pipelineId).first()) return null;
  const token = newToken();
  await db.prepare("INSERT INTO candidate_commitments (id, pipeline_id, candidate_id, company_id, version, body, token_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(newId(), pipelineId, p.candidate_id, p.company_id, COMMITMENT_VERSION, commitmentText(p.title), await sha256Hex(token), nowIso()).run();
  const link = `/commit?token=${token}`;
  await notifyCandidate(db, p.candidate_id, "commitment.requested", "Please confirm your commitment for this offer", "Before you join, please read and accept a short commitment about joining and staying at least 60 days. Use the button below.", p.company_id, link);
  return link;
}

/** Staff ask for a fresh link to send by hand (the old link stops working). Returns a path on this site; the candidate's inbox gets the new link too. Only while not yet accepted. */
export async function reissueCommitmentLink(db: Db, pipelineId: string, actor: string) {
  const c = await db.prepare("SELECT id, accepted_at FROM candidate_commitments WHERE pipeline_id = ?").bind(pipelineId).first<{ id: string; accepted_at: string | null }>();
  if (!c) throw new PortalError("NOT_FOUND", "There is no commitment for this candidate yet. It is created when an offer is made.", 404);
  if (c.accepted_at) throw new PortalError("ACCEPTED", "The candidate has already accepted.", 409);
  const token = newToken();
  await db.prepare("UPDATE candidate_commitments SET token_hash = ? WHERE id = ?").bind(await sha256Hex(token), c.id).run();
  await audit(db, actor, "commitment.link", "pipeline", pipelineId);
  // The first link stops working, so the candidate's inbox gets the new one.
  const p = await db.prepare("SELECT candidate_id, company_id FROM pipeline WHERE id = ?").bind(pipelineId).first<{ candidate_id: string; company_id: string }>();
  const link = `/commit?token=${token}`;
  if (p) await notifyCandidate(db, p.candidate_id, "commitment.requested", "A new link to confirm your commitment", "Your earlier link no longer works. Please use the button below to read and accept your commitment.", p.company_id, link);
  return link;
}

const byToken = async (db: Db, token: string) => {
  const c = /^[a-f0-9]{64}$/.test(token) ? await db.prepare("SELECT id, candidate_id, body, version, accepted_at FROM candidate_commitments WHERE token_hash = ?").bind(await sha256Hex(token)).first<{ id: string; candidate_id: string; body: string; version: string; accepted_at: string | null }>() : null;
  if (!c) throw new PortalError("NOT_FOUND", "This link is not valid. Ask your recruiter for a new one.", 404);
  return c;
};
export async function readCommitment(db: Db, token: string) { const c = await byToken(db, token); return { body: c.body, acceptedAt: c.accepted_at }; }
export async function acceptCommitment(db: Db, token: string, ipHash: string) {
  const c = await byToken(db, token);
  if (c.accepted_at) return { acceptedAt: c.accepted_at };
  const at = nowIso();
  await db.prepare("UPDATE candidate_commitments SET accepted_at = ?, ip_hash = ? WHERE id = ? AND accepted_at IS NULL").bind(at, ipHash, c.id).run();
  await audit(db, `candidate:${c.candidate_id}`, "commitment.accepted", "candidate_commitment", c.id, c.version);
  return { acceptedAt: at };
}
