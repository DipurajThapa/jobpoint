// Client workspace: what a hiring company (Jobboard300's client) does after it
// has candidates in front of it.
// - Client accounts and team members are invited by Jobboard300 (registration
//   can stay closed): an account without a password plus a one-time link.
// - Managed searches: Jobboard300's recruiters submit candidates to a client's
//   JD with a note. No unlock quota is used; the fee is on placement.
// - The hiring pipeline per candidate and JD: submitted → shortlisted →
//   interview → offered → offer accepted → joined, or a closed outcome with a
//   reason. Interviews carry rounds, schedule and feedback.
// - Joining creates a placement with its replacement-guarantee window.
// Every read and write is scoped to one company, and candidates whose consent
// was withdrawn are shown without any personal detail.

import { audit, candidateRef, newId, now, nowIso, parseJson, PortalError, type Db } from "./db";
import { ACTIVE_CONSENT_SQL, consentActive } from "./consent";
import { issuePortalToken } from "./accounts";
import { activateCompany, currentParams } from "./company";

export const STAGES = ["submitted", "shortlisted", "interview", "offered", "offer_accepted", "joined", "rejected", "offer_declined", "no_show", "withdrawn"] as const;
export type Stage = typeof STAGES[number];
export const OPEN_STAGES: Stage[] = ["submitted", "shortlisted", "interview", "offered", "offer_accepted"];
export const STAGE_LABEL: Record<Stage, string> = {
  submitted: "Submitted by Jobboard300", shortlisted: "Shortlisted", interview: "Interviewing", offered: "Offer made", offer_accepted: "Offer accepted",
  joined: "Joined", rejected: "Not selected", offer_declined: "Offer declined", no_show: "Did not join", withdrawn: "Withdrawn",
};
const NEXT: Record<Stage, Stage[]> = {
  submitted: ["shortlisted", "rejected"],
  shortlisted: ["interview", "offered", "rejected", "withdrawn"],
  interview: ["offered", "rejected", "withdrawn"],
  offered: ["offer_accepted", "offer_declined", "withdrawn"],
  offer_accepted: ["joined", "no_show", "offer_declined"],
  joined: [],
  rejected: ["shortlisted"],
  offer_declined: [],
  no_show: [],
  withdrawn: ["shortlisted"],
};
/** Reason codes for closed outcomes, chosen for IT hiring. Free text is added after the code. */
export const REASONS: Partial<Record<Stage, string[]>> = {
  rejected: ["skills_gap", "experience_level", "communication", "ctc_mismatch", "notice_period", "culture_fit", "position_filled", "other"],
  offer_declined: ["better_offer", "counter_offer", "ctc", "location_or_work_mode", "role_or_project", "notice_or_buyout", "personal", "other"],
  no_show: ["better_offer", "counter_offer", "unreachable", "personal", "other"],
  withdrawn: ["candidate_withdrew", "consent_withdrawn", "position_closed", "other"],
};
const APPLICATION_STATUS: Record<Stage, string> = {
  submitted: "viewed", shortlisted: "shortlisted", interview: "interview", offered: "offer", offer_accepted: "offer",
  joined: "hired", rejected: "rejected", offer_declined: "rejected", no_show: "rejected", withdrawn: "withdrawn",
};
/** Pipeline history label. Company users pass a bare account id; Jobboard300 staff pass "staff:<id>". */
const actorLabel = (actorId: string) => actorId.includes(":") ? actorId : `company:${actorId}`;
const MAX_TEAM = 20;
const INVITE_HOURS = 7 * 24;
const day = (iso: string) => iso.slice(0, 10);
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const addDays = (date: string, days: number) => new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);
const addMonths = (date: string, months: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + months); return d.toISOString().slice(0, 10); };
/** Joining checkpoints (days before the expected joining date) at which to call the candidate. */
export const JOINING_CHECKPOINTS = [30, 14, 7, 1];
export function nextCheckpoint(joiningDate: string | null, today: string) {
  if (!joiningDate) return null;
  const left = Math.round((Date.parse(joiningDate) - Date.parse(today)) / 86_400_000);
  if (left < 0) return { daysLeft: left, label: "Joining date passed: confirm joined or did not join" };
  const due = JOINING_CHECKPOINTS.filter(c => c >= left);
  return { daysLeft: left, label: due.length ? `Check in now (T-${Math.min(...due)})` : `Next check-in at T-${JOINING_CHECKPOINTS.find(c => c < left) ?? 30}` };
}

// ---------------------------------------------------------------- accounts

async function createInvitedAccount(db: Db, email: string) {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean) || clean.length > 254) throw new PortalError("INVALID_EMAIL", "Enter a valid email address.");
  if (await db.prepare("SELECT id FROM portal_accounts WHERE email = ?").bind(clean).first()) throw new PortalError("EMAIL_TAKEN", "An account with this email already exists.", 409);
  const id = newId();
  await db.prepare("INSERT INTO portal_accounts (id, kind, email, password_hash, status, created_at) VALUES (?, 'company_user', ?, NULL, 'pending', ?)").bind(id, clean, nowIso()).run();
  return id;
}

export type ClientInvite = { displayName: string; legalName: string; city: string; website?: string; gstin?: string; ownerEmail: string; ownerName?: string; guaranteeDays?: number; nonSolicitMonths?: number; feeTerms?: string; params: unknown; plan?: string };

/**
 * Jobboard300 onboards a client directly: an active company with approved
 * matching parameters, a starting plan, and an owner who sets a password from
 * a one-time link (valid 7 days). Works while public registration is closed.
 */
