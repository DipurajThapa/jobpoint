import { isOwnerRequest } from "@/lib/admin";
import { clean, errorJson, json, sameOrigin } from "@/lib/http";
import { audit, db } from "@/lib/ats/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
type Row = { id: string; application_id: string; job_id: string | null; profile: string; requirements: string; result: string; decision: string; decision_reason: string; decided_at: string | null; created_at: string; full_name: string };

/** Full screening report: parsed CV profile, requirements used and the scored result. */
export async function GET(request: Request, context: Params) {
  if (!await isOwnerRequest(request)) return errorJson("Sign-in required.", 401);
  const { id } = await context.params;
  try {
    const row = await db().prepare("SELECT s.*, a.full_name FROM ats_screenings s JOIN applications a ON a.id = s.application_id WHERE s.id = ?").bind(id).first<Row>();
    if (!row) return errorJson("Screening not found.", 404);
    return json({
      screening: { id: row.id, applicationId: row.application_id, jobId: row.job_id, createdAt: row.created_at, decision: row.decision, decisionReason: row.decision_reason, decidedAt: row.decided_at, candidateName: row.full_name },
      profile: JSON.parse(row.profile), requirements: JSON.parse(row.requirements), result: JSON.parse(row.result),
    });
  } catch { return errorJson("The screening could not be loaded.", 503); }
}

/** Record the recruiter's review of the recommendation. Disagreeing needs a reason. */
export async function PATCH(request: Request, context: Params) {
  if (!sameOrigin(request)) return errorJson("Cross-site requests are not accepted.", 403);
  if (!await isOwnerRequest(request)) return errorJson("Sign-in required.", 401);
  if (Number(request.headers.get("content-length") ?? 0) > 4_000) return errorJson("Request too large.", 413);
  const { id } = await context.params;
  try {
    const body = await request.json() as Record<string, unknown>;
    const decision = clean(body.decision, 20), reason = clean(body.reason, 1000);
    if (!["agree", "disagree", ""].includes(decision)) return errorJson("Choose agree or disagree.");
    if (decision === "disagree" && reason.length < 5) return errorJson("Give a short reason when you disagree with the recommendation.");
    const row = await db().prepare("SELECT application_id FROM ats_screenings WHERE id = ?").bind(id).first<{ application_id: string }>();
    if (!row) return errorJson("Screening not found.", 404);
    const now = new Date().toISOString();
    await db().batch([
      db().prepare("UPDATE ats_screenings SET decision = ?, decision_reason = ?, decided_at = ? WHERE id = ?").bind(decision, reason, decision ? now : null, id),
      audit(request, "ats.reviewed", "application", row.application_id, decision || "cleared"),
    ]);
    return json({ message: decision === "agree" ? "Recorded: you agree with the recommendation." : decision === "disagree" ? "Recorded: you disagree, with your reason." : "Review cleared.", decidedAt: decision ? now : null });
  } catch { return errorJson("The review could not be saved.", 503); }
}
