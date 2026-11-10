// Notifications, all in one table (messages). Every hiring event writes one message to the candidate's inbox
// and, where the client should know, one notice for the company. Each candidate
// message is also placed on an outbound queue for WhatsApp so that a provider
// can be plugged in later without touching the events: today nothing is sent,
// and rows are recorded as "queued" (a sender number is configured) or
// "skipped" (none is).
//
// WhatsApp sender: each team (a franchise is a team) can set its own number in
// the Recruiting tool. A candidate hears from the team that owns the client;
// the admin's number is the fallback, and the admin can switch on an override
// so that all messages go from the admin's number.
//
// Candidates are told the result of each stage, never interviewer notes,
// ratings or scores.

import { newId, nowIso, PortalError, type Db } from "./db";

export type Sender = { scope: string; number: string } | null;

/** Which WhatsApp number a message about this client's job goes from. */
export async function resolveSender(db: Db, companyId: string | null): Promise<Sender> {
  const admin = await db.prepare("SELECT whatsapp_number AS number, whatsapp_enabled AS enabled, admin_override AS override FROM messaging_settings WHERE scope = 'admin'").first<{ number: string; enabled: number; override: number }>();
  const adminSender = admin?.enabled && admin.number ? { scope: "admin", number: admin.number } : null;
  if (adminSender && admin!.override) return adminSender;
  if (companyId) {
    const team = await db.prepare(`SELECT m.scope, m.whatsapp_number AS number FROM companies c JOIN messaging_settings m ON m.scope = 'team:' || c.team_id
      WHERE c.id = ? AND m.whatsapp_enabled = 1 AND m.whatsapp_number != ''`).bind(companyId).first<{ scope: string; number: string }>();
    if (team) return team;
  }
  return adminSender;
}

const cleanNumber = (v: string) => { const d = v.replace(/[^\d+]/g, ""); return /^\+?\d{10,15}$/.test(d) ? d : ""; };

