import { and, count, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { jobs } from "@/db/schema";

/** Only owner-published vacancies, shared by the job board and public API. */
export async function listPublicJobs(q = "", location = "", requestedPage = 1) {
  const db = getDb();
  const pageSize = 24;
  const filters = [eq(jobs.status, "published")];
  if (location) filters.push(eq(jobs.location, location));
  if (q) {
    const term = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    filters.push(sql`(${jobs.title} LIKE ${term} ESCAPE '\\' OR ${jobs.sector} LIKE ${term} ESCAPE '\\' OR ${jobs.description} LIKE ${term} ESCAPE '\\')`);
  }
  const [totals, locations] = await Promise.all([
    db.select({ total: count() }).from(jobs).where(and(...filters)),
    db.selectDistinct({ location: jobs.location }).from(jobs).where(eq(jobs.status, "published")).orderBy(jobs.location),
  ]);
  const total = totals[0].total;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pageCount, Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1));
  const rows = await db.select({ id: jobs.id, title: jobs.title, company: jobs.company, location: jobs.location, employmentType: jobs.employmentType, workMode: jobs.workMode, sector: jobs.sector, featured: jobs.featured, createdAt: jobs.createdAt })
    .from(jobs).where(and(...filters)).orderBy(desc(jobs.createdAt), desc(jobs.id)).limit(pageSize).offset((page - 1) * pageSize);
  return { jobs: rows, locations: locations.map(item => item.location), total, page, pageCount };
}
