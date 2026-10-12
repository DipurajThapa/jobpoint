import { env } from "cloudflare:workers";
import { isOwnerRequest } from "@/lib/admin";
import { clean, errorJson, json, sameOrigin, validEmail } from "@/lib/http";

export const dynamic = "force-dynamic";

const pipeline = ["new", "screening", "qualified", "shortlisted", "submitted", "interview", "selected", "offer", "joined", "rejected", "withdrawn", "on_hold"];
const employerStages = ["new", "contacted", "in_progress", "closed"];

function audit(request: Request, action: string, type: string, id: string) {
  return env.DB!.prepare("INSERT INTO audit_events (id, actor_id, action, target_type, target_id) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), request.headers.get("oai-authenticated-user-id"), action, type, id);
}

export async function PATCH(request: Request, context: { params: Promise<{ type: string; id: string }> }) {
  if (!sameOrigin(request)) return errorJson("Cross-site requests are not accepted.", 403);
  if (!await isOwnerRequest(request)) return errorJson("Sign-in required.", 401);
  if (Number(request.headers.get("content-length") ?? 0) > 8_000) return errorJson("Request too large.", 413);
  const { type, id } = await context.params;
  try {
    const body = await request.json() as Record<string, unknown>;
    if (type === "applications") {
      const current = await env.DB!.prepare("SELECT status, recruiter_notes, full_name, email, phone, location, experience, desired_role, skills, education, availability, share_consent, future_consent FROM applications WHERE id = ?").bind(id).first<{status: string; recruiter_notes: string; full_name: string; email: string; phone: string; location: string; experience: string; desired_role: string; skills: string; education: string; availability: string; share_consent: number; future_consent: number}>();
      if (!current) return errorJson("Application not found.", 404);
      const status = body.status === undefined ? current.status : clean(body.status, 30);
      if (!pipeline.includes(status)) return errorJson("Invalid application stage.");
      const notes = body.notes === undefined ? current.recruiter_notes : clean(body.notes, 2000);
      const profile = body.profile && typeof body.profile === "object" && !Array.isArray(body.profile) ? body.profile as Record<string, unknown> : null;
      const fullName = profile ? clean(profile.fullName, 120) : current.full_name;
      const email = profile ? clean(profile.email, 254).toLowerCase() : current.email;
      const phone = profile ? clean(profile.phone, 30) : current.phone;
      const location = profile ? clean(profile.location, 100) : current.location;
      const experience = profile ? clean(profile.experience, 1200) : current.experience;
      const desiredRole = profile ? clean(profile.desiredRole, 160) : current.desired_role;
      const skills = profile ? clean(profile.skills, 500) : current.skills;
      const education = profile ? clean(profile.education, 160) : current.education;
      const availability = profile ? clean(profile.availability, 100) : current.availability;
      if (!fullName || !validEmail(email) || phone.replace(/\D/g, "").length < 7 || !location || !experience) return errorJson("Name, valid email, phone, location and experience are required.");
      const withdrawing = body.withdrawOptionalConsents === true;
      if (status === "submitted" && (!current.share_consent || withdrawing)) return errorJson("Get the candidate's employer-sharing consent before submission.");
      await env.DB!.batch([
        env.DB!.prepare("UPDATE applications SET status = ?, recruiter_notes = ?, full_name = ?, email = ?, phone = ?, location = ?, experience = ?, desired_role = ?, skills = ?, education = ?, availability = ?, share_consent = ?, future_consent = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(status, notes, fullName, email, phone, location, experience, desiredRole, skills, education, availability, withdrawing ? 0 : current.share_consent, withdrawing ? 0 : current.future_consent, id),
        audit(request, withdrawing ? "consent.withdrawn" : profile ? "profile.corrected" : body.notes === undefined ? "stage.changed" : "notes.updated", "application", id),
      ]);
      return json({ message: "Application updated." });
    }
    if (type === "enquiries" && employerStages.includes(clean(body.status, 30))) {
      const existing = await env.DB!.prepare("SELECT id FROM employer_enquiries WHERE id = ?").bind(id).first();
      if (!existing) return errorJson("Enquiry not found.", 404);
      await env.DB!.batch([
        env.DB!.prepare("UPDATE employer_enquiries SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(body.status, id),
        audit(request, "stage.changed", "employer_enquiry", id),
      ]);
      return json({ message: "Enquiry status updated." });
    }
    return errorJson("Invalid record type or status.");
  } catch { return errorJson("The record could not be updated.", 503); }
}

export async function DELETE(request: Request, context: { params: Promise<{ type: string; id: string }> }) {
  if (!sameOrigin(request)) return errorJson("Cross-site requests are not accepted.", 403);
  if (!await isOwnerRequest(request)) return errorJson("Sign-in required.", 401);
  const { type, id } = await context.params;
  try {
    if (type === "applications") {
      const record = await env.DB!.prepare("SELECT resume_key FROM applications WHERE id = ?").bind(id).first<{resume_key: string | null}>();
      if (!record) return errorJson("Application not found.", 404);
      if (record.resume_key && !env.BUCKET) return errorJson("File storage is unavailable; deletion has not completed.", 503);
      if (record.resume_key) await env.BUCKET!.delete(record.resume_key);
      await env.DB!.batch([
        env.DB!.prepare("DELETE FROM applications WHERE id = ?").bind(id),
        audit(request, "record.deleted", "application", id),
      ]);
      return json({ message: "Application and stored CV deleted." });
    }
    if (type === "enquiries") {
      const existing = await env.DB!.prepare("SELECT id FROM employer_enquiries WHERE id = ?").bind(id).first();
      if (!existing) return errorJson("Enquiry not found.", 404);
      await env.DB!.batch([
        env.DB!.prepare("DELETE FROM employer_enquiries WHERE id = ?").bind(id),
        audit(request, "record.deleted", "employer_enquiry", id),
      ]);
      return json({ message: "Employer enquiry deleted." });
    }
    return errorJson("Invalid record type.");
  } catch { return errorJson("Deletion could not be completed. Review the record before trying again.", 503); }
}
