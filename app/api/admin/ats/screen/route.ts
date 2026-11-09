import { env } from "cloudflare:workers";
import { isOwnerRequest } from "@/lib/admin";
import { clean, errorJson, json, sameOrigin } from "@/lib/http";
import { actor, apiKey, audit, db, loadJob, loadRequirements } from "@/lib/ats/server";
import { analyseCv, CvReadError, screen } from "@/lib/ats/pipeline";

export const dynamic = "force-dynamic";

/** Screen one stored application's CV against a role and keep the result. Owner only. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return errorJson("Cross-site requests are not accepted.", 403);
  if (!await isOwnerRequest(request)) return errorJson("Sign-in required.", 401);
  if (Number(request.headers.get("content-length") ?? 0) > 2_000) return errorJson("Request too large.", 413);
  try {
    const body = await request.json() as Record<string, unknown>;
    const applicationId = clean(body.applicationId, 60), jobId = clean(body.jobId, 60);
    const job = await loadJob(jobId);
    if (!job) return errorJson("Role not found.", 404);
    const app = await db().prepare("SELECT id, job_id, full_name, location, desired_role, resume_key, resume_name, future_consent FROM applications WHERE id = ?")
      .bind(applicationId).first<{ id: string; job_id: string | null; full_name: string; location: string; desired_role: string; resume_key: string | null; resume_name: string | null; future_consent: number }>();
    if (!app) return errorJson("Application not found.", 404);
    // Only applicants for this role, or general registrations that agreed to be considered for other roles.
    if (app.job_id !== jobId && !(app.job_id === null && app.future_consent)) return errorJson("This candidate did not apply for this role or agree to be considered for other roles.", 403);
    if (!app.resume_key) return errorJson("This application has no CV to screen.", 422);
    if (!env.BUCKET) return errorJson("CV storage is unavailable.", 503);
    const object = await env.BUCKET.get(app.resume_key);
    if (!object) return errorJson("The stored CV could not be found.", 404);
    const useAi = body.useAi === true && !!apiKey();
    let profile;
    try {
      profile = await analyseCv({ bytes: new Uint8Array(await object.arrayBuffer()), fileName: app.resume_name ?? "cv.pdf", knownName: app.full_name, knownLocation: app.location, useAi, apiKey: apiKey() });
    } catch (error) {
      if (error instanceof CvReadError) return errorJson(error.message, 422);
      throw error;
    }
    const { requirements } = await loadRequirements(job);
    const result = screen(profile, requirements, app.desired_role);
    const id = crypto.randomUUID(), now = new Date().toISOString();
    await db().batch([
      db().prepare(`INSERT INTO ats_screenings (id, application_id, job_id, method, model, engine_version, cv_sha256, score, verdict, profile, requirements, result, created_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, app.id, jobId, profile.source.method, profile.source.model, result.engineVersion, profile.source.sha256, result.score, result.verdict, JSON.stringify(profile), JSON.stringify(requirements), JSON.stringify(result), now, actor(request)),
      audit(request, "ats.screened", "application", app.id, `job ${jobId} · ${profile.source.method}${profile.source.model ? ` (${profile.source.model})` : ""} · ${result.engineVersion}`),
    ]);
    return json({ screening: { id, applicationId: app.id, jobId, createdAt: now, decision: "", decisionReason: "" }, profile, requirements, result });
  } catch { return errorJson("The CV could not be screened. Try again in a moment.", 503); }
}
