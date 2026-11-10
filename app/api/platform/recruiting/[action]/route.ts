// Recruiting tool API for Jobboard300 staff. Access needs a Working Platform
// session and the Recruiting tool; what each person can see or change is then
// scoped by team and assignment in lib/portal/staff.ts.
import { authorizeApi } from "@/lib/platform/auth";
import { portalDb, portalSecret, json, fail, failFrom } from "@/lib/portal/session";
import { assignClientTeam, assignJobRecruiter, setTeamManager, staffCandidates, staffMoveStage, staffPipeline, staffScheduleInterview, staffSubmit, staffWork, type Staff } from "@/lib/portal/staff";
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
    if (action === "work") return json({ ...await staffWork(db, staff), canEdit: user.access.recruiting !== "view", me: user.id });
    if (action === "candidates") return json({ candidates: await staffCandidates(db, staff, url.searchParams.get("jd") ?? "") });
    if (action === "pipeline") return json({ pipeline: await staffPipeline(db, staff, url.searchParams.get("jd") ?? ""), reasons: REASONS, labels: STAGE_LABEL });
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
    if (action === "submit") { const out = await staffSubmit(db, portalSecret(), staff, { jdId: s(b.jdId, 60), candidateId: s(b.candidateId, 60), note: s(b.note, 2000) }); return json({ ...out, message: "Submitted to the client." }, 201); }
    if (action === "stage") {
      const out = await staffMoveStage(db, staff, s(b.pipelineId, 60), { stage: s(b.stage, 20), reason: s(b.reason, 40), note: s(b.note, 1000), offerCtcInr: b.offerCtcInr == null || b.offerCtcInr === "" ? null : Number(b.offerCtcInr), offerDate: s(b.offerDate, 10), joiningDate: s(b.joiningDate, 10), lastWorkingDay: s(b.lastWorkingDay, 10), competingOffers: s(b.competingOffers, 300) });
      return json({ ...out, message: `Moved to “${STAGE_LABEL[out.stage as keyof typeof STAGE_LABEL]}”.` });
    }
    if (action === "interview") { const out = await staffScheduleInterview(db, staff, s(b.pipelineId, 60), { round: s(b.round, 80), scheduledAt: s(b.scheduledAt, 40), mode: s(b.mode, 20), location: s(b.location, 300), interviewer: s(b.interviewer, 120) }); return json({ ...out, message: "Interview scheduled." }, 201); }
    if (action === "assign-team") { await assignClientTeam(db, staff, s(b.companyId, 60), s(b.teamId, 60) || null); return json({ message: "Client assigned." }); }
    if (action === "assign-recruiter") { await assignJobRecruiter(db, staff, s(b.jdId, 60), s(b.userId, 60) || null); return json({ message: "Job assigned." }); }
    if (action === "team-manager") { await setTeamManager(db, staff, s(b.teamId, 60), s(b.userId, 60), b.manager === true); return json({ message: b.manager === true ? "Team manager set." : "Team manager role removed." }); }
    return fail("Unknown action.", 404);
  } catch (error) { return failFrom(error); }
}
