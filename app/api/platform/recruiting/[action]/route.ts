// Recruiting tool API for Jobboard300 staff. Access needs a Working Platform
// session and the Recruiting tool; what each person can see or change is then
// scoped by team and assignment in lib/portal/staff.ts.
import { auditStatement, authorizeApi, db as platformDb, issueToken, linkUrl, newId, nowIso } from "@/lib/platform/auth";
import { cleanEmail, cleanName, validEmail } from "@/lib/platform/users";
import { portalDb, portalSecret, json, fail, failFrom } from "@/lib/portal/session";
import { assignClientTeam, assignJobRecruiter, canManageTeam, removeTeamMember, setStaffMessaging, setTeamManager, staffCandidates, staffMessaging, staffMoveStage, staffPass, PASS_REASONS, staffPipeline, staffJobTests, setJobAptitude, staffInviteToTest, staffCommitmentLink, staffScheduleInterview, staffSubmit, staffWork, type Staff } from "@/lib/portal/staff";
import { REASONS, STAGE_LABEL } from "@/lib/portal/client";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ action: string }> };
const s = (v: unknown, max = 200) => typeof v === "string" ? v.slice(0, max) : "";

export async function GET(request: Request, context: Ctx) {
  const user = await authorizeApi(request, { tool: "recruiting", min: "view" });
  if (user instanceof Response) return user;
  const { action } = await context.params;
  const db = portalDb(), staff: Staff = { id: user.id, admin: user.role === "admin" }, url = new URL(request.url);
  try {
    if (action === "work") return json({ ...await staffWork(db, staff), canEdit: user.access.recruiting !== "view", me: user.id, messaging: await staffMessaging(db, staff) });
    if (action === "candidates") return json({ candidates: await staffCandidates(db, staff, url.searchParams.get("jd") ?? ""), passReasons: PASS_REASONS, full: staff.admin });
    if (action === "pipeline") { const jd = url.searchParams.get("jd") ?? ""; return json({ pipeline: await staffPipeline(db, staff, jd), reasons: REASONS, labels: STAGE_LABEL, tests: await staffJobTests(db, staff, jd) }); }
    return fail("Unknown action.", 404);
  } catch (error) { return failFrom(error); }
}