export async function inviteClient(db: Db, input: ClientInvite, adminId: string) {
  if (!input.displayName?.trim() || !input.legalName?.trim()) throw new PortalError("COMPANY", "Enter the company's name and registered legal name.");
  const guarantee = Math.round(Number(input.guaranteeDays ?? 90));
  if (!(guarantee >= 0 && guarantee <= 365)) throw new PortalError("GUARANTEE", "The replacement guarantee must be between 0 and 365 days.");
  const nonSolicit = Math.round(Number(input.nonSolicitMonths ?? 12));
  if (!(nonSolicit >= 0 && nonSolicit <= 36)) throw new PortalError("NON_SOLICIT", "The non-solicitation period must be between 0 and 36 months.");
  const accountId = await createInvitedAccount(db, input.ownerEmail);
  const companyId = newId(), at = nowIso();
  await db.batch([
    db.prepare("INSERT INTO companies (id, legal_name, display_name, gstin, website, city, status, guarantee_days, non_solicit_months, fee_terms, created_at) VALUES (?, ?, ?, ?, ?, ?, 'applied', ?, ?, ?, ?)")
      .bind(companyId, input.legalName.trim().slice(0, 160), input.displayName.trim().slice(0, 120), (input.gstin ?? "").trim().toUpperCase().slice(0, 15), (input.website ?? "").trim().slice(0, 200), (input.city ?? "").trim().slice(0, 80), guarantee, nonSolicit, (input.feeTerms ?? "").trim().slice(0, 300), at),
    db.prepare("INSERT INTO company_users (id, company_id, account_id, role, display_name, created_at) VALUES (?, ?, ?, 'owner', ?, ?)").bind(newId(), companyId, accountId, (input.ownerName ?? "").trim().slice(0, 120), at),
  ]);
  try { await activateCompany(db, companyId, input.params, adminId, input.plan || "free"); }
  catch (error) { await db.batch([db.prepare("DELETE FROM companies WHERE id = ?").bind(companyId), db.prepare("DELETE FROM portal_accounts WHERE id = ?").bind(accountId)]); throw error; }
  const token = await issuePortalToken(db, accountId, "invite", INVITE_HOURS);
  await audit(db, adminId, "client.invited", "company", companyId, input.ownerEmail.trim().toLowerCase());
  return { companyId, accountId, token };
}

export async function updateClientTerms(db: Db, companyId: string, guaranteeDays: number, feeTerms: string, adminId: string, nonSolicitMonths = 12) {
  const g = Math.round(Number(guaranteeDays)), n = Math.round(Number(nonSolicitMonths));
  if (!(g >= 0 && g <= 365)) throw new PortalError("GUARANTEE", "The replacement guarantee must be between 0 and 365 days.");
  if (!(n >= 0 && n <= 36)) throw new PortalError("NON_SOLICIT", "The non-solicitation period must be between 0 and 36 months.");
  const r = await db.prepare("UPDATE companies SET guarantee_days = ?, fee_terms = ?, non_solicit_months = ? WHERE id = ?").bind(g, feeTerms.trim().slice(0, 300), n, companyId).run();
  if (!r.meta.changes) throw new PortalError("NOT_FOUND", "Company not found.", 404);
  await audit(db, adminId, "client.terms", "company", companyId, `${g} days; ${feeTerms.slice(0, 100)}`);
}

export async function teamList(db: Db, companyId: string) {
  const { results } = await db.prepare(`SELECT a.id, a.email, a.status, a.last_sign_in_at, cu.role, cu.display_name, cu.created_at
    FROM company_users cu JOIN portal_accounts a ON a.id = cu.account_id WHERE cu.company_id = ? AND a.status != 'deleted' ORDER BY cu.role = 'owner' DESC, cu.created_at`).bind(companyId).all();
  return results;
}

/** The company owner adds a colleague (team member). Returns a one-time link to set a password. */
export async function inviteMember(db: Db, companyId: string, actorId: string, email: string, name: string) {
  const count = await db.prepare("SELECT COUNT(*) AS n FROM company_users cu JOIN portal_accounts a ON a.id = cu.account_id WHERE cu.company_id = ? AND a.status != 'deleted'").bind(companyId).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_TEAM) throw new PortalError("TEAM_FULL", `A company account can have up to ${MAX_TEAM} people. Remove someone first.`);
  const accountId = await createInvitedAccount(db, email);
  await db.prepare("INSERT INTO company_users (id, company_id, account_id, role, display_name, created_at) VALUES (?, ?, ?, 'recruiter', ?, ?)").bind(newId(), companyId, accountId, name.trim().slice(0, 120), nowIso()).run();
  const token = await issuePortalToken(db, accountId, "invite", INVITE_HOURS);
  await audit(db, actorId, "client.member_invited", "company", companyId, email.trim().toLowerCase());
  return { accountId, token };
}

/** New link for a member who has not set a password yet (the old link stops working). */
export async function reissueInvite(db: Db, companyId: string, actorId: string, memberId: string) {
  const row = await db.prepare("SELECT a.status FROM company_users cu JOIN portal_accounts a ON a.id = cu.account_id WHERE cu.company_id = ? AND a.id = ?").bind(companyId, memberId).first<{ status: string }>();
  if (!row) throw new PortalError("NOT_FOUND", "Team member not found.", 404);
  if (row.status !== "pending") throw new PortalError("ALREADY_ACTIVE", "This person has already set a password. They can use “Forgot password” if needed.");
  const token = await issuePortalToken(db, memberId, "invite", INVITE_HOURS);
  await audit(db, actorId, "client.member_reinvited", "company", companyId, memberId);
  return token;
}

