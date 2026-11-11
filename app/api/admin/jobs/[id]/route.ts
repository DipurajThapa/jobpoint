import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { jobs } from "@/db/schema";
import { adminActor, isOwnerRequest } from "@/lib/admin";
import { portalDb, portalSecret } from "@/lib/portal/session";
import { drainQueue } from "@/lib/portal/queue";
import { syncRoleStatus } from "@/lib/portal/vacancy";
import { authoriseVacancy, publishProblem } from "@/lib/portal/pilot";
import { errorJson, json, sameOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return errorJson("Cross-site requests are not accepted.", 403);
  if (!await isOwnerRequest(request)) return errorJson("Sign-in required.", 401);
  const { id } = await context.params;
  try {
    const body = await request.json() as Record<string, unknown>;
    const status = body.status === "published" || body.status === "closed" || body.status === "draft" ? body.status : undefined;
    if (!status) return errorJson("Choose draft, published or closed.");
    if (body.authorisedBy || body.authorisedOn) {
      try { await authoriseVacancy(portalDb(), id, String(body.authorisedBy ?? ""), String(body.authorisedOn ?? ""), adminActor(request)); }
      catch (error) { return errorJson(error instanceof Error ? error.message : "The authorisation could not be saved."); }
    }
    // Only a vacancy the employer has authorised, under a client with a signed mandate, goes on the website.
    if (status === "published") { const problem = await publishProblem(portalDb(), id); if (problem) return errorJson(`Not published: ${problem}`, 409); }
    await getDb().update(jobs).set({ status, updatedAt: new Date().toISOString() }).where(eq(jobs.id, id));
    // The same vacancy in the Recruiting tool opens, pauses or closes with it.
    await syncRoleStatus(portalDb(), id, status, adminActor(request));
    if (status === "published") { try { await drainQueue(portalDb(), portalSecret(), 400); } catch (error) { console.error("scoring after publish failed", id, error instanceof Error ? error.message : error); } }
    return json({ message: `Job ${status}.` });
  } catch { return errorJson("The job could not be updated.", 503); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return errorJson("Cross-site requests are not accepted.", 403);
  if (!await isOwnerRequest(request)) return errorJson("Sign-in required.", 401);
  const { id } = await context.params;
  try { await getDb().update(jobs).set({ status: "closed", updatedAt: new Date().toISOString() }).where(eq(jobs.id, id)); await syncRoleStatus(portalDb(), id, "closed", adminActor(request)); return json({ message: "Job closed." }); }
  catch { return errorJson("The job could not be closed.", 503); }
}
