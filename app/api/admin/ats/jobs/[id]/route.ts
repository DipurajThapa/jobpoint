import { isOwnerRequest } from "@/lib/admin";
import { errorJson, json, sameOrigin } from "@/lib/http";
import { actor, audit, db, loadJob, loadRequirements, requirementsFromJob } from "@/lib/ats/server";
import { sanitiseRequirements } from "@/lib/ats/jd-parser";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** A role's requirements and its candidates ranked by their latest screening. */
export async function GET(request: Request, context: Params) {
  if (!await isOwnerRequest(request)) return errorJson("Sign-in required.", 401);
  const { id } = await context.params;
  try {
    const job = await loadJob(id);
    if (!job) return errorJson("Role not found.", 404);
    const includePool = new URL(request.url).searchParams.get("pool") === "1";
    const { requirements, updatedAt } = await loadRequirements(job);
    // Applicants for this role, plus (on request) general registrations that agreed to be considered for other roles.
    const { results } = await db().prepare(`SELECT a.id, a.full_name AS fullName, a.location, a.desired_role AS desiredRole, a.status, a.created_at AS appliedAt,
        a.job_id IS NULL AS fromPool, a.resume_key IS NOT NULL AS hasCv,
        s.id AS screeningId, s.score, s.verdict, s.method, s.created_at AS screenedAt, s.decision
      FROM applications a
      LEFT JOIN ats_screenings s ON s.id = (SELECT id FROM ats_screenings WHERE application_id = a.id AND job_id = ?1 ORDER BY created_at DESC LIMIT 1)
      WHERE a.job_id = ?1 OR (?2 = 1 AND a.job_id IS NULL AND a.future_consent = 1)
      ORDER BY s.score IS NULL, s.score DESC, a.created_at DESC LIMIT 300`).bind(id, includePool ? 1 : 0).all();
    return json({
      job: { id: job.id, title: job.title, company: job.company, location: job.location, workMode: job.work_mode, status: job.status, description: job.description, requirements: job.requirements },
      requirements, requirementsUpdatedAt: updatedAt,
      candidates: results.map(r => ({ ...r, fromPool: !!r.fromPool, hasCv: !!r.hasCv, stale: !!(updatedAt && r.screenedAt && String(r.screenedAt) < updatedAt) })),
    });
  } catch { return errorJson("Screening data is temporarily unavailable.", 503); }
}

/** Save recruiter-edited requirements, or { regenerate: true } to go back to the JD-derived version. */
export async function PUT(request: Request, context: Params) {
  if (!sameOrigin(request)) return errorJson("Cross-site requests are not accepted.", 403);
  if (!await isOwnerRequest(request)) return errorJson("Sign-in required.", 401);
  if (Number(request.headers.get("content-length") ?? 0) > 20_000) return errorJson("Request too large.", 413);
  const { id } = await context.params;
  try {
    const job = await loadJob(id);
    if (!job) return errorJson("Role not found.", 404);
    const body = await request.json() as Record<string, unknown>;
    const now = new Date().toISOString();
    if (body.regenerate === true) {
      await db().batch([db().prepare("DELETE FROM ats_job_profiles WHERE job_id = ?").bind(id), audit(request, "ats.requirements_reset", "job", id)]);
      return json({ requirements: requirementsFromJob(job), requirementsUpdatedAt: null, message: "Requirements regenerated from the job description." });
    }
    const requirements = sanitiseRequirements(body.requirements, job.title);
    if (!requirements) return errorJson("Send the requirements to save.");
    if (!requirements.mustHave.length) return errorJson("Add at least one must-have skill.");
    await db().batch([
      db().prepare("INSERT INTO ats_job_profiles (job_id, requirements, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(job_id) DO UPDATE SET requirements = excluded.requirements, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
        .bind(id, JSON.stringify(requirements), now, actor(request)),
      audit(request, "ats.requirements_saved", "job", id),
    ]);
    return json({ requirements, requirementsUpdatedAt: now, message: "Requirements saved. Re-screen candidates to apply them." });
  } catch { return errorJson("The requirements could not be saved.", 503); }
}