export async function removeMember(db: Db, companyId: string, actorId: string, memberId: string) {
  if (memberId === actorId) throw new PortalError("SELF", "You cannot remove yourself.");
  const row = await db.prepare("SELECT cu.role FROM company_users cu WHERE cu.company_id = ? AND cu.account_id = ?").bind(companyId, memberId).first<{ role: string }>();
  if (!row) throw new PortalError("NOT_FOUND", "Team member not found.", 404);
  if (row.role === "owner") throw new PortalError("OWNER", "The company owner cannot be removed. Ask Jobboard300 to transfer ownership.");
  await db.batch([
    db.prepare("DELETE FROM portal_sessions WHERE account_id = ?").bind(memberId),
    db.prepare("DELETE FROM company_users WHERE company_id = ? AND account_id = ?").bind(companyId, memberId),
    db.prepare("UPDATE portal_accounts SET status = 'deleted', email = 'removed-' || id || '@invalid', password_hash = NULL WHERE id = ?").bind(memberId),
  ]);
  await audit(db, actorId, "client.member_removed", "company", companyId, memberId);
}

// ---------------------------------------------------------------- pipeline

type PipelineRow = { id: string; company_id: string; jd_id: string; candidate_id: string; candidate_ref: string; stage: Stage; source: string };

/**
 * Keep the candidate's application (if any) in step with the pipeline. Both
 * statements apply only if the pipeline entry is at `stage` with updated_at
 * `at`, i.e. only if this request's stage change won; a concurrent change
 * that loses leaves the application untouched.
 */
async function syncApplication(db: Db, candidateId: string, jdId: string, stage: Stage, actor: string, guard: { pipelineId: string; at: string }) {
  const app = await db.prepare("SELECT id FROM portal_applications WHERE candidate_id = ? AND jd_id = ?").bind(candidateId, jdId).first<{ id: string }>();
  if (!app) return [];
  const status = APPLICATION_STATUS[stage], won = "EXISTS (SELECT 1 FROM pipeline WHERE id = ? AND stage = ? AND updated_at = ?)";
  return [
    db.prepare(`UPDATE portal_applications SET status = ?, updated_at = ? WHERE id = ? AND status != ? AND ${won}`).bind(status, guard.at, app.id, status, guard.pipelineId, stage, guard.at),
    db.prepare(`INSERT INTO portal_application_events (id, application_id, status, actor, at) SELECT ?, ?, ?, ?, ? WHERE ${won}`).bind(newId(), app.id, status, actor, guard.at, guard.pipelineId, stage, guard.at),
  ];
}

async function activeUnlock(db: Db, companyId: string, candidateId: string) {
  const u = await db.prepare("SELECT access_revoked_at FROM unlocks WHERE company_id = ? AND candidate_id = ?").bind(companyId, candidateId).first<{ access_revoked_at: string | null }>();
  if (!u) throw new PortalError("NOT_UNLOCKED", "Unlock this profile before adding it to your pipeline.", 403);
  if (u.access_revoked_at) throw new PortalError("CONSENT_WITHDRAWN", "The candidate has withdrawn consent; this profile is no longer available.", 410);
}

async function openJd(db: Db, companyId: string, jdId: string) {
  const jd = await db.prepare("SELECT id, title, status, service FROM jds WHERE id = ? AND company_id = ?").bind(jdId, companyId).first<{ id: string; title: string; status: string; service: string }>();
  if (!jd) throw new PortalError("NOT_FOUND", "Job not found.", 404);
  if (jd.status === "closed") throw new PortalError("JD_CLOSED", "This job is closed.");
  return jd;
}

/** Company adds an unlocked candidate to a job's pipeline (stage: shortlisted). */
export async function addToPipeline(db: Db, companyId: string, actorId: string, ref: string, jdId: string) {
  await openJd(db, companyId, jdId);
  const u = await db.prepare("SELECT candidate_id, access_revoked_at FROM unlocks WHERE company_id = ? AND candidate_ref = ?").bind(companyId, ref).first<{ candidate_id: string; access_revoked_at: string | null }>();
  if (!u) throw new PortalError("NOT_UNLOCKED", "Unlock this profile before adding it to your pipeline.", 403);
  if (u.access_revoked_at) throw new PortalError("CONSENT_WITHDRAWN", "The candidate has withdrawn consent; this profile is no longer available.", 410);
  const existing = await db.prepare("SELECT id FROM pipeline WHERE company_id = ? AND jd_id = ? AND candidate_id = ?").bind(companyId, jdId, u.candidate_id).first<{ id: string }>();
  if (existing) return { id: existing.id, created: false };
  const applied = await db.prepare("SELECT 1 AS x FROM portal_applications WHERE candidate_id = ? AND jd_id = ?").bind(u.candidate_id, jdId).first();
  const id = newId(), at = nowIso();
  await db.batch([
    db.prepare("INSERT INTO pipeline (id, company_id, jd_id, candidate_id, candidate_ref, source, stage, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'shortlisted', ?, ?, ?)")
      .bind(id, companyId, jdId, u.candidate_id, ref, applied ? "application" : "release", actorId, at, at),
    db.prepare("INSERT INTO pipeline_events (id, pipeline_id, stage, actor, at) VALUES (?, ?, 'shortlisted', ?, ?)").bind(newId(), id, actorLabel(actorId), at),
    ...await syncApplication(db, u.candidate_id, jdId, "shortlisted", actorLabel(actorId), { pipelineId: id, at }),
  ]);
  return { id, created: true };
}

