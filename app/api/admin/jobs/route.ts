import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { jobs } from "@/db/schema";
import { env } from "cloudflare:workers";
import { adminActor, isOwnerRequest } from "@/lib/admin";
import { portalDb, portalSecret } from "@/lib/portal/session";
import { drainQueue } from "@/lib/portal/queue";
import { backfillVacancies, HOUSE_CLIENT_ID, vacancyForRole } from "@/lib/portal/vacancy";
import { clean, errorJson, json, sameOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!await isOwnerRequest(request)) return errorJson("Sign-in required.", 401);
  try {
    // Roles posted before each role had a vacancy record get one now (a few at a time).
    await backfillVacancies(portalDb(), adminActor(request)).catch(error => console.error("vacancy backfill failed", error instanceof Error ? error.message : error));
    const rows = await getDb().select().from(jobs).orderBy(desc(jobs.createdAt)).limit(200);
    // Which client each role's vacancy record is under, and how far its applicants have got.
    const links = (await env.DB!.prepare(`SELECT d.id, d.company_id AS clientId, c.display_name AS clientName,
        (SELECT COUNT(*) FROM portal_applications a WHERE a.jd_id = d.id AND a.status != 'withdrawn') AS applicants,
        (SELECT COUNT(*) FROM pipeline p WHERE p.jd_id = d.id) AS inPipeline
      FROM jds d JOIN companies c ON c.id = d.company_id WHERE d.id IN (SELECT id FROM jobs)`).all<{ id: string; clientId: string; clientName: string; applicants: number; inPipeline: number }>()).results ?? [];
    const byId = new Map(links.map(l => [l.id, l]));
    const clients = (await env.DB!.prepare("SELECT id, display_name AS name FROM companies WHERE status = 'active' AND id != ? ORDER BY display_name LIMIT 500").bind(HOUSE_CLIENT_ID).all<{ id: string; name: string }>()).results ?? [];
    return json({ jobs: rows.map(j => ({ ...j, clientId: byId.get(j.id)?.clientId ?? null, clientName: byId.get(j.id)?.clientName ?? null, applicants: byId.get(j.id)?.applicants ?? 0, inPipeline: byId.get(j.id)?.inPipeline ?? 0 })), clients });
  }
  catch { return errorJson("Job records are temporarily unavailable.", 503); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return errorJson("Cross-site requests are not accepted.", 403);
  if (!await isOwnerRequest(request)) return errorJson("Sign-in required.", 401);
  try {
    const body = await request.json() as Record<string, unknown>;
    const title = clean(body.title, 160), location = clean(body.location, 120), employmentType = clean(body.employmentType, 60);
    const description = clean(body.description, 4000), requirements = clean(body.requirements, 2400);
    if (!title || !location || !employmentType || !description) return errorJson("Title, location, employment type and description are required.");
    const id = crypto.randomUUID();
    await getDb().insert(jobs).values({ id, title, company: clean(body.company, 160) || "Confidential client", location, employmentType, workMode: clean(body.workMode, 40) || "On-site", sector: clean(body.sector, 100) || "Other", salaryRange: clean(body.salaryRange, 100) || null, description, requirements, status: body.status === "published" ? "published" : "draft", featured: body.featured === true });
    // One vacancy record: the role is a client job with the same id, under the chosen client or the house client.
    const status = body.status === "published" ? "published" : "draft";
    try { await vacancyForRole(portalDb(), { id, title, location, workMode: clean(body.workMode, 40) || "On-site", description, requirements, status }, adminActor(request), clean(body.companyId, 60) || null); }
    catch (error) { await getDb().delete(jobs).where(eq(jobs.id, id)); return errorJson(error instanceof Error && "code" in error ? error.message : "The job could not be saved.", 400); }
    // Rank the candidates for the new role now, so the recruiter does not open an empty shortlist.
    try { await drainQueue(portalDb(), portalSecret(), 400); } catch (error) { console.error("scoring after role save failed", id, error instanceof Error ? error.message : error); }
    return json({ id, message: "Job saved." }, 201);
  } catch { return errorJson("The job could not be saved.", 503); }
}
