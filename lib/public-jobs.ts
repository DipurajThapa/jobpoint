import { and, desc, eq, like, or } from "drizzle-orm";
import { getDb } from "@/db";
import { jobs } from "@/db/schema";

/** Shared query contract for first-page vacancies and public search. */
export async function listPublicJobs(q = "", location = "") {
  const db = getDb();
  const filters = [eq(jobs.status, "published")];
  if (location) filters.push(eq(jobs.location, location));
  if (q) {
    const term = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    filters.push(or(like(jobs.title, term), like(jobs.sector, term), like(jobs.description, term))!);
  }
  const [rows, locations] = await Promise.all([
    db.select({ id: jobs.id, title: jobs.title, company: jobs.company, location: jobs.location, employmentType: jobs.employmentType, workMode: jobs.workMode, sector: jobs.sector })
      .from(jobs).where(and(...filters)).orderBy(desc(jobs.featured), desc(jobs.createdAt)).limit(60),
    db.selectDistinct({ location: jobs.location }).from(jobs).where(eq(jobs.status, "published")).orderBy(jobs.location),
  ]);
  return { jobs: rows, locations: locations.map(item => item.location) };
}