/**
 * Jobboard300 submits a candidate to a client's managed search. Requires the
 * candidate's active consent to share, the company not being hidden by the
 * candidate, and a live managed JD. Grants the client access without using
 * unlock quota (subscription "managed"); the fee is on placement.
 */
export async function submitByRecruiter(db: Db, secret: string, input: { companyId: string; jdId: string; candidateId: string; note: string }, adminId: string) {
  const { companyId, jdId, candidateId } = input;
  const company = await db.prepare("SELECT status FROM companies WHERE id = ?").bind(companyId).first<{ status: string }>();
  if (company?.status !== "active") throw new PortalError("COMPANY_NOT_ACTIVE", "The client account is not active.");
  const jd = await openJd(db, companyId, jdId);
  if (jd.status !== "live") throw new PortalError("NOT_LIVE", "The job must be live before candidates are submitted.");
  if (jd.service !== "managed") throw new PortalError("NOT_MANAGED", "This job is self-service. Switch it to a managed search first.");
  const cand = await db.prepare("SELECT status, hidden_company_ids FROM candidates WHERE id = ?").bind(candidateId).first<{ status: string; hidden_company_ids: string }>();
  if (!cand || cand.status !== "active") throw new PortalError("NOT_FOUND", "Candidate not found or not active.", 404);
  if (parseJson<string[]>(cand.hidden_company_ids, []).includes(companyId)) throw new PortalError("HIDDEN", "The candidate has hidden their profile from this company.", 403);
  // Portal sharing consent, or the website's recruiter-reviewed sharing consent (this is a recruiter-reviewed submission).
  if (!await consentActive(db, candidateId, "share_with_companies") && !await consentActive(db, candidateId, "recruiter_sharing")) throw new PortalError("NO_CONSENT", "The candidate has not consented to their CV being shared with employers.", 403);
  if (!input.note.trim()) throw new PortalError("NOTE", "Add a recruiter note for the client: why this candidate, availability, CTC and notice.");
  const ref = await candidateRef(secret, companyId, candidateId);
  const unlock = await db.prepare("SELECT access_revoked_at FROM unlocks WHERE company_id = ? AND candidate_id = ?").bind(companyId, candidateId).first<{ access_revoked_at: string | null }>();
  if (unlock?.access_revoked_at) throw new PortalError("CONSENT_WITHDRAWN", "The candidate withdrew consent for this company earlier.", 410);
  if (await db.prepare("SELECT 1 AS x FROM pipeline WHERE company_id = ? AND jd_id = ? AND candidate_id = ?").bind(companyId, jdId, candidateId).first()) throw new PortalError("ALREADY_SUBMITTED", "This candidate is already in the client's pipeline for this job.", 409);
  const match = await db.prepare("SELECT score FROM matches WHERE jd_id = ? AND candidate_id = ?").bind(jdId, candidateId).first<{ score: number }>();
  const params = await currentParams(db, companyId);
  const id = newId(), at = nowIso(), trace = newId().replace(/-/g, "").slice(0, 12).toUpperCase();
  await db.batch([
    db.prepare(`INSERT INTO releases (id, jd_id, company_id, candidate_id, candidate_ref, score, params_version, released_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM releases WHERE jd_id = ? AND candidate_id = ? AND revoked_at IS NULL)`)
      .bind(newId(), jdId, companyId, candidateId, ref, match?.score ?? 0, params?.version ?? 0, at, jdId, candidateId),
    db.prepare(`INSERT OR IGNORE INTO unlocks (id, company_id, candidate_id, candidate_ref, first_jd_id, unlocked_by, subscription_id, trace_id, unlocked_at) VALUES (?, ?, ?, ?, ?, ?, 'managed', ?, ?)`)
      .bind(newId(), companyId, candidateId, ref, jdId, `admin:${adminId}`, trace, at),
    db.prepare("INSERT INTO pipeline (id, company_id, jd_id, candidate_id, candidate_ref, source, stage, recruiter_note, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'job_point', 'submitted', ?, ?, ?, ?)")
      .bind(id, companyId, jdId, candidateId, ref, input.note.trim().slice(0, 2000), `admin:${adminId}`, at, at),
    db.prepare("INSERT INTO pipeline_events (id, pipeline_id, stage, actor, note, at) VALUES (?, ?, 'submitted', ?, 'Submitted by Jobboard300', ?)").bind(newId(), id, `admin:${adminId}`, at),
    db.prepare("INSERT INTO access_log (id, actor_kind, actor_id, company_id, action, jd_id, candidate_ref, ip_hash, at) VALUES (?, 'admin', ?, ?, 'submit', ?, ?, '', ?)").bind(newId(), adminId, companyId, jdId, ref, at),
  ]);
  await audit(db, adminId, "candidate.submitted", "company", companyId, `jd ${jdId}, ref ${ref}`);
  return { id, ref };
}

export type StageInput = { stage: string; reason?: string; note?: string; offerCtcInr?: number | null; offerDate?: string; joiningDate?: string; lastWorkingDay?: string; competingOffers?: string };

