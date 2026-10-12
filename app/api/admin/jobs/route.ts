import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { jobs } from "@/db/schema";
import { isOwnerRequest } from "@/lib/admin";
import { clean, errorJson, json, sameOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!await isOwnerRequest(request)) return errorJson("Sign-in required.", 401);
  try { return json({ jobs: await getDb().select().from(jobs).orderBy(desc(jobs.createdAt)).limit(200) }); }
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
    return json({ id, message: "Job saved." }, 201);
  } catch { return errorJson("The job could not be saved.", 503); }
}
