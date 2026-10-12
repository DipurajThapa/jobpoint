import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { applications } from "@/db/schema";
import { clean, errorJson, isJobOpen, json, limitSubmission, sameOrigin, validEmail } from "@/lib/http";

export const runtime = "edge";
export const dynamic = "force-dynamic";
const maxResumeBytes = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return errorJson("Cross-site submissions are not accepted.", 403);
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > maxResumeBytes + 40_000) return errorJson("The upload exceeds the 5 MB limit.", 413);
    if (!await limitSubmission(request, "application")) return errorJson("Too many requests. Please try again later.", 429);
    const form = await request.formData();
    if (clean(form.get("website"), 200)) return json({ message: "Thank you. Your details have been received." }, 201);
    const fullName = clean(form.get("fullName"), 120), email = clean(form.get("email"), 254).toLowerCase();
    const phone = clean(form.get("phone"), 30), location = clean(form.get("location"), 100);
    const experience = clean(form.get("experience"), 1200), message = clean(form.get("message"), 1200);
    const jobId = clean(form.get("jobId"), 60) || null;
    if (!fullName || !validEmail(email) || !phone || !location || !experience || form.get("consent") !== "yes") return errorJson("Please complete the required fields and consent checkbox.");
    if (jobId && !await isJobOpen(jobId)) return errorJson("This role is no longer accepting applications.", 410);
    const file = form.get("resume");
    let resumeKey: string | null = null, resumeName: string | null = null, resumeType: string | null = null, resumeSize: number | null = null;
    if (file instanceof File && file.size) {
      if (file.size > maxResumeBytes) return errorJson("The upload exceeds the 5 MB limit.", 413);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const type = file.type;
      const pdf = type === "application/pdf" && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
      const docx = type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && bytes[0] === 0x50 && bytes[1] === 0x4b;
      if (!pdf && !docx) return errorJson("Upload a valid PDF or DOCX file.");
      if (!env.BUCKET) return errorJson("Resume storage is not ready. Please submit without an attachment or try again later.", 503);
      resumeKey = `resumes/${crypto.randomUUID()}`; resumeName = file.name.replace(/[\\/\r\n\0]/g, "_").slice(0, 140); resumeType = type; resumeSize = file.size;
      await env.BUCKET.put(resumeKey, bytes, { httpMetadata: { contentType: type, cacheControl: "private, no-store" } });
    }
    const id = crypto.randomUUID();
    try { await getDb().insert(applications).values({ id, jobId, fullName, email, phone, location, experience, message, resumeKey, resumeName, resumeType, resumeSize, consent: true }); }
    catch (e) { if (resumeKey && env.BUCKET) await env.BUCKET.delete(resumeKey); throw e; }
    return json({ message: "Thank you. Your application details have been received. We’ll contact you if a relevant opportunity is available." }, 201);
  } catch { return errorJson("We couldn't submit your details. Please try again in a moment.", 503); }
}