/** Save a WhatsApp set-up. `scope` is "admin" or "team:<id>"; the caller has already checked who may change it. */
export async function saveMessaging(db: Db, scope: string, input: { number: string; enabled: boolean; override?: boolean }, actor: string) {
  const number = cleanNumber(input.number ?? "");
  if (input.enabled && !number) throw new PortalError("NUMBER", "Enter the WhatsApp number with country code, for example +91 98300 12345.");
  await db.prepare(`INSERT INTO messaging_settings (scope, whatsapp_number, whatsapp_enabled, admin_override, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(scope) DO UPDATE SET whatsapp_number = excluded.whatsapp_number, whatsapp_enabled = excluded.whatsapp_enabled, admin_override = excluded.admin_override, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
    .bind(scope, number, input.enabled ? 1 : 0, scope === "admin" && input.override ? 1 : 0, actor, nowIso()).run();
}

export async function messagingFor(db: Db, scopes: string[]) {
  if (!scopes.length) return [];
  const { results } = await db.prepare(`SELECT scope, whatsapp_number, whatsapp_enabled, admin_override FROM messaging_settings WHERE scope IN (${scopes.map(() => "?").join(",")})`).bind(...scopes).all();
  return results;
}

/** One inbox message for the candidate, plus its place on the WhatsApp queue. */
export async function notifyCandidate(db: Db, candidateId: string, kind: string, title: string, body: string, companyId: string | null = null) {
  const sender = await resolveSender(db, companyId), at = nowIso();
  // WhatsApp only with the person's own consent (given on a website form or at CV upload).
  const agreed = !!(await db.prepare("SELECT whatsapp_consent_at FROM candidates WHERE id = ?").bind(candidateId).first<{ whatsapp_consent_at: string | null }>())?.whatsapp_consent_at;
  await db.batch([
    db.prepare("INSERT INTO messages (id, recipient_kind, recipient_id, channel, kind, title, body, created_at) VALUES (?, 'candidate', ?, 'inbox', ?, ?, ?, ?)").bind(newId(), candidateId, kind, title.slice(0, 160), body.slice(0, 1200), at),
    db.prepare("INSERT INTO messages (id, channel, recipient_kind, recipient_id, sender_scope, kind, body, status, status_detail, created_at) VALUES (?, 'whatsapp', 'candidate', ?, ?, ?, ?, ?, ?, ?)")
      .bind(newId(), candidateId, sender?.scope ?? "", kind, `${title}\n${body}`.slice(0, 1200), agreed && sender ? "queued" : "skipped", !agreed ? "no WhatsApp consent from the candidate" : sender ? "waiting for a WhatsApp provider" : "no WhatsApp number configured", at),
  ]);
}

/** Record (or withdraw) a candidate's consent to WhatsApp updates. */
export async function setWhatsappConsent(db: Db, candidateId: string, agreed: boolean) {
  await db.prepare("UPDATE candidates SET whatsapp_consent_at = CASE WHEN ? = 1 THEN COALESCE(whatsapp_consent_at, ?) ELSE NULL END WHERE id = ?").bind(agreed ? 1 : 0, nowIso(), candidateId).run();
}

export async function notifyCompany(db: Db, companyId: string, kind: string, title: string, body: string) {
  await db.prepare("INSERT INTO messages (id, recipient_kind, recipient_id, channel, kind, title, body, created_at) VALUES (?, 'company', ?, 'inbox', ?, ?, ?, ?)").bind(newId(), companyId, kind, title.slice(0, 160), body.slice(0, 1200), nowIso()).run();
}

const STAGE_TEXT: Record<string, (job: string) => [string, string]> = {
  submitted: job => [`Your profile was put forward for ${job}`, "A Jobboard300 recruiter reviewed your CV and shared it with the employer for this role. We will tell you what they decide."],
  shortlisted: job => [`You are shortlisted for ${job}`, "The employer wants to take your application further. Expect an interview invitation next."],
  interview: job => [`Interview stage for ${job}`, "You have moved to the interview stage. Check your inbox for the date and details."],
  offered: job => [`An offer is being made for ${job}`, "The employer has decided to make you an offer. A recruiter will contact you with the details."],
  offer_accepted: job => [`Offer accepted for ${job}`, "Your acceptance is recorded. A recruiter will stay in touch until your joining date."],
  joined: job => [`Welcome to your new role: ${job}`, "Your joining is recorded. Congratulations, and tell us if anything about the role differs from what was agreed."],
  rejected: job => [`Update on ${job}`, "The employer has decided not to take your application further for this role. Your profile stays active for other roles that fit."],
  offer_declined: job => [`Offer closed for ${job}`, "The offer for this role is recorded as declined. Your profile stays active for other roles."],
  no_show: job => [`Joining not completed for ${job}`, "You are recorded as not having joined this role. Contact us if that is wrong."],
  withdrawn: job => [`Application closed for ${job}`, "Your application for this role has been closed."],
};

/** The candidate-facing message for a pipeline stage. Carries the outcome only. */
export function stageMessage(stage: string, jobTitle: string): [string, string] {
  return (STAGE_TEXT[stage] ?? ((job: string) => [`Update on ${job}`, "Your application has been updated."]))(jobTitle);
}

export async function notifyStage(db: Db, p: { candidateId: string; companyId: string; jdId: string; stage: string; byStaff: boolean }) {
  const jd = await db.prepare("SELECT title FROM jds WHERE id = ?").bind(p.jdId).first<{ title: string }>();
  const [title, body] = stageMessage(p.stage, jd?.title ?? "your application");
  await notifyCandidate(db, p.candidateId, `stage.${p.stage}`, title, body, p.companyId);
  if (p.byStaff) await notifyCompany(db, p.companyId, `stage.${p.stage}`, `Jobboard300 updated a candidate for ${jd?.title ?? "your job"}`, `A candidate was moved to “${p.stage.replace(/_/g, " ")}”. Open the pipeline to see the details.`);
}

export async function candidateInbox(db: Db, candidateId: string) {
  const { results } = await db.prepare("SELECT id, kind, title, body, created_at, read_at FROM messages WHERE recipient_kind = 'candidate' AND recipient_id = ? AND channel = 'inbox' ORDER BY created_at DESC, rowid DESC LIMIT 100").bind(candidateId).all();
  return results;
}
export async function markInboxRead(db: Db, candidateId: string) {
  await db.prepare("UPDATE messages SET read_at = ? WHERE recipient_kind = 'candidate' AND recipient_id = ? AND channel = 'inbox' AND read_at IS NULL").bind(nowIso(), candidateId).run();
}
export async function companyNotices(db: Db, companyId: string) {
  const { results } = await db.prepare("SELECT id, kind, title, body, created_at, read_at FROM messages WHERE recipient_kind = 'company' AND recipient_id = ? AND channel = 'inbox' ORDER BY created_at DESC, rowid DESC LIMIT 50").bind(companyId).all();
  return results;
}
export async function markNoticesRead(db: Db, companyId: string) {
  await db.prepare("UPDATE messages SET read_at = ? WHERE recipient_kind = 'company' AND recipient_id = ? AND channel = 'inbox' AND read_at IS NULL").bind(nowIso(), companyId).run();
}

/**
 * Weekly summary of how often a candidate's anonymous profile was shown to
 * employers. Counts only; never names a company. At most one per candidate per
 * 7 days. Called from the admin's queue run (no scheduler on this hosting).
 */
export async function weeklySummaries(db: Db) {
  const since = new Date(Date.parse(nowIso()) - 7 * 86_400_000).toISOString();
  const { results } = await db.prepare(`SELECT r.candidate_id, COUNT(*) AS shown FROM releases r JOIN candidates k ON k.id = r.candidate_id AND k.status = 'active'
    WHERE r.released_at >= ? AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.recipient_kind = 'candidate' AND m.recipient_id = r.candidate_id AND m.channel = 'inbox' AND m.kind = 'summary.weekly' AND m.created_at >= ?)
    GROUP BY r.candidate_id LIMIT 200`).bind(since, since).all<{ candidate_id: string; shown: number }>();
  for (const r of results) await notifyCandidate(db, r.candidate_id, "summary.weekly", "Your profile this week", `Your anonymous profile was shown for ${r.shown} job${r.shown === 1 ? "" : "s"} in the last 7 days. Employers see your name and contact details only if they take your profile forward.`);
  return results.length;
}
