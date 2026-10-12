import { getDb } from "@/db";
import { employerEnquiries } from "@/db/schema";
import { clean, errorJson, json, limitSubmission, sameOrigin, validEmail } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return errorJson("Cross-site submissions are not accepted.", 403);
    if (Number(request.headers.get("content-length") ?? 0) > 24_000) return errorJson("The request is too large.", 413);
    const body = await request.json() as Record<string, unknown>;
    if (clean(body.website, 200)) return json({ message: "Thank you. Your hiring enquiry has been received." }, 201);
    if (!await limitSubmission(request, "employer")) return errorJson("Too many requests. Please try again later.", 429);
    const contactName = clean(body.contactName, 120), company = clean(body.company, 160), email = clean(body.email, 254).toLowerCase();
    const phone = clean(body.phone, 30), roleTitle = clean(body.roleTitle, 160), location = clean(body.location, 120);
    const details = clean(body.details, 1800), headcount = Math.max(1, Math.min(500, Number(body.headcount) || 1));
    if (!contactName || !company || !validEmail(email) || !phone || !roleTitle || !location || !details || body.consent !== "yes") return errorJson("Please complete the required fields and consent checkbox.");
    await getDb().insert(employerEnquiries).values({ id: crypto.randomUUID(), contactName, company, email, phone, roleTitle, location, headcount, details, consent: true, privacyVersion: "2026-10-13", consentAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    return json({ message: "Thank you. Your hiring enquiry has been received. Our team will follow up." }, 201);
  } catch { return errorJson("We couldn't submit your enquiry. Please try again in a moment.", 503); }
}