/** Move a pipeline entry to its next stage, with the details that stage needs. */
export async function moveStage(db: Db, companyId: string, actorId: string, pipelineId: string, input: StageInput) {
  const row = await db.prepare("SELECT id, company_id, jd_id, candidate_id, candidate_ref, stage, source FROM pipeline WHERE id = ? AND company_id = ?").bind(pipelineId, companyId).first<PipelineRow>();
  if (!row) throw new PortalError("NOT_FOUND", "Pipeline entry not found.", 404);
  await activeUnlock(db, companyId, row.candidate_id);
  const stage = input.stage as Stage;
  if (!STAGES.includes(stage)) throw new PortalError("STAGE", "Choose a valid stage.");
  if (!NEXT[row.stage].includes(stage)) throw new PortalError("STAGE_ORDER", `A candidate at “${STAGE_LABEL[row.stage]}” cannot move to “${STAGE_LABEL[stage]}”.`);
  const reasons = REASONS[stage];
  if (reasons && !reasons.includes(input.reason ?? "")) throw new PortalError("REASON", "Choose a reason. It helps Jobboard300 send better candidates.");
  const note = (input.note ?? "").trim().slice(0, 1000);
  const at = nowIso(), sets: string[] = ["stage = ?", "updated_at = ?"], values: unknown[] = [stage, at];
  if (reasons) { sets.push("stage_reason = ?"); values.push(`${input.reason}${note ? `: ${note}` : ""}`); }
  if (stage === "offered") {
    const ctc = input.offerCtcInr == null ? null : Math.round(Number(input.offerCtcInr));
    if (ctc !== null && !(ctc >= 50_000 && ctc <= 100_000_000)) throw new PortalError("CTC", "Enter the offered annual CTC in rupees (for example 1200000 for ₹12 LPA).");
    sets.push("offer_ctc_inr = ?", "offer_date = ?"); values.push(ctc, isDate(input.offerDate) ? input.offerDate : day(at));
  }
  if (stage === "offer_accepted" || stage === "joined") {
    if (!isDate(input.joiningDate)) throw new PortalError("JOINING_DATE", stage === "joined" ? "Enter the date the candidate joined." : "Enter the expected joining date.");
    if (stage === "joined" && Date.parse(input.joiningDate) > now().getTime() + 86_400_000) throw new PortalError("JOINING_DATE", "The joining date cannot be in the future. Use “Offer accepted” until the candidate joins.");
    sets.push("joining_date = ?"); values.push(input.joiningDate);
  }
  if (stage === "offer_accepted") {
    // Offer drop-outs are common in Indian IT: record what predicts them.
    if (input.lastWorkingDay && !isDate(input.lastWorkingDay)) throw new PortalError("LWD", "Enter the last working day at the current employer as a date.");
    sets.push("last_working_day = ?", "competing_offers = ?"); values.push(input.lastWorkingDay || null, (input.competingOffers ?? "").trim().slice(0, 300));
  }
  const statements = [
    db.prepare(`UPDATE pipeline SET ${sets.join(", ")} WHERE id = ? AND stage = ?`).bind(...values, row.id, row.stage),
    // Later statements apply only if this request made the change (guards against a concurrent update).
    db.prepare("INSERT INTO pipeline_events (id, pipeline_id, stage, actor, note, at) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM pipeline WHERE id = ? AND stage = ? AND updated_at = ?)")
      .bind(newId(), row.id, stage, actorLabel(actorId), note, at, row.id, stage, at),
    ...await syncApplication(db, row.candidate_id, row.jd_id, stage, actorLabel(actorId), { pipelineId: row.id, at }),
  ];
  if (["rejected", "offer_declined", "no_show", "withdrawn"].includes(stage)) statements.push(db.prepare("UPDATE interviews SET status = 'cancelled', updated_at = ? WHERE pipeline_id = ? AND status = 'scheduled' AND EXISTS (SELECT 1 FROM pipeline WHERE id = ? AND stage = ? AND updated_at = ?)").bind(at, row.id, row.id, stage, at));
  if (stage === "joined") {
    const c = await db.prepare("SELECT guarantee_days, non_solicit_months FROM companies WHERE id = ?").bind(companyId).first<{ guarantee_days: number; non_solicit_months: number }>();
    const jd = await db.prepare("SELECT title FROM jds WHERE id = ?").bind(row.jd_id).first<{ title: string }>();
    const offer = await db.prepare("SELECT offer_ctc_inr FROM pipeline WHERE id = ?").bind(row.id).first<{ offer_ctc_inr: number | null }>();
    statements.push(db.prepare("INSERT OR IGNORE INTO placements (id, pipeline_id, company_id, candidate_id, jd_id, title, joined_on, ctc_inr, guarantee_ends_on, non_solicit_until, created_by, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM pipeline WHERE id = ? AND stage = 'joined' AND updated_at = ?)")
      .bind(newId(), row.id, companyId, row.candidate_id, row.jd_id, jd?.title ?? "", input.joiningDate, offer?.offer_ctc_inr ?? null, addDays(input.joiningDate!, c?.guarantee_days ?? 90), addMonths(input.joiningDate!, c?.non_solicit_months ?? 12), actorId, at, row.id, at));
  }
  const results = await db.batch(statements) as { meta: { changes?: number } }[];
  if (!results[0]?.meta.changes) throw new PortalError("CONFLICT", "Someone else updated this candidate just now. Reload and try again.", 409);
  await audit(db, actorId, "pipeline.stage", "pipeline", row.id, `${row.stage} → ${stage}`);
  return { stage };
}

export type InterviewInput = { round: string; scheduledAt: string; mode: string; location?: string; interviewer?: string };

