// Recruiting tool API for Jobboard300 staff. Access needs a Working Platform
// session and the Recruiting tool; what each person can see or change is then
// scoped by team and assignment in lib/portal/staff.ts.
import { auditStatement, authorizeApi, db as platformDb, issueToken, linkUrl, newId, nowIso } from "@/lib/platform/auth";
import { cleanEmail, cleanName, validEmail } from "@/lib/platform/users";
import { env } from "cloudflare:workers";
import { portalDb, portalSecret, json, fail, failFrom, siteLink } from "@/lib/portal/session";
import { extractText } from "@/lib/ats/extract";
import { renderCvPdf } from "@/lib/portal/watermark";
import { drainQueue } from "@/lib/portal/queue";
import { redactContacts } from "@/lib/portal/policy";
import { assignClientTeam, assignJobRecruiter, canManageTeam, markChangesSeen, removeTeamMember, setStaffMessaging, setTeamManager, staffCandidates, staffCloseJob, staffCloseRemaining, staffContact, staffCvSource, staffMessaging, staffMoveStage, staffPass, staffPassedCandidates, staffProfile, staffRecordInterview, staffRescheduleInterview, staffUnpass, PASS_REASONS, staffPipeline, staffJobTests, setJobAptitude, staffInviteToTest, staffCommitmentLink, staffScheduleInterview, staffSubmit, staffWork, type Staff } from "@/lib/portal/staff";
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
    if (action === "candidates") {
      const jd = url.searchParams.get("jd") ?? "";
      await staffCandidates(db, staff, jd); // 404 for a job this person cannot see, before any work is done
      // There is no scheduler on this hosting, so opening a job is what keeps the ranking moving: score a bounded batch first,
      // and say so when work is still waiting, so a short list is not mistaken for a complete one.
      let ranking = (await db.prepare("SELECT COUNT(*) AS n FROM score_queue").first<{ n: number }>())?.n ?? 0;
      if (ranking) ranking = (await drainQueue(db, portalSecret(), 200)).remaining;
      return json({ candidates: await staffCandidates(db, staff, jd), passReasons: PASS_REASONS, full: staff.admin, ranking: { waiting: ranking } });
    }
    if (action === "passed") return json({ passed: await staffPassedCandidates(db, staff, url.searchParams.get("jd") ?? "") });
    if (action === "profile") return json(await staffProfile(db, staff, { jdId: url.searchParams.get("jd") ?? "", candidateId: url.searchParams.get("candidate") ?? "" }));
    if (action === "cv") {
      // A copy for reading, rendered from the parsed profile and the CV text with phone, email and links removed.
      // Contact details are opened one person at a time with “Show phone and email”, which is counted and logged.
      const src = await staffCvSource(db, staff, { jdId: url.searchParams.get("jd") ?? "", candidateId: url.searchParams.get("candidate") ?? "" });
      const object = env.BUCKET ? await env.BUCKET.get(src.r2Key) : null;
      if (!object) return fail("The CV file is not available.", 404);
      const text = (await extractText(new Uint8Array(await object.arrayBuffer()), src.fileName.toLowerCase().endsWith(".pdf") ? "pdf" : "docx")).text;
      const pdf = await renderCvPdf(src.profile, redactContacts(text), { company: "Jobboard300 staff (internal reading copy)", traceId: "internal", date: new Date().toISOString().slice(0, 10) });
      return new Response(pdf as Uint8Array<ArrayBuffer>, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="cv-${src.name.replace(/[^A-Za-z0-9]+/g, "-").slice(0, 40) || "candidate"}.pdf"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
    }
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
    if (action === "test-invite") { const out = await staffInviteToTest(db, staff, s(b.pipelineId, 60), s(b.bankId, 60)); return json({ message: "Test sent. One-time link for the candidate (valid for 7 days):", link: siteLink(request, out.link) }, 201); }
    if (action === "commitment-link") return json({ message: "New one-time link for the candidate's commitment (the old one no longer works):", link: siteLink(request, await staffCommitmentLink(db, staff, s(b.pipelineId, 60))) });
    if (action === "contact") return json(await staffContact(db, staff, { jdId: s(b.jdId, 60), candidateId: s(b.candidateId, 60) }));
    if (action === "pass") { await staffPass(db, staff, { jdId: s(b.jdId, 60), candidateId: s(b.candidateId, 60), reason: s(b.reason, 40), note: s(b.note, 500) }); return json({ message: "Noted. The next best candidate is shown." }); }
    if (action === "submit") { const out = await staffSubmit(db, portalSecret(), staff, { jdId: s(b.jdId, 60), candidateId: s(b.candidateId, 60), note: s(b.note, 2000) }); return json({ ...out, message: "Submitted to the client." }, 201); }
    if (action === "unpass") { await staffUnpass(db, staff, { jdId: s(b.jdId, 60), candidateId: s(b.candidateId, 60) }); return json({ message: "Back on the shortlist." }); }
    if (action === "changes-seen") { await markChangesSeen(db, staff); return json({ message: "ok" }); }
    if (action === "interview-record") {
      const out = await staffRecordInterview(db, staff, s(b.interviewId, 60), { status: s(b.status, 20), outcome: s(b.outcome, 20), rating: b.rating == null || b.rating === "" ? null : Number(b.rating), feedback: s(b.feedback, 2000), rejectReason: s(b.rejectReason, 40) });
      return json({ ...out, message: out.moved ? "Result recorded and the candidate is marked “Not selected”." : out.suggest === "rejected" ? "Result recorded. Move the candidate to “Not selected” if the client has decided." : "Result recorded on the client's behalf." });
    }
    if (action === "interview-reschedule") { await staffRescheduleInterview(db, staff, s(b.interviewId, 60), { scheduledAt: s(b.scheduledAt, 40), mode: s(b.mode, 20), location: s(b.location, 300), interviewer: s(b.interviewer, 120) }); return json({ message: "Interview rescheduled. The candidate and the client are told." }); }
    if (action === "jd-fill") { const out = await staffCloseRemaining(db, staff, s(b.jdId, 60)); return json({ ...out, message: out.closed ? `${out.closed} candidate${out.closed === 1 ? "" : "s"} closed as “position filled” and told.` : "Nobody else was in process." }); }
    if (action === "jd-close") { const out = await staffCloseJob(db, staff, s(b.jdId, 60)); return json({ ...out, message: "Job closed." }); }
    if (action === "stage") {
      const out = await staffMoveStage(db, staff, s(b.pipelineId, 60), { stage: s(b.stage, 20), reason: s(b.reason, 40), note: s(b.note, 1000), offerCtcInr: b.offerCtcInr == null || b.offerCtcInr === "" ? null : Number(b.offerCtcInr), offerDate: s(b.offerDate, 10), joiningDate: s(b.joiningDate, 10), lastWorkingDay: s(b.lastWorkingDay, 10), competingOffers: s(b.competingOffers, 300) });
      return json({ ...out, message: `Moved to “${STAGE_LABEL[out.stage as keyof typeof STAGE_LABEL]}”.${out.filled ? ` Every opening is now filled and the job is closed.${out.filled.remaining ? ` ${out.filled.remaining} other candidate(s) are still in process: close them out as “position filled” from the job.` : ""}` : ""}${out.replacement ? " This hire replaces someone who left inside the guarantee: no new fee." : ""}` });
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
