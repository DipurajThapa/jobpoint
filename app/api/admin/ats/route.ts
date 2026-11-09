import { isOwnerRequest } from "@/lib/admin";
import { errorJson, json } from "@/lib/http";
import { aiAvailable, db } from "@/lib/ats/server";
import { WEIGHTS } from "@/lib/ats/score";
import { AI_MODEL, ATS_ENGINE_VERSION } from "@/lib/ats/types";

export const dynamic = "force-dynamic";

/** Roles available for screening, with applicant and screening counts. Owner only. */
export async function GET(request: Request) {
  if (!await isOwnerRequest(request)) return errorJson("Sign-in required.", 401);
  try {
    const [{ results: roles }, pool] = await Promise.all([
      db().prepare(`SELECT j.id, j.title, j.location, j.status,
          (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) AS applicants,
          (SELECT COUNT(DISTINCT s.application_id) FROM ats_screenings s WHERE s.job_id = j.id) AS screened,
          EXISTS (SELECT 1 FROM ats_job_profiles p WHERE p.job_id = j.id) AS edited
        FROM jobs j ORDER BY CASE j.status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, j.created_at DESC LIMIT 200`).all(),
      db().prepare("SELECT COUNT(*) AS n FROM applications WHERE job_id IS NULL AND future_consent = 1 AND resume_key IS NOT NULL").first<{ n: number }>(),
    ]);
    return json({ roles, poolSize: pool?.n ?? 0, ai: { available: aiAvailable(), model: AI_MODEL }, engineVersion: ATS_ENGINE_VERSION, weights: WEIGHTS });
  } catch { return errorJson("Screening data is temporarily unavailable.", 503); }
}