export async function scheduleInterview(db: Db, companyId: string, actorId: string, pipelineId: string, input: InterviewInput) {
  const row = await db.prepare("SELECT id, candidate_id, jd_id, stage FROM pipeline WHERE id = ? AND company_id = ?").bind(pipelineId, companyId).first<PipelineRow>();
  if (!row) throw new PortalError("NOT_FOUND", "Pipeline entry not found.", 404);
  await activeUnlock(db, companyId, row.candidate_id);
  if (!["shortlisted", "interview"].includes(row.stage)) throw new PortalError("STAGE", "Shortlist the candidate before scheduling an interview.");
  const round = (input.round ?? "").trim().slice(0, 80);
  if (!round) throw new PortalError("ROUND", "Name the round, for example “Technical 1” or “HR”.");
  const when = Date.parse(input.scheduledAt ?? "");
  if (Number.isNaN(when)) throw new PortalError("WHEN", "Choose a date and time.");
  if (!["video", "phone", "in_person"].includes(input.mode)) throw new PortalError("MODE", "Choose video, phone or in person.");
  const id = newId(), at = nowIso();
  await db.batch([
    db.prepare("INSERT INTO interviews (id, pipeline_id, company_id, round, scheduled_at, mode, location, interviewer, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, row.id, companyId, round, new Date(when).toISOString(), input.mode, (input.location ?? "").trim().slice(0, 300), (input.interviewer ?? "").trim().slice(0, 120), actorId, at, at),
    ...(row.stage === "shortlisted" ? [
      db.prepare("UPDATE pipeline SET stage = 'interview', updated_at = ? WHERE id = ?").bind(at, row.id),
      db.prepare("INSERT INTO pipeline_events (id, pipeline_id, stage, actor, note, at) VALUES (?, ?, 'interview', ?, ?, ?)").bind(newId(), row.id, actorLabel(actorId), `${round} scheduled`, at),
      ...await syncApplication(db, row.candidate_id, row.jd_id, "interview", actorLabel(actorId), { pipelineId: row.id, at }),
    ] : []),
  ]);
  return { id };
}

export async function recordInterview(db: Db, companyId: string, actorId: string, interviewId: string, input: { status: string; outcome?: string; rating?: number | null; feedback?: string }) {
  const iv = await db.prepare("SELECT i.id, p.candidate_id FROM interviews i JOIN pipeline p ON p.id = i.pipeline_id WHERE i.id = ? AND i.company_id = ?").bind(interviewId, companyId).first<{ id: string; candidate_id: string }>();
  if (!iv) throw new PortalError("NOT_FOUND", "Interview not found.", 404);
  await activeUnlock(db, companyId, iv.candidate_id);
  if (!["completed", "cancelled", "no_show"].includes(input.status)) throw new PortalError("STATUS", "Choose completed, cancelled or no-show.");
  const outcome = input.status === "completed" ? input.outcome ?? "pending" : "pending";
  if (!["pending", "advance", "hold", "reject"].includes(outcome)) throw new PortalError("OUTCOME", "Choose an outcome.");
  const rating = input.rating == null || input.rating === 0 ? null : Math.round(Number(input.rating));
  if (rating !== null && !(rating >= 1 && rating <= 5)) throw new PortalError("RATING", "Rating is 1 to 5.");
  await db.prepare("UPDATE interviews SET status = ?, outcome = ?, rating = ?, feedback = ?, updated_at = ? WHERE id = ?")
    .bind(input.status, outcome, rating, (input.feedback ?? "").trim().slice(0, 2000), nowIso(), iv.id).run();
  await audit(db, actorId, "interview.recorded", "interview", iv.id, `${input.status}/${outcome}`);
}

/** The client reports that a placed candidate left. Inside the guarantee window this opens a replacement. */
export async function reportPlacementExit(db: Db, companyId: string, actorId: string, placementId: string, leftOn: string, note: string) {
  const p = await db.prepare("SELECT id, guarantee_ends_on, joined_on, status FROM placements WHERE id = ? AND company_id = ?").bind(placementId, companyId).first<{ id: string; guarantee_ends_on: string; joined_on: string; status: string }>();
  if (!p) throw new PortalError("NOT_FOUND", "Placement not found.", 404);
  if (p.status !== "active") throw new PortalError("CLOSED", "This placement is already closed.");
  if (!isDate(leftOn) || leftOn < p.joined_on) throw new PortalError("DATE", "Enter the last working day (on or after the joining date).");
  const status = leftOn <= p.guarantee_ends_on ? "left_in_guarantee" : "left";
  await db.prepare("UPDATE placements SET status = ?, left_on = ?, note = ? WHERE id = ?").bind(status, leftOn, note.trim().slice(0, 500), p.id).run();
  await audit(db, actorId, "placement.exit", "placement", p.id, status);
  return { status, inGuarantee: status === "left_in_guarantee" };
}

// ---------------------------------------------------------------- reads

type ViewRow = { id: string; jd_id: string; jd_title: string; candidate_ref: string; stage: Stage; stage_reason: string; source: string; recruiter_note: string; offer_ctc_inr: number | null; offer_date: string | null; joining_date: string | null; last_working_day: string | null; competing_offers: string; created_at: string; updated_at: string; display_name: string | null; revoked: string | null; title: string | null; years: number | null };

/** Pipeline for one company (optionally one job), with names only while access is active. */
export async function pipelineView(db: Db, companyId: string, jdId?: string) {
  const { results } = await db.prepare(`SELECT p.id, p.jd_id, j.title AS jd_title, p.candidate_ref, p.stage, p.stage_reason, p.source, p.recruiter_note, p.offer_ctc_inr, p.offer_date, p.joining_date, p.last_working_day, p.competing_offers, p.created_at, p.updated_at,
      k.display_name, u.access_revoked_at AS revoked
    FROM pipeline p JOIN jds j ON j.id = p.jd_id LEFT JOIN candidates k ON k.id = p.candidate_id
    LEFT JOIN unlocks u ON u.company_id = p.company_id AND u.candidate_id = p.candidate_id
    WHERE p.company_id = ? ${jdId ? "AND p.jd_id = ?" : ""} ORDER BY p.updated_at DESC LIMIT 500`).bind(...(jdId ? [companyId, jdId] : [companyId])).all<ViewRow>();
  const ids = results.map(r => r.id);
  const interviews = ids.length ? (await db.prepare(`SELECT id, pipeline_id, round, scheduled_at, mode, location, interviewer, status, outcome, rating, feedback FROM interviews WHERE company_id = ? AND pipeline_id IN (${ids.map(() => "?").join(",")}) ORDER BY scheduled_at`)
    .bind(companyId, ...ids).all<{ pipeline_id: string }>()).results : [];
  return results.map(r => {
    const hidden = !!r.revoked;
    return {
      id: r.id, jdId: r.jd_id, jdTitle: r.jd_title, ref: r.candidate_ref, stage: r.stage, stageLabel: STAGE_LABEL[r.stage], stageReason: r.stage_reason, source: r.source,
      name: hidden ? "Candidate withdrew consent" : (r.display_name || r.candidate_ref), available: !hidden,
      recruiterNote: hidden ? "" : r.recruiter_note, offerCtcInr: r.offer_ctc_inr, offerDate: r.offer_date, joiningDate: r.joining_date, createdAt: r.created_at, updatedAt: r.updated_at,
      lastWorkingDay: r.last_working_day, competingOffers: hidden ? "" : r.competing_offers,
      next: hidden ? [] : NEXT[r.stage], interviews: hidden ? [] : interviews.filter(i => i.pipeline_id === r.id),
    };
  });
}

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2); };

