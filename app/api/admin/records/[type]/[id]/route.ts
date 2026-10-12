import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { applications, employerEnquiries } from "@/db/schema";
import { env } from "cloudflare:workers";
import { isOwnerRequest } from "@/lib/admin";
import { errorJson, json, sameOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ type: string; id: string }> }) {
  if (!sameOrigin(request)) return errorJson("Cross-site requests are not accepted.", 403);
  if (!await isOwnerRequest(request)) return errorJson("Sign-in required.", 401);
  const { type, id } = await context.params;
  const body = await request.json() as { status?: string };
  const db = getDb();
  if (type === "applications" && ["new", "reviewing", "contacted", "closed"].includes(body.status ?? "")) {
    await db.update(applications).set({ status: body.status as "new" | "reviewing" | "contacted" | "closed" }).where(eq(applications.id, id));
    return json({ message: "Application status updated." });
  }
  if (type === "enquiries" && ["new", "contacted", "in_progress", "closed"].includes(body.status ?? "")) {
    await db.update(employerEnquiries).set({ status: body.status as "new" | "contacted" | "in_progress" | "closed" }).where(eq(employerEnquiries.id, id));
    return json({ message: "Enquiry status updated." });
  }
  return errorJson("Invalid record type or status.");
}

export async function DELETE(request: Request, context: { params: Promise<{ type: string; id: string }> }) {
  if (!sameOrigin(request)) return errorJson("Cross-site requests are not accepted.", 403);
  if (!await isOwnerRequest(request)) return errorJson("Sign-in required.", 401);
  const { type, id } = await context.params;
  const db = getDb();
  if (type === "applications") {
    const [application] = await db.select({ resumeKey: applications.resumeKey }).from(applications).where(eq(applications.id, id)).limit(1);
    if (!application) return errorJson("Application not found.", 404);
    if (application.resumeKey && env.BUCKET) await env.BUCKET.delete(application.resumeKey);
    await db.delete(applications).where(eq(applications.id, id));
    return json({ message: "Candidate application and stored CV deleted." });
  }
  if (type === "enquiries") {
    await db.delete(employerEnquiries).where(eq(employerEnquiries.id, id));
    return json({ message: "Employer enquiry deleted." });
  }
  return errorJson("Invalid record type.");
}
