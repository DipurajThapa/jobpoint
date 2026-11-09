import { isOwnerRequest } from "@/lib/admin";
import { clean, errorJson, json, sameOrigin } from "@/lib/http";
import { apiKey, audit, loadJob, loadRequirements } from "@/lib/ats/server";
import { analyseCv, CvReadError, MAX_CV_BYTES, screen } from "@/lib/ats/pipeline";
import { parseJobDescription, sanitiseRequirements } from "@/lib/ats/jd-parser";

export const dynamic = "force-dynamic";

/**
 * One-off check of a CV that is not in the pipeline (for example, one received
 * by email) against a stored role or a pasted job description. Nothing about
 * the CV is stored; only an audit entry without CV content is written.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return errorJson("Cross-site requests are not accepted.", 403);
  if (!await isOwnerRequest(request)) return errorJson("Sign-in required.", 401);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_CV_BYTES + 40_000) return errorJson("The upload exceeds the 5 MB limit.", 413);
  try {
    const form = await request.formData();
    const file = form.get("resume");
    if (!(file instanceof File) || !file.size) return errorJson("Attach a CV as a PDF or DOCX file.");
    const jobId = clean(form.get("jobId"), 60);
    let requirements;
    if (jobId) {
      const job = await loadJob(jobId);
      if (!job) return errorJson("Role not found.", 404);
      requirements = (await loadRequirements(job)).requirements;
    } else {
      const edited = form.get("requirements");
      const title = clean(form.get("title"), 160), description = clean(form.get("description"), 8000);
      if (typeof edited === "string" && edited) {
        try { requirements = sanitiseRequirements(JSON.parse(edited), title || "Pasted role"); } catch { return errorJson("The requirements could not be read."); }
      } else {
        if (!title || description.length < 30) return errorJson("Choose a role, or paste a job title and a job description of at least 30 characters.");
        requirements = parseJobDescription({ title, description, location: clean(form.get("location"), 120), workMode: clean(form.get("workMode"), 40) });
      }
    }
    if (!requirements) return errorJson("The requirements could not be read.");
    let profile;
    try {
      profile = await analyseCv({ bytes: new Uint8Array(await file.arrayBuffer()), fileName: file.name.replace(/[\\/\r\n\0]/g, "_").slice(0, 140), useAi: form.get("useAi") === "yes" && !!apiKey(), apiKey: apiKey() });
    } catch (error) {
      if (error instanceof CvReadError) return errorJson(error.message, 422);
      throw error;
    }
    const result = screen(profile, requirements);
    await audit(request, "ats.one_off_check", jobId ? "job" : "pasted_role", jobId || crypto.randomUUID(), profile.source.method).run();
    return json({ profile, requirements, result });
  } catch { return errorJson("The CV could not be checked. Try again in a moment.", 503); }
}
