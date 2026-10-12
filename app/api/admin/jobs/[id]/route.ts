import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { jobs } from "@/db/schema";
import { isOwnerRequest } from "@/lib/admin";
import { clean, errorJson, json, sameOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return errorJson("Cross-site requests are not accepted.", 403);
  if (!await isOwnerRequest(request)) return errorJson("Sign-in required.", 401);
  const { id } = await context.params;
  try {
    const body = await request.json() as Record<string, unknown>;
    const status = body.status === "published" || body.status === "closed" || body.status === "draft" ? body.status : undefined;
    if (!status) return errorJson("Choose draft, published or closed.");
    await getDb().update(jobs).set({ status, updatedAt: new Date().toISOString() }).where(eq(jobs.id, id));
    return json({ message: `Job ${status}.` });
  } catch { return errorJson("The job could not be updated.", 503); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return errorJson("Cross-site requests are not accepted.", 403);
  if (!await isOwnerRequest(request)) return errorJson("Sign-in required.", 401);
  const { id } = await context.params;
  try { await getDb().update(jobs).set({ status: "closed", updatedAt: new Date().toISOString() }).where(eq(jobs.id, id)); return json({ message: "Job closed." }); }
  catch { return errorJson("The job could not be closed.", 503); }
}
