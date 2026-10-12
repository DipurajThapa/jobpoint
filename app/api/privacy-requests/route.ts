import { DEMO_MODE, demoSubmissionResponse } from "@/lib/demo";
import { getDb } from "@/db";
import { privacyRequests } from "@/db/schema";
import { clean, errorJson, json, limitSubmission, sameOrigin, validEmail } from "@/lib/http";

export const runtime = "edge";
export const dynamic = "force-dynamic";
const types = ["access", "correction", "deletion", "withdrawal", "grievance"];

export async function POST(request: Request) {
  if (DEMO_MODE) return demoSubmissionResponse();
  try {
    if (!sameOrigin(request)) return errorJson("Cross-site requests are not accepted.", 403);
    if (Number(request.headers.get("content-length") ?? 0) > 8_000) return errorJson("The request is too large.", 413);
    if (!await limitSubmission(request, "privacy")) return errorJson("Too many requests. Please try later.", 429);
    const body = await request.json() as Record<string, unknown>;
    if (clean(body.website, 200)) return json({ message: "Your request has been received." }, 201);
    const requestType = clean(body.requestType, 20), requesterName = clean(body.requesterName, 120);
    const email = clean(body.email, 254).toLowerCase(), details = clean(body.details, 1200);
    if (!types.includes(requestType) || !requesterName || !validEmail(email)) return errorJson("Please provide your name, email and request type.");
    await getDb().insert(privacyRequests).values({ id: crypto.randomUUID(), requestType: requestType as "access", requesterName, email, details });
    return json({ message: "Your request has been received. We will verify your identity before changing or disclosing any information." }, 201);
  } catch { return errorJson("Your request could not be submitted. Please try again later.", 503); }
}