/** Overview for the client dashboard: pipeline funnel, interviews, offers, placements and hiring speed. */
export async function clientOverview(db: Db, companyId: string) {
  const at = now(), today = day(at.toISOString()), soon = new Date(at.getTime() + 14 * 86_400_000).toISOString();
  const { results: stageRows } = await db.prepare("SELECT p.stage, COUNT(*) AS n FROM pipeline p JOIN jds j ON j.id = p.jd_id WHERE p.company_id = ? AND j.status != 'closed' GROUP BY p.stage").bind(companyId).all<{ stage: Stage; n: number }>();
  const funnel = Object.fromEntries(STAGES.map(s => [s, stageRows.find(r => r.stage === s)?.n ?? 0])) as Record<Stage, number>;
  const { results: byJd } = await db.prepare(`SELECT j.id, j.title, j.status, j.service, j.openings,
      (SELECT COUNT(*) FROM releases r WHERE r.jd_id = j.id AND r.revoked_at IS NULL) AS released,
      (SELECT COUNT(*) FROM pipeline p WHERE p.jd_id = j.id AND p.stage IN ('submitted','shortlisted','interview','offered','offer_accepted')) AS in_process,
      (SELECT COUNT(*) FROM pipeline p WHERE p.jd_id = j.id AND p.stage = 'submitted') AS to_review,
      (SELECT COUNT(*) FROM pipeline p WHERE p.jd_id = j.id AND p.stage = 'joined') AS joined
    FROM jds j WHERE j.company_id = ? AND j.status != 'closed' ORDER BY j.updated_at DESC`).bind(companyId).all();
  const live = `JOIN pipeline p ON p.id = i.pipeline_id JOIN unlocks u ON u.company_id = p.company_id AND u.candidate_id = p.candidate_id AND u.access_revoked_at IS NULL LEFT JOIN candidates k ON k.id = p.candidate_id JOIN jds j ON j.id = p.jd_id`;
  const { results: upcoming } = await db.prepare(`SELECT i.id, i.round, i.scheduled_at, i.mode, i.location, i.interviewer, p.id AS pipeline_id, COALESCE(NULLIF(k.display_name, ''), p.candidate_ref) AS name, j.title AS jd_title
    FROM interviews i ${live} WHERE i.company_id = ? AND i.status = 'scheduled' AND i.scheduled_at >= ? AND i.scheduled_at <= ? ORDER BY i.scheduled_at LIMIT 50`).bind(companyId, at.toISOString(), soon).all();
  const { results: needsFeedback } = await db.prepare(`SELECT i.id, i.round, i.scheduled_at, p.id AS pipeline_id, COALESCE(NULLIF(k.display_name, ''), p.candidate_ref) AS name, j.title AS jd_title
    FROM interviews i ${live} WHERE i.company_id = ? AND i.status = 'scheduled' AND i.scheduled_at < ? ORDER BY i.scheduled_at LIMIT 50`).bind(companyId, at.toISOString()).all();
  const { results: joining } = await db.prepare(`SELECT p.id, p.joining_date, p.offer_ctc_inr, p.last_working_day, p.competing_offers, COALESCE(NULLIF(k.display_name, ''), p.candidate_ref) AS name, j.title AS jd_title
    FROM pipeline p JOIN jds j ON j.id = p.jd_id LEFT JOIN candidates k ON k.id = p.candidate_id JOIN unlocks u ON u.company_id = p.company_id AND u.candidate_id = p.candidate_id AND u.access_revoked_at IS NULL
    WHERE p.company_id = ? AND p.stage = 'offer_accepted' ORDER BY p.joining_date LIMIT 50`).bind(companyId).all<{ joining_date: string }>();
  // The placement stays as a business record; the person's name shows only while the company still has access.
  const { results: placements } = await db.prepare(`SELECT pl.id, pl.title, pl.joined_on, pl.guarantee_ends_on, pl.status, pl.left_on, COALESCE(NULLIF(k.display_name, ''), 'Candidate') AS name
    FROM placements pl LEFT JOIN unlocks u ON u.company_id = pl.company_id AND u.candidate_id = pl.candidate_id AND u.access_revoked_at IS NULL
    LEFT JOIN candidates k ON k.id = pl.candidate_id AND k.status = 'active' AND u.id IS NOT NULL
    WHERE pl.company_id = ? ORDER BY pl.joined_on DESC LIMIT 50`).bind(companyId).all<{ guarantee_ends_on: string; status: string }>();
  // Hiring speed over the last 180 days, from pipeline events.
  const since = new Date(at.getTime() - 180 * 86_400_000).toISOString();
  const { results: speed } = await db.prepare(`SELECT p.created_at, (SELECT MIN(e.at) FROM pipeline_events e WHERE e.pipeline_id = p.id AND e.stage = 'offered') AS offered_at,
      (SELECT MIN(e.at) FROM pipeline_events e WHERE e.pipeline_id = p.id AND e.stage = 'joined') AS joined_at, p.stage
    FROM pipeline p WHERE p.company_id = ? AND p.created_at >= ?`).bind(companyId, since).all<{ created_at: string; offered_at: string | null; joined_at: string | null; stage: Stage }>();
  const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;
  const accepted = speed.filter(r => ["offer_accepted", "joined", "no_show"].includes(r.stage)).length, declined = speed.filter(r => r.stage === "offer_declined").length;
  return {
    funnel, jobs: byJd, upcoming, needsFeedback, joining: joining.map(j => ({ ...j, checkpoint: nextCheckpoint(j.joining_date, today) })),
    placements: placements.map(p => ({ ...p, inGuarantee: p.status === "active" && p.guarantee_ends_on >= today })),
    metrics: {
      daysToOffer: median(speed.filter(r => r.offered_at).map(r => days(r.created_at, r.offered_at!))),
      daysToJoin: median(speed.filter(r => r.joined_at).map(r => days(r.created_at, r.joined_at!))),
      offerAcceptance: accepted + declined ? Math.round(100 * accepted / (accepted + declined)) : null,
      noShows: speed.filter(r => r.stage === "no_show").length,
    },
  };
}