export async function POST(request: Request, context: Ctx) {
  const user = await authorizeApi(request, { tool: "recruiting", min: "edit", mutate: true });
  if (user instanceof Response) return user;
  const { action } = await context.params;
  const db = portalDb(), staff: Staff = { id: user.id, admin: user.role === "admin" };
  try {
    const b = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (action === "job-aptitude") { await setJobAptitude(db, staff, s(b.jdId, 60), b.on === true); return json({ message: b.on === true ? "Recorded: the client opted for the aptitude test on this job." : "The aptitude test is off for this job." }); }
    if (action === "test-invite") { const out = await staffInviteToTest(db, staff, s(b.pipelineId, 60), s(b.bankId, 60)); return json({ message: "Test sent. One-time link for the candidate (valid for 7 days):", link: out.link }, 201); }
    if (action === "commitment-link") return json({ message: "New one-time link for the candidate's commitment (the old one no longer works):", link: await staffCommitmentLink(db, staff, s(b.pipelineId, 60)) });
    if (action === "pass") { await staffPass(db, staff, { jdId: s(b.jdId, 60), candidateId: s(b.candidateId, 60), reason: s(b.reason, 40), note: s(b.note, 500) }); return json({ message: "Noted. The next best candidate is shown." }); }
    if (action === "submit") { const out = await staffSubmit(db, portalSecret(), staff, { jdId: s(b.jdId, 60), candidateId: s(b.candidateId, 60), note: s(b.note, 2000) }); return json({ ...out, message: "Submitted to the client." }, 201); }
    if (action === "stage") {
      const out = await staffMoveStage(db, staff, s(b.pipelineId, 60), { stage: s(b.stage, 20), reason: s(b.reason, 40), note: s(b.note, 1000), offerCtcInr: b.offerCtcInr == null || b.offerCtcInr === "" ? null : Number(b.offerCtcInr), offerDate: s(b.offerDate, 10), joiningDate: s(b.joiningDate, 10), lastWorkingDay: s(b.lastWorkingDay, 10), competingOffers: s(b.competingOffers, 300) });
      return json({ ...out, message: `Moved to “${STAGE_LABEL[out.stage as keyof typeof STAGE_LABEL]}”.` });
    }
    if (action === "interview") { const out = await staffScheduleInterview(db, staff, s(b.pipelineId, 60), { round: s(b.round, 80), scheduledAt: s(b.scheduledAt, 40), mode: s(b.mode, 20), location: s(b.location, 300), interviewer: s(b.interviewer, 120) }); return json({ ...out, message: "Interview scheduled." }, 201); }
    if (action === "assign-team") { await assignClientTeam(db, staff, s(b.companyId, 60), s(b.teamId, 60) || null); return json({ message: "Client assigned." }); }
    if (action === "assign-recruiter") { await assignJobRecruiter(db, staff, s(b.jdId, 60), s(b.userId, 60) || null); return json({ message: "Job assigned." }); }
    if (action === "team-manager") { await setTeamManager(db, staff, s(b.teamId, 60), s(b.userId, 60), b.manager === true); return json({ message: b.manager === true ? "Team manager set." : "Team manager role removed." }); }
    if (action === "messaging") { await setStaffMessaging(db, staff, s(b.scope, 80), { number: s(b.number, 30), enabled: b.enabled === true, override: b.override === true }); return json({ message: "WhatsApp set-up saved. Messages are queued until a provider is connected." }); }
    if (action === "team-remove") { await removeTeamMember(db, staff, s(b.teamId, 60), s(b.userId, 60)); return json({ message: "Removed from the team." }); }
    if (action === "team-invite") {
      // A team manager (or an admin) invites a recruiter straight into their own team, with the Recruiting tool only.
      const teamId = s(b.teamId, 60), email = cleanEmail(b.email), name = cleanName(b.name);
      if (!await canManageTeam(db, staff, teamId)) return fail("Team not found.", 404);
      if (!validEmail(email)) return fail("Enter a valid email address.");
      const paused = await platformDb().prepare("SELECT value FROM platform_settings WHERE key='invites_enabled'").first<{ value: string }>();
      if (paused?.value === "false") return fail("Invitations are paused in system settings.", 403, "INVITES_PAUSED");
      if (await platformDb().prepare("SELECT id FROM platform_users WHERE email = ?").bind(email).first()) return fail("This email already has an account. Ask an administrator to add that person to your team.", 409, "EXISTS");
      const id = newId("u"), at = nowIso();
      await platformDb().batch([
        platformDb().prepare("INSERT INTO platform_users (id, email, name, role, status, created_at, updated_at, created_by) VALUES (?, ?, ?, 'member', 'invited', ?, ?, ?)").bind(id, email, name, at, at, user.id),
        platformDb().prepare("INSERT INTO platform_tool_access (user_id, tool_key, level, granted_by, granted_at) VALUES (?, 'recruiting', 'edit', ?, ?)").bind(id, user.id, at),
        platformDb().prepare("INSERT INTO platform_team_members (team_id, user_id) VALUES (?, ?)").bind(teamId, id),
        auditStatement(`platform:${user.id}`, "platform.user_invited.team", "platform_user", id, `team:${teamId}`),
      ]);
      const token = await issueToken(id, "invite", user.id, 72);
      return json({ id, link: linkUrl(request.url, "invite", token), message: "Recruiter added to the team. Send them this one-time link (valid for 72 hours):" }, 201);
    }
    return fail("Unknown action.", 404);
  } catch (error) { return failFrom(error); }
}
