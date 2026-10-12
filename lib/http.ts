import { env } from "cloudflare:workers";
import { getDb } from "@/db";

export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
export const errorJson = (message: string, status = 400) => json({ error: message }, status);
export const clean = (value: FormDataEntryValue | unknown, max = 1200) => typeof value === "string" ? value.trim().slice(0, max) : "";
export const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 254;
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return false;
  return request.headers.get("sec-fetch-site") !== "cross-site";
}

export async function limitSubmission(request: Request, category: string) {
  const db = getDb();
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  const hash = [...new Uint8Array(digest)].slice(0, 12).map(n => n.toString(16).padStart(2, "0")).join("");
  const key = `${category}:${hash}`;
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB!.prepare(`INSERT INTO rate_limits (key, window_start, hits) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET window_start = CASE WHEN ? - rate_limits.window_start >= 3600 THEN ? ELSE rate_limits.window_start END, hits = CASE WHEN ? - rate_limits.window_start >= 3600 THEN 1 ELSE rate_limits.hits + 1 END RETURNING hits`).bind(key, now, now, now, now).first<{ hits: number }>();
  return (row?.hits ?? 99) <= 8;
}

export async function isJobOpen(id: string) {
  const db = getDb();
  return await env.DB!.prepare("SELECT id FROM jobs WHERE id = ? AND status = 'published' LIMIT 1").bind(id).first() !== null;
}