/** Jobboard300's view across clients: managed searches and placements in their guarantee window. */
export async function adminClientWork(db: Db) {
  const { results: managed } = await db.prepare(`SELECT j.id, j.title, j.status, j.openings, j.company_id, c.display_name AS company,
      (SELECT COUNT(*) FROM pipeline p WHERE p.jd_id = j.id) AS submitted,
      (SELECT COUNT(*) FROM pipeline p WHERE p.jd_id = j.id AND p.stage IN ('shortlisted','interview','offered','offer_accepted')) AS in_process,
      (SELECT COUNT(*) FROM pipeline p WHERE p.jd_id = j.id AND p.stage = 'joined') AS joined
    FROM jds j JOIN companies c ON c.id = j.company_id WHERE j.service = 'managed' AND j.status IN ('live','pending','paused') ORDER BY j.updated_at DESC LIMIT 100`).all();
  const { results: placements } = await db.prepare(`SELECT pl.id, pl.title, pl.joined_on, pl.ctc_inr, pl.guarantee_ends_on, pl.non_solicit_until, pl.status, pl.left_on, pl.note, c.display_name AS company, c.fee_terms
    FROM placements pl JOIN companies c ON c.id = pl.company_id ORDER BY pl.joined_on DESC LIMIT 200`).all();
  return { managed, placements };
}

/** Candidates Jobboard300 could submit to a managed JD: best matches first, with names (admin only). */
export async function submissionCandidates(db: Db, jdId: string) {
  const jd = await db.prepare("SELECT company_id FROM jds WHERE id = ?").bind(jdId).first<{ company_id: string }>();
  if (!jd) throw new PortalError("NOT_FOUND", "Job not found.", 404);
  const { results } = await db.prepare(`SELECT m.candidate_id, k.display_name, k.current_city, m.score, m.lower_bound, m.hard_pass, m.explanation,
      EXISTS (SELECT 1 FROM pipeline p WHERE p.jd_id = m.jd_id AND p.candidate_id = m.candidate_id) AS in_pipeline,
      CASE WHEN k.account_id IS NOT NULL THEN 'portal' ELSE 'website' END AS source,
      (${ACTIVE_CONSENT_SQL("m.candidate_id", "share_with_companies")} OR ${ACTIVE_CONSENT_SQL("m.candidate_id", "recruiter_sharing")}) AS can_share
    FROM matches m JOIN candidates k ON k.id = m.candidate_id WHERE m.jd_id = ? AND k.status = 'active' ORDER BY m.hard_pass DESC, m.lower_bound DESC LIMIT 40`).bind(jdId).all<{ explanation: string }>();
  return results.map(r => ({ ...r, explanation: parseJson<{ summary?: string }>(r.explanation, {}).summary ?? "" }));
}

export async function setJdService(db: Db, companyId: string, jdId: string, service: string, openings: number, actor: string) {
  if (!["self", "managed"].includes(service)) throw new PortalError("SERVICE", "Choose self-service or a managed search.");
  const n = Math.round(Number(openings));
  if (!(n >= 1 && n <= 500)) throw new PortalError("OPENINGS", "Openings must be between 1 and 500.");
  const r = await db.prepare("UPDATE jds SET service = ?, openings = ?, updated_at = ? WHERE id = ? AND company_id = ?").bind(service, n, nowIso(), jdId, companyId).run();
  if (!r.meta.changes) throw new PortalError("NOT_FOUND", "Job not found.", 404);
  await audit(db, actor, "jd.service", "jd", jdId, `${service}, ${n} opening(s)`);
}
