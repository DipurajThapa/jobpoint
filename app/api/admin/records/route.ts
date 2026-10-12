import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { applications, employerEnquiries, jobs } from "@/db/schema";
import { isOwnerRequest } from "@/lib/admin";
import { errorJson, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!await isOwnerRequest(request)) return errorJson("Sign-in required.", 401);
  try {
    const db = getDb();
    const [candidateApplications, enquiries, roleList] = await Promise.all([
      db.select({ id: applications.id, jobId: applications.jobId, fullName: applications.fullName, email: applications.email, phone: applications.phone, location: applications.location, experience: applications.experience, message: applications.message, resumeName: applications.resumeName, hasResume: applications.resumeKey, status: applications.status, createdAt: applications.createdAt, roleTitle: jobs.title }).from(applications).leftJoin(jobs, eq(applications.jobId, jobs.id)).orderBy(desc(applications.createdAt)).limit(200),
      db.select().from(employerEnquiries).orderBy(desc(employerEnquiries.createdAt)).limit(200),
      db.select({ id: jobs.id, title: jobs.title }).from(jobs),
    ]);
    return json({ applications: candidateApplications.map(a => ({ ...a, hasResume: !!a.hasResume })), enquiries, jobs: roleList });
  } catch { return errorJson("Enquiry records are temporarily unavailable.", 503); }
}
