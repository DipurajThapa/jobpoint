// Jobboard300 staff roles and assignment (the Recruiting tool in the Working Platform).
// - Admin (platform administrator): sees and assigns everything.
// - Team manager (flagged on a team; a franchise is a team with its own manager):
//   sees the team's clients and jobs and assigns jobs to the team's members only.
// - Recruiter (team member): sees the team's clients, and their jobs that are
//   unassigned or assigned to them.
// A client company belongs to at most one team, so nobody outside that team can
// fulfil its jobs. Every read and write below is scoped on the server; a record
// outside the caller's scope is reported as "not found", never "forbidden".

import { audit, newId, nowIso, PortalError, type Db } from "./db";
import { messagingFor, saveMessaging } from "./notify";
import { inviteToTest, testsForPipeline } from "./adaptive";
import { reissueCommitmentLink } from "./commitment";
import { moveStage, pipelineView, scheduleInterview, submissionCandidates, submitByRecruiter, type InterviewInput, type StageInput } from "./client";

export type Staff = { id: string; admin: boolean };
export type StaffScope = { admin: boolean; memberTeams: string[]; managedTeams: string[]; role: "admin" | "manager" | "recruiter" };

export async function staffScope(db: Db, staff: Staff): Promise<StaffScope> {
  const { results } = await db.prepare("SELECT team_id, is_manager FROM platform_team_members WHERE user_id = ?").bind(staff.id).all<{ team_id: string; is_manager: number }>();
  const memberTeams = results.map(r => r.team_id), managedTeams = results.filter(r => r.is_manager).map(r => r.team_id);
  return { admin: staff.admin, memberTeams, managedTeams, role: staff.admin ? "admin" : managedTeams.length ? "manager" : "recruiter" };
}

const marks = (xs: string[]) => xs.map(() => "?").join(",") || "NULL";

/** SQL condition and bindings limiting companies (alias c) and jobs (alias j) to what this person may see. */
function visibility(scope: StaffScope, staffId: string, withJobs: boolean) {
  if (scope.admin) return { sql: "1 = 1", binds: [] as string[] };
  const team = `c.team_id IN (${marks(scope.memberTeams)})`;
  if (!withJobs) return { sql: team, binds: scope.memberTeams };
  // In a team they manage: every job. Otherwise: jobs unassigned or assigned to them.
  return { sql: `(${team} AND (c.team_id IN (${marks(scope.managedTeams)}) OR j.recruiter_id IS NULL OR j.recruiter_id = ?))`, binds: [...scope.memberTeams, ...scope.managedTeams, staffId] };
}

/** Everything the Recruiting screen lists for this person. */
export async function staffWork(db: Db, staff: Staff) {
  const scope = await staffScope(db, staff);
  const vc = visibility(scope, staff.id, false), vj = visibility(scope, staff.id, true);
  const { results: clients } = await db.prepare(`SELECT c.id, c.display_name, c.city, c.status, c.team_id, t.name AS team FROM companies c LEFT JOIN platform_teams t ON t.id = c.team_id
    WHERE ${vc.sql} ORDER BY c.display_name LIMIT 500`).bind(...vc.binds).all();
  const { results: jobs } = await db.prepare(`SELECT j.id, j.title, j.status, j.service, j.openings, j.recruiter_id, u.name AS recruiter, c.id AS company_id, c.display_name AS company, c.team_id,
      (SELECT COUNT(*) FROM pipeline p WHERE p.jd_id = j.id AND p.stage IN ('submitted','shortlisted','interview','offered','offer_accepted')) AS in_process,
      (SELECT COUNT(*) FROM pipeline p WHERE p.jd_id = j.id AND p.stage = 'joined') AS joined
    FROM jds j JOIN companies c ON c.id = j.company_id LEFT JOIN platform_users u ON u.id = j.recruiter_id
    WHERE j.status IN ('live','pending','paused') AND ${vj.sql} ORDER BY j.updated_at DESC LIMIT 500`).bind(...vj.binds).all();
  const teamIds = scope.admin ? null : scope.managedTeams;
  const { results: members } = teamIds && !teamIds.length ? { results: [] } : await db.prepare(`SELECT m.team_id, t.name AS team, m.user_id, u.name, u.email, m.is_manager FROM platform_team_members m
      JOIN platform_teams t ON t.id = m.team_id JOIN platform_users u ON u.id = m.user_id AND u.status != 'disabled' ${teamIds ? `WHERE m.team_id IN (${marks(teamIds)})` : ""} ORDER BY t.name, u.name`).bind(...(teamIds ?? [])).all();
  const { results: teams } = scope.admin ? await db.prepare("SELECT id, name FROM platform_teams ORDER BY name").all() : { results: [] };
  return { role: scope.role, clients, jobs, members, teams };
}

