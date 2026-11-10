// Jobboard300 staff roles and assignment (the Recruiting tool in the Working Platform).
// - Admin (platform administrator): sees and assigns everything.
// - Team manager (flagged on a team; a franchise is a team with its own manager):
//   sees the team's clients and jobs and assigns jobs to the team's members only.
// - Recruiter (team member): sees the team's clients, and their jobs that are
//   unassigned or assigned to them.
// A client company belongs to at most one team, so nobody outside that team can
// fulfil its jobs. Every read and write below is scoped on the server; a record
// outside the caller's scope is reported as "not found", never "forbidden".

import { audit, PortalError, type Db } from "./db";
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

export async function staffCandidates(db: Db, staff: Staff, jdId: string) {
  await jobForStaff(db, staff, jdId);
  return submissionCandidates(db, jdId);
}

export async function staffPipeline(db: Db, staff: Staff, jdId: string) {
  const job = await jobForStaff(db, staff, jdId);
  return pipelineView(db, job.company_id, jdId);
}

export async function staffSubmit(db: Db, secret: string, staff: Staff, input: { jdId: string; candidateId: string; note: string }) {
  const job = await jobForStaff(db, staff, input.jdId);
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
