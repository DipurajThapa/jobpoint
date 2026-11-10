import { env } from "cloudflare:workers";
import { desc, eq, like, or, sql, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { applications, employerEnquiries, jobs } from "@/db/schema";
import { isOwnerRequest } from "@/lib/admin";
import { errorJson, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!await isOwnerRequest(request)) return errorJson("Sign-in required.", 401);
  try {
    const db = getDb();
    const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) ?? "";
    const pattern = `%${query.replace(/[%_]/g, "")}%`;
    const search = query ? or(like(applications.fullName, pattern), like(applications.email, pattern), like(applications.location, pattern), like(applications.skills, pattern), like(applications.desiredRole, pattern)) : undefined;
    const [candidateApplications, enquiries, roleList, duplicates] = await Promise.all([
      db.select({ id: applications.id, jobId: applications.jobId, fullName: applications.fullName, email: applications.email, phone: applications.phone, location: applications.location, experience: applications.experience, desiredRole: applications.desiredRole, skills: applications.skills, education: applications.education, availability: applications.availability, message: applications.message, resumeName: applications.resumeName, hasResume: applications.resumeKey, shareConsent: applications.shareConsent, futureConsent: applications.futureConsent, whatsappConsent: applications.whatsappConsent, consentAt: applications.consentAt, status: applications.status, recruiterNotes: applications.recruiterNotes, createdAt: applications.createdAt, updatedAt: applications.updatedAt, roleTitle: jobs.title }).from(applications).leftJoin(jobs, eq(applications.jobId, jobs.id)).where(search).orderBy(desc(applications.createdAt)).limit(200),
      db.select().from(employerEnquiries).orderBy(desc(employerEnquiries.createdAt)).limit(200),
      db.select({ id: jobs.id, title: jobs.title }).from(jobs),
      db.select({ email: applications.email, count: sql<number>`count(*)` }).from(applications).groupBy(applications.email).having(gt(sql<number>`count(*)`, 1)).limit(200),
    ]);
    // Clients an enquiry can be linked to (the portal's tables are read directly).
    const clients = (await env.DB!.prepare("SELECT id, display_name AS name FROM companies WHERE status != 'closed' AND id != 'house-jobboard300' ORDER BY display_name LIMIT 500").all<{ id: string; name: string }>()).results ?? [];
    // One pipeline: where each applicant stands in the Recruiting tool (for the role applied to, and overall).
    const stages = (await env.DB!.prepare(`SELECT s.ref_id AS id,
        (SELECT p.stage FROM pipeline p JOIN applications a ON a.id = s.ref_id WHERE p.candidate_id = s.candidate_id AND p.jd_id = a.job_id LIMIT 1) AS stage,
        (SELECT COUNT(*) FROM pipeline p WHERE p.candidate_id = s.candidate_id) AS submissions
      FROM candidate_sources s WHERE s.kind = 'website_application'`).all<{ id: string; stage: string | null; submissions: number }>()).results ?? [];
    const stageOf = new Map(stages.map(r => [r.id, r]));
    const duplicateEmails = new Set(duplicates.map(d => d.email));
    const reviewCutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
    const reviewDue = (value: string) => Date.parse(value.replace(" ", "T") + (value.includes("Z") || value.includes("+") ? "" : "Z")) < reviewCutoff;
    return json({ applications: candidateApplications.map(a => ({ ...a, hasResume: !!a.hasResume, possibleDuplicate: duplicateEmails.has(a.email), inCandidateList: stageOf.has(a.id), stage: stageOf.get(a.id)?.stage ?? null, submissions: stageOf.get(a.id)?.submissions ?? 0, reviewDue: reviewDue(a.updatedAt) })), enquiries: enquiries.map(q => ({ ...q, reviewDue: reviewDue(q.updatedAt) })), jobs: roleList, clients });
  } catch { return errorJson("Enquiry records are temporarily unavailable.", 503); }
}