type JobRow = { id: string; company_id: string; team_id: string | null; recruiter_id: string | null };

/** The job, if this person may see it; otherwise NOT_FOUND. */
export async function jobForStaff(db: Db, staff: Staff, jdId: string): Promise<JobRow> {
  const scope = await staffScope(db, staff);
  const v = visibility(scope, staff.id, true);
  const row = await db.prepare(`SELECT j.id, j.company_id, c.team_id, j.recruiter_id FROM jds j JOIN companies c ON c.id = j.company_id WHERE j.id = ? AND ${v.sql}`).bind(jdId, ...v.binds).first<JobRow>();
  if (!row) throw new PortalError("NOT_FOUND", "Job not found.", 404);
  return row;
}

/** How many candidates a recruiter or team manager sees for a job at one time. */
export const SHORTLIST_SIZE = 3;
export const PASS_REASONS = ["not_reachable", "not_interested", "no_consent", "skills_mismatch", "experience_mismatch", "salary_mismatch", "location_mismatch", "other"] as const;
const PASSES_PER_DAY = 15;

/**
 * Candidates for a job. The admin sees the full ranked list with scores. Recruiters and
 * team managers see only the three best candidates still to be decided, without scores:
 * submitting or passing on one brings up the next.
 */
export async function staffCandidates(db: Db, staff: Staff, jdId: string) {
  await jobForStaff(db, staff, jdId);
  const all = await submissionCandidates(db, jdId);
  if (staff.admin) return all.slice(0, 40);
  return all.filter(c => !Number(c.in_pipeline) && !c.passed).slice(0, SHORTLIST_SIZE).map(c => { const rest = { ...c }; delete rest.score; delete rest.lower_bound; return rest; });
}

