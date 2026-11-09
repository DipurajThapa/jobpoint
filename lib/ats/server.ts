// Server-side helpers for the owner-only screening routes (D1 + R2 access).
import { env } from "cloudflare:workers";
import type { JobRequirements } from "./types";
import { parseJobDescription } from "./jd-parser";

export type JobRow = { id: string; title: string; company: string; location: string; employment_type: string; work_mode: string; sector: string; description: string; requirements: string; status: string };

export const db = () => {
  if (!env.DB) throw new Error("Database unavailable.");
  return env.DB;
};

export const aiAvailable = () => typeof env.ANTHROPIC_API_KEY === "string" && env.ANTHROPIC_API_KEY.length > 20;
export const apiKey = () => aiAvailable() ? env.ANTHROPIC_API_KEY : undefined;

export async function loadJob(id: string) {
  return db().prepare("SELECT id, title, company, location, employment_type, work_mode, sector, description, requirements, status FROM jobs WHERE id = ?").bind(id).first<JobRow>();
}

/** Recruiter-edited requirements when saved, otherwise requirements generated from the JD. */
export async function loadRequirements(job: JobRow): Promise<{ requirements: JobRequirements; updatedAt: string | null }> {
  const saved = await db().prepare("SELECT requirements, updated_at FROM ats_job_profiles WHERE job_id = ?").bind(job.id).first<{ requirements: string; updated_at: string }>();
  if (saved) {
    try { return { requirements: JSON.parse(saved.requirements) as JobRequirements, updatedAt: saved.updated_at }; }
    catch { /* fall through to a fresh parse */ }
  }
  return { requirements: requirementsFromJob(job), updatedAt: null };
}

export function requirementsFromJob(job: Pick<JobRow, "title" | "description" | "requirements" | "location" | "work_mode">): JobRequirements {
  return parseJobDescription({ title: job.title, description: job.description, requirements: job.requirements, location: job.location, workMode: job.work_mode });
}

export function audit(request: Request, action: string, targetType: string, targetId: string, detail = "") {
  return db().prepare("INSERT INTO audit_events (id, actor_id, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), request.headers.get("oai-authenticated-user-id") ?? "owner", action, targetType, targetId, detail.slice(0, 200));
}

export const actor = (request: Request) => request.headers.get("oai-authenticated-user-id") ?? "owner";
