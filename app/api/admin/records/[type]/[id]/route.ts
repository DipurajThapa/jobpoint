import { env } from "cloudflare:workers";
import { sendCallUpdate } from "@/lib/public-forms";
import { adminActor, isOwnerRequest } from "@/lib/admin";
import { clean, errorJson, json, sameOrigin, validEmail } from "@/lib/http";
import { portalDb } from "@/lib/portal/session";
import { syncWebsiteProfile, unlinkWebsiteApplication, withdrawWebsiteConsents } from "@/lib/portal/website";

export const dynamic = "force-dynamic";

const employerStages = ["new", "contacted", "in_progress", "closed"];

function audit(request: Request, action: string, type: string, id: string) {
  return env.DB!.prepare("INSERT INTO audit_events (id, actor_id, action, target_type, target_id) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), adminActor(request), action, type, id);
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
      // One pipeline: stages are set in the Recruiting tool. The stage recorded here before that is kept, read-only.
      if (body.status !== undefined && clean(body.status, 30) !== current.status) return errorJson("Stages are now set in the Recruiting tool, where the candidate is submitted to the client's job.", 409);
      const status = current.status;
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
      if (!fullName || !validEmail(email) || phone.replace(/\D/g, "").length < 7) return errorJson("Name, valid email and phone are required.");
      const withdrawing = body.withdrawOptionalConsents === true;
      await env.DB!.batch([
        env.DB!.prepare("UPDATE applications SET status = ?, recruiter_notes = ?, full_name = ?, email = ?, phone = ?, location = ?, experience = ?, desired_role = ?, skills = ?, education = ?, availability = ?, share_consent = ?, future_consent = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(status, notes, fullName, email, phone, location, experience, desiredRole, skills, education, availability, withdrawing ? 0 : current.share_consent, withdrawing ? 0 : current.future_consent, id),
        audit(request, withdrawing ? "consent.withdrawn" : profile ? "profile.corrected" : "notes.updated", "application", id),
      ]);
      // A correction made here is applied to the same person's record in the shared candidate list.
      if (profile) await syncWebsiteProfile(portalDb(), id, { fullName, email, phone, location }, adminActor(request));
      // The same person in the shared candidate list stops being matched or shared too.
      if (withdrawing) await withdrawWebsiteConsents(portalDb(), id, adminActor(request));
      return json({ message: withdrawing ? "Consents withdrawn here and in the candidate list." : "Application updated." });
    }
    if (type === "enquiries" && ["confirmed", "done", "cancelled"].includes(clean(body.meetingStatus, 20))) {
      // The call the employer asked for: confirmed, held or cancelled (a cancelled slot is free again).
      const next = clean(body.meetingStatus, 20) as "confirmed" | "done" | "cancelled";
      const q = await env.DB!.prepare("SELECT contact_name, email, meeting_at, meeting_status FROM employer_enquiries WHERE id = ? AND meeting_at IS NOT NULL").bind(id).first<{ contact_name: string; email: string; meeting_at: string; meeting_status: string }>();
      if (!q) return errorJson("This enquiry has no call request.", 404);
      // A confirmed call also moves a new enquiry on, so it stops counting as waiting.
      await env.DB!.batch([
        env.DB!.prepare("UPDATE employer_enquiries SET meeting_status = ?, status = CASE WHEN status = 'new' AND ? = 'confirmed' THEN 'contacted' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(next, next, id),
        audit(request, `call.${next}`, "employer_enquiry", id),
      ]);
      // The employer is told by email when the call is confirmed or cancelled.
      const emailed = next === "done" || q.meeting_status === next ? null : await sendCallUpdate(q.email, { name: q.contact_name, meetingAt: q.meeting_at, status: next });
      return json({ message: `Call marked ${next === "done" ? "held" : next}.${emailed === "sent" ? " The employer has been emailed." : emailed ? " The employer was NOT emailed (email is not set up): please tell them yourself." : ""}` });
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
      // If this application was the person's only link to the shared candidate list, their candidate record goes too.
      const linked = await unlinkWebsiteApplication(portalDb(), id, adminActor(request));
      for (const key of linked.r2Keys) await env.BUCKET!.delete(key);
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