/** Pass on a shortlisted candidate with a reason. The reasons are what matching is tuned from. */
export async function staffPass(db: Db, staff: Staff, input: { jdId: string; candidateId: string; reason: string; note?: string }) {
  if (!(PASS_REASONS as readonly string[]).includes(input.reason)) throw new PortalError("REASON", "Choose why this candidate is not being submitted.");
  const shown = await staffCandidates(db, staff, input.jdId);
  if (!shown.some(c => c.candidate_id === input.candidateId)) throw new PortalError("NOT_FOUND", "Candidate not found.", 404);
  const today = await db.prepare("SELECT COUNT(*) AS n FROM shortlist_passes WHERE staff_id = ? AND jd_id = ? AND created_at >= ?").bind(staff.id, input.jdId, nowIso().slice(0, 10)).first<{ n: number }>();
  if (!staff.admin && (today?.n ?? 0) >= PASSES_PER_DAY) throw new PortalError("PASS_LIMIT", "You have passed on many candidates for this job today. Speak to your manager or the admin about the job's requirements.", 429);
  await db.prepare("INSERT OR IGNORE INTO shortlist_passes (id, jd_id, candidate_id, staff_id, reason, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(newId(), input.jdId, input.candidateId, staff.id, input.reason, (input.note ?? "").trim().slice(0, 500), nowIso()).run();
  await audit(db, staff.id, "shortlist.pass", "jd", input.jdId, input.reason);
}

/** The job's pipeline for staff, with each candidate's test results and commitment status (never shown to clients). */
export async function staffPipeline(db: Db, staff: Staff, jdId: string) {
  const job = await jobForStaff(db, staff, jdId);
  const rows = await pipelineView(db, job.company_id, jdId), tests = await testsForPipeline(db, jdId);
  const { results: extra } = await db.prepare("SELECT p.id, p.candidate_id, c.accepted_at, c.id AS commitment FROM pipeline p LEFT JOIN candidate_commitments c ON c.pipeline_id = p.id WHERE p.jd_id = ?").bind(jdId).all<{ id: string; candidate_id: string; accepted_at: string | null; commitment: string | null }>();
  return rows.map(r => { const x = extra.find(e => e.id === r.id); return { ...r, commitment: x?.commitment ? (x.accepted_at ? "accepted" : "pending") : null, tests: tests.filter(t => t.candidate_id === x?.candidate_id).map(t => ({ title: t.title, kind: t.kind, status: t.status, level: t.final_level, band: t.band })) }; });
}

/** Tests that can be sent for this job: the aptitude test if the client opted for it, and this client's own tests. */
export async function staffJobTests(db: Db, staff: Staff, jdId: string) {
  const job = await jobForStaff(db, staff, jdId);
  const jd = await db.prepare("SELECT aptitude_test FROM jds WHERE id = ?").bind(jdId).first<{ aptitude_test: number }>();
  const { results } = await db.prepare("SELECT id, title, kind FROM question_banks WHERE status = 'active' AND ((kind = 'aptitude' AND ? = 1) OR (kind = 'client' AND company_id = ?)) ORDER BY kind, title").bind(jd?.aptitude_test ?? 0, job.company_id).all();
  return { aptitudeOpted: !!jd?.aptitude_test, banks: results };
}

/** Record that the client opted for the aptitude test on this job (admin or the team's manager). */
export async function setJobAptitude(db: Db, staff: Staff, jdId: string, on: boolean) {
  const job = await jobForStaff(db, staff, jdId), scope = await staffScope(db, staff);
  if (!scope.admin && !(job.team_id && scope.managedTeams.includes(job.team_id))) throw new PortalError("MANAGER_ONLY", "Only the team's manager or an administrator can change the tests on a job.", 403);
  await db.prepare("UPDATE jds SET aptitude_test = ? WHERE id = ?").bind(on ? 1 : 0, jdId).run();
  await audit(db, staff.id, "jd.aptitude", "jd", jdId, on ? "opted in" : "opted out");
}

export async function staffInviteToTest(db: Db, staff: Staff, pipelineId: string, bankId: string) {
  const job = await pipelineJob(db, staff, pipelineId);
  const p = await db.prepare("SELECT candidate_id, jd_id FROM pipeline WHERE id = ?").bind(pipelineId).first<{ candidate_id: string; jd_id: string }>();
  return inviteToTest(db, { bankId, candidateId: p!.candidate_id, jdId: p!.jd_id, companyId: job.company_id }, staff.id);
}

export async function staffCommitmentLink(db: Db, staff: Staff, pipelineId: string) {
  await pipelineJob(db, staff, pipelineId);
  return reissueCommitmentLink(db, pipelineId, staff.id);
}

/**
 * How many different candidates' phone and email a person may open in a day.
 * Staff see names and CV summaries freely, but contact details are shown one
 * person at a time, each time on record, and never as a list or a file.
 */
export const CONTACT_VIEWS_PER_DAY = { recruiter: 25, manager: 50 } as const;

/**
 * A recruiter opens one candidate's phone and email to call them. Allowed only
 * for a candidate currently shown to them for this job, or already in this
 * job's pipeline. Every view is written to the access log.
 */
export async function staffContact(db: Db, staff: Staff, input: { jdId: string; candidateId: string }) {
  await jobForStaff(db, staff, input.jdId);
  const scope = await staffScope(db, staff);
  const shown = (await staffCandidates(db, staff, input.jdId)).some(c => c.candidate_id === input.candidateId);
  const inPipeline = !!await db.prepare("SELECT 1 AS x FROM pipeline WHERE jd_id = ? AND candidate_id = ?").bind(input.jdId, input.candidateId).first();
  if (!shown && !inPipeline) throw new PortalError("NOT_FOUND", "Candidate not found.", 404);
  const today = nowIso().slice(0, 10);
  if (!scope.admin) {
    const limit = CONTACT_VIEWS_PER_DAY[scope.role === "manager" ? "manager" : "recruiter"];
    const seen = await db.prepare("SELECT COUNT(DISTINCT detail) AS n, SUM(detail = ?) AS this_one FROM audit_events WHERE kind = 'access' AND actor_kind = 'staff' AND actor_id = ? AND action = 'contact_view' AND created_at >= ?").bind(input.candidateId, staff.id, today).first<{ n: number; this_one: number | null }>();
    if (!seen?.this_one && (seen?.n ?? 0) >= limit) {
      await audit(db, `staff:${staff.id}`, "contact.limit_reached", "jd", input.jdId, `${limit} per day`);
      throw new PortalError("CONTACT_LIMIT", `You have opened ${limit} candidates' contact details today, which is the daily limit. Ask the administrator if you need more.`, 429);
    }
  }
  // The contact details on the person's record; the CV's own are the fallback for records made before they were kept there.
  const row = await db.prepare(`SELECT k.display_name, k.email, k.phone, p.data FROM candidates k LEFT JOIN cvs v ON v.candidate_id = k.id AND v.is_primary = 1
      LEFT JOIN cv_profiles p ON p.cv_id = v.id WHERE k.id = ? AND k.status = 'active' ORDER BY p.version DESC LIMIT 1`).bind(input.candidateId).first<{ display_name: string; email: string; phone: string; data: string | null }>();
  if (!row) throw new PortalError("NOT_FOUND", "Candidate not found.", 404);
  let contact: { email?: string; phone?: string } = {};
  try { contact = (JSON.parse(row.data ?? "{}") as { contact?: { email?: string; phone?: string } }).contact ?? {}; } catch { /* unreadable profile */ }
  await db.prepare("INSERT INTO audit_events (id, kind, target_type, target_id, actor_kind, actor_id, action, jd_id, detail, created_at) VALUES (?, 'access', 'access', ?, 'staff', ?, 'contact_view', ?, ?, ?)").bind(newId(), input.jdId ?? "", staff.id, input.jdId, input.candidateId, nowIso()).run();
  return { name: row.display_name, phone: row.phone || contact.phone || "", email: row.email || contact.email || "" };
}

export async function staffSubmit(db: Db, secret: string, staff: Staff, input: { jdId: string; candidateId: string; note: string }) {
  const job = await jobForStaff(db, staff, input.jdId);
  // Staff can submit only a candidate currently shown to them.
  if (!staff.admin && !(await staffCandidates(db, staff, input.jdId)).some(c => c.candidate_id === input.candidateId)) throw new PortalError("NOT_FOUND", "Candidate not found.", 404);
  return submitByRecruiter(db, secret, { companyId: job.company_id, jdId: input.jdId, candidateId: input.candidateId, note: input.note }, staff.id);
}

async function pipelineJob(db: Db, staff: Staff, pipelineId: string) {
  const p = await db.prepare("SELECT jd_id FROM pipeline WHERE id = ?").bind(pipelineId).first<{ jd_id: string }>();
  if (!p) throw new PortalError("NOT_FOUND", "Pipeline entry not found.", 404);
  try { return await jobForStaff(db, staff, p.jd_id); } catch { throw new PortalError("NOT_FOUND", "Pipeline entry not found.", 404); }
}

export async function staffMoveStage(db: Db, staff: Staff, pipelineId: string, input: StageInput) {
  const job = await pipelineJob(db, staff, pipelineId);
  return moveStage(db, job.company_id, `staff:${staff.id}`, pipelineId, input);
}

export async function staffScheduleInterview(db: Db, staff: Staff, pipelineId: string, input: InterviewInput) {
  const job = await pipelineJob(db, staff, pipelineId);
  return scheduleInterview(db, job.company_id, `staff:${staff.id}`, pipelineId, input);
}

// ---------------------------------------------------------------- assignment

/** Admin only: give a client to a team (or to none). Job assignments to people outside the new team are cleared. */
export async function assignClientTeam(db: Db, staff: Staff, companyId: string, teamId: string | null) {
  if (!staff.admin) throw new PortalError("ADMIN_ONLY", "Only an administrator can assign a client to a team.", 403);
  if (teamId && !await db.prepare("SELECT id FROM platform_teams WHERE id = ?").bind(teamId).first()) throw new PortalError("NOT_FOUND", "Team not found.", 404);
  const r = await db.prepare("UPDATE companies SET team_id = ? WHERE id = ?").bind(teamId, companyId).run();
  if (!r.meta.changes) throw new PortalError("NOT_FOUND", "Client not found.", 404);
  await db.prepare(`UPDATE jds SET recruiter_id = NULL WHERE company_id = ? AND recruiter_id IS NOT NULL
    AND recruiter_id NOT IN (SELECT user_id FROM platform_team_members WHERE team_id = ?)`).bind(companyId, teamId ?? "").run();
  await audit(db, `staff:${staff.id}`, "client.team_assigned", "company", companyId, teamId ?? "none");
}

/** Admin, or the manager of the client's team: assign a job to a member of that team (or to nobody). */
export async function assignJobRecruiter(db: Db, staff: Staff, jdId: string, userId: string | null) {
  const job = await jobForStaff(db, staff, jdId);
  const scope = await staffScope(db, staff);
  if (!scope.admin && !(job.team_id && scope.managedTeams.includes(job.team_id))) throw new PortalError("MANAGER_ONLY", "Only the team's manager or an administrator can assign this job.", 403);
  if (userId) {
    if (!job.team_id) throw new PortalError("NO_TEAM", "Assign the client to a team first.");
    const member = await db.prepare("SELECT 1 AS x FROM platform_team_members m JOIN platform_users u ON u.id = m.user_id WHERE m.team_id = ? AND m.user_id = ? AND u.status != 'disabled'").bind(job.team_id, userId).first();
    if (!member) throw new PortalError("NOT_IN_TEAM", "Choose a member of the client's team.");
  }
  await db.prepare("UPDATE jds SET recruiter_id = ? WHERE id = ?").bind(userId, jdId).run();
  await audit(db, `staff:${staff.id}`, "jd.recruiter_assigned", "jd", jdId, userId ?? "none");
}

/** Admin only: make a team member the team's manager, or remove that role. */
export async function setTeamManager(db: Db, staff: Staff, teamId: string, userId: string, manager: boolean) {
  if (!staff.admin) throw new PortalError("ADMIN_ONLY", "Only an administrator can choose team managers.", 403);
  const r = await db.prepare("UPDATE platform_team_members SET is_manager = ? WHERE team_id = ? AND user_id = ?").bind(manager ? 1 : 0, teamId, userId).run();
  if (!r.meta.changes) throw new PortalError("NOT_FOUND", "That person is not a member of the team.", 404);
  await audit(db, `staff:${staff.id}`, manager ? "team.manager_set" : "team.manager_removed", "team", teamId, userId);
}

// ---------------------------------------------------------------- team managers

/** Admin, or the manager of this team. */
export async function canManageTeam(db: Db, staff: Staff, teamId: string) {
  if (staff.admin) return !!await db.prepare("SELECT id FROM platform_teams WHERE id = ?").bind(teamId).first();
  return !!await db.prepare("SELECT 1 AS x FROM platform_team_members WHERE team_id = ? AND user_id = ? AND is_manager = 1").bind(teamId, staff.id).first();
}

/** A manager removes someone from their own team. The person's account stays; their job assignments in the team are cleared. */
export async function removeTeamMember(db: Db, staff: Staff, teamId: string, userId: string) {
  if (!await canManageTeam(db, staff, teamId)) throw new PortalError("NOT_FOUND", "Team not found.", 404);
  if (userId === staff.id) throw new PortalError("SELF", "You cannot remove yourself from the team.");
  const member = await db.prepare("SELECT is_manager FROM platform_team_members WHERE team_id = ? AND user_id = ?").bind(teamId, userId).first<{ is_manager: number }>();
  if (!member) throw new PortalError("NOT_FOUND", "That person is not in the team.", 404);
  if (member.is_manager && !staff.admin) throw new PortalError("ADMIN_ONLY", "Only an administrator can remove a team manager.", 403);
  await db.batch([
    db.prepare("DELETE FROM platform_team_members WHERE team_id = ? AND user_id = ?").bind(teamId, userId),
    db.prepare("UPDATE jds SET recruiter_id = NULL WHERE recruiter_id = ? AND company_id IN (SELECT id FROM companies WHERE team_id = ?)").bind(userId, teamId),
  ]);
  await audit(db, `staff:${staff.id}`, "team.member_removed", "team", teamId, userId);
}

// ---------------------------------------------------------------- WhatsApp set-up

/** WhatsApp set-ups this person may see: the admin sees the admin's and every team's; a manager sees their teams'. */
export async function staffMessaging(db: Db, staff: Staff) {
  const scope = await staffScope(db, staff);
  const teams = scope.admin ? (await db.prepare("SELECT id, name FROM platform_teams ORDER BY name").all<{ id: string; name: string }>()).results
    : scope.managedTeams.length ? (await db.prepare(`SELECT id, name FROM platform_teams WHERE id IN (${marks(scope.managedTeams)}) ORDER BY name`).bind(...scope.managedTeams).all<{ id: string; name: string }>()).results : [];
  const scopes = [...(scope.admin ? ["admin"] : []), ...teams.map(t => `team:${t.id}`)];
  const saved = await messagingFor(db, scopes);
  const queue = scope.admin ? await db.prepare("SELECT status, COUNT(*) AS n FROM messages WHERE channel = 'whatsapp' GROUP BY status").all() : { results: [] };
  return { scopes: scopes.map(s => ({ scope: s, label: s === "admin" ? "Jobboard300 (admin)" : teams.find(t => `team:${t.id}` === s)?.name ?? s, ...(saved.find(x => x.scope === s) ?? { whatsapp_number: "", whatsapp_enabled: 0, admin_override: 0 }) })), queue: queue.results };
}

export async function setStaffMessaging(db: Db, staff: Staff, scope: string, input: { number: string; enabled: boolean; override?: boolean }) {
  if (scope === "admin") { if (!staff.admin) throw new PortalError("ADMIN_ONLY", "Only an administrator can change the main WhatsApp set-up.", 403); }
  else if (!scope.startsWith("team:") || !await canManageTeam(db, staff, scope.slice(5))) throw new PortalError("NOT_FOUND", "Team not found.", 404);
  await saveMessaging(db, scope, input, `staff:${staff.id}`);
  await audit(db, `staff:${staff.id}`, "messaging.saved", "messaging", scope, input.enabled ? "enabled" : "disabled");
}
