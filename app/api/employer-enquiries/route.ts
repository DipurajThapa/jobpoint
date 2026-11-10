import { EMPLOYER_TERMS_VERSION } from "@/lib/terms";
import { DEMO_MODE, demoSubmissionResponse } from "@/lib/demo";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { employerEnquiries } from "@/db/schema";
import { clean, errorJson, json, limitSubmission, sameOrigin, validEmail } from "@/lib/http";
import { callSlots, confirmation, sendEnquiryAck } from "@/lib/public-forms";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Times still free for a call with a consultant (30-minute slots, as UTC instants). */
async function freeSlots() {
  const taken = new Set(((await env.DB!.prepare("SELECT meeting_at FROM employer_enquiries WHERE meeting_at IS NOT NULL AND meeting_status IN ('requested','confirmed')").all<{ meeting_at: string }>()).results ?? []).map(r => r.meeting_at));
  return callSlots().filter(slot => !taken.has(slot));
}

export async function GET() {
  try { return json({ slots: DEMO_MODE ? [] : await freeSlots(), timeZone: "Asia/Kolkata", minutes: 30 }); }
  catch { return json({ slots: [], timeZone: "Asia/Kolkata", minutes: 30 }); }
}

// An enquiry, not a job description: who is asking, how to reach them and what they are looking for,
// in their own words. The role is worked out on a call, which they can ask for here.
export async function POST(request: Request) {
  if (DEMO_MODE) return demoSubmissionResponse();
  try {
    if (!sameOrigin(request)) return errorJson("Cross-site submissions are not accepted.", 403);
    if (Number(request.headers.get("content-length") ?? 0) > 24_000) return errorJson("The request is too large.", 413);
    const body = await request.json() as Record<string, unknown>;
    if (clean(body.website, 200)) return json({ title: "Thank you. Your enquiry is with us.", message: "Thank you. Your hiring enquiry has been received." }, 201);
    if (!await limitSubmission(request, "employer")) return errorJson("Too many requests. Please try again later.", 429);
    const contactName = clean(body.contactName, 120), company = clean(body.company, 160), email = clean(body.email, 254).toLowerCase();
    const phone = clean(body.phone, 30), details = clean(body.details ?? body.message, 1800);
    // Kept for older callers; the form no longer asks for them.
    const roleTitle = clean(body.roleTitle, 160), location = clean(body.location, 120), headcount = Math.trunc(Math.max(1, Math.min(500, Number(body.headcount) || 1)));
    const whatsappConsent = body.whatsappConsent === "yes" || body.whatsappConsent === true;
    if (!contactName || !company || !validEmail(email) || phone.replace(/\D/g, "").length < 7 || !details || body.consent !== "yes") return errorJson("Please give your name, company, work email and phone number, tell us what you are looking for, and tick the box to agree.");
    const meetingAt = clean(body.meetingAt, 40) || null;
    if (meetingAt && !(await freeSlots()).includes(meetingAt)) return errorJson("That time is no longer free. Please choose another time for the call.", 409);
    const id = crypto.randomUUID(), at = new Date().toISOString();
    try { await getDb().insert(employerEnquiries).values({ id, contactName, company, email, phone, roleTitle, location, headcount, details, consent: true, whatsappConsent, meetingAt, meetingStatus: meetingAt ? "requested" : "none", privacyVersion: "2026-11-09", termsVersion: EMPLOYER_TERMS_VERSION, consentAt: at, updatedAt: at }); }
    catch (error) { if (meetingAt && /UNIQUE/i.test(String((error as Error)?.message ?? error))) return errorJson("That time was taken a moment ago. Please choose another time for the call.", 409); throw error; }
    const reference = `HE-${id.slice(0, 13).replaceAll("-", "").toUpperCase()}`;
    // Acknowledge to the work email; WhatsApp only with the box ticked (queued until a provider is connected).
    const emailed = await sendEnquiryAck(email, { name: contactName, company, reference, meetingAt, whatsapp: whatsappConsent });
    const sender = whatsappConsent ? await env.DB!.prepare("SELECT 1 AS x FROM messaging_settings WHERE scope = 'admin' AND whatsapp_enabled = 1 AND whatsapp_number != ''").first() : null;
    try { await getDb().update(employerEnquiries).set({ ackEmail: emailed, ackWhatsapp: !whatsappConsent ? "no_consent" : sender ? "queued" : "not_configured" }).where(eq(employerEnquiries.id, id)); }
    catch (error) { console.error("enquiry acknowledgement record failed", id, error instanceof Error ? error.message : error); }
    return json({ reference, emailed: emailed === "sent", meetingAt, ...confirmation("enquiry", { email, reference, emailed, meetingAt }) }, 201);
  } catch { return errorJson("We couldn't submit your enquiry. Please try again in a moment.", 503); }
}
