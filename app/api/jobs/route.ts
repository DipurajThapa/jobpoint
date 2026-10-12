import { and, desc, eq, like, or } from "drizzle-orm";
import { getDb } from "@/db";
import { jobs } from "@/db/schema";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const db = getDb();
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
    const location = (url.searchParams.get("location") ?? "").trim().slice(0, 100);
    const filters = [eq(jobs.status, "published")];
    if (location) filters.push(eq(jobs.location, location));
    if (q) { const term = `%${q.replace(/[\\%_]/g, "\\$&")}%`; filters.push(or(like(jobs.title, term), like(jobs.sector, term), like(jobs.description, term))!); }
    const rows = await db.select({ id: jobs.id, title: jobs.title, company: jobs.company, location: jobs.location, employmentType: jobs.employmentType, workMode: jobs.workMode, sector: jobs.sector, salaryRange: jobs.salaryRange, description: jobs.description, requirements: jobs.requirements, createdAt: jobs.createdAt }).from(jobs).where(and(...filters)).orderBy(desc(jobs.featured), desc(jobs.createdAt)).limit(60);
    const locations = await db.selectDistinct({ location: jobs.location }).from(jobs).where(eq(jobs.status, "published")).orderBy(jobs.location);
    return json({ jobs: rows, locations: locations.map(item => item.location) });
  } catch { return json({ error: "Job listings are temporarily unavailable." }, 503); }
}
