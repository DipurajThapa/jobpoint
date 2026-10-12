import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { applications } from "@/db/schema";
import { clean, errorJson, isJobOpen, json, limitSubmission, sameOrigin, validEmail } from "@/lib/http";
import { and, eq, gt, isNull } from "drizzle-orm";

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
    const desiredRole = clean(form.get("desiredRole"), 160), skills = clean(form.get("skills"), 500);
    const education = clean(form.get("education"), 160), availability = clean(form.get("availability"), 100);
    const jobId = clean(form.get("jobId"), 60) || null;
    const shareConsent = form.get("shareConsent") === "yes", futureConsent = form.get("futureConsent") === "yes";
    if (!fullName || !validEmail(email) || phone.replace(/\D/g, "").length < 7 || !location || !experience || form.get("consent") !== "yes" || form.get("adult") !== "yes") return errorJson("Please complete the required fields and confirm you are at least 18.");
    if (!jobId && !futureConsent) return errorJson("Please opt in to future opportunities to register your profile.");
    if (jobId && !await isJobOpen(jobId)) return errorJson("This role is no longer accepting applications.", 410);
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);
    const db = getDb();
    const [recent] = await db.select({ id: applications.id }).from(applications).where(and(eq(applications.email, email), jobId ? eq(applications.jobId, jobId) : isNull(applications.jobId), gt(applications.createdAt, cutoff))).limit(1);
    if (recent) return json({ message: "Thank you. Your details have been received." }, 201);
    const file = form.get("resume");
    let resumeKey: string | null = null, resumeName: string | null = null, resumeType: string | null = null, resumeSize: number | null = null;
    if (file instanceof File && file.size) {
      if (file.size > maxResumeBytes) return errorJson("The upload exceeds the 5 MB limit.", 413);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const type = file.type;
      const pdf = type === "application/pdf" && file.name.toLowerCase().endsWith(".pdf") && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-" && new TextDecoder().decode(bytes.slice(-2048)).includes("%%EOF");
      const docx = type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && file.name.toLowerCase().endsWith(".docx") && bytes[0] === 0x50 && bytes[1] === 0x4b && new TextDecoder().decode(bytes).includes("[Content_Types].xml");
      if (!pdf && !docx) return errorJson("Upload a valid PDF or DOCX file.");
      if (!env.BUCKET) return errorJson("Resume storage is not ready. Please submit without an attachment or try again later.", 503);
      resumeKey = `resumes/${crypto.randomUUID()}`; resumeName = file.name.replace(/[\\/\r\n\0]/g, "_").slice(0, 140); resumeType = type; resumeSize = file.size;
      await env.BUCKET.put(resumeKey, bytes, { httpMetadata: { contentType: type, cacheControl: "private, no-store" } });
    }
    const id = crypto.randomUUID();
    try { await db.insert(applications).values({ id, jobId, fullName, email, phone, location, experience, desiredRole, skills, education, availability, message, resumeKey, resumeName, resumeType, resumeSize, consent: true, shareConsent, futureConsent, privacyVersion: "2026-10-13", consentAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); }
    catch (e) { if (resumeKey && env.BUCKET) await env.BUCKET.delete(resumeKey); throw e; }
    return json({ message: "Thank you. Your application details have been received. We’ll contact you if a relevant opportunity is available." }, 201);
  } catch { return errorJson("We couldn't submit your details. Please try again in a moment.", 503); }
}
