import { db, apiError, withinLimit, clientKey } from "@/lib/platform/auth";
import { readLimitedJson } from "@/lib/intake-security";

export const dynamic = "force-dynamic";
const EVENTS = new Set(["view", "candidate_click", "employer_click"]);

/** Privacy-minimal first-party event counts. No cookie, person record or IP address is stored here. */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") return apiError("Same-origin request required.", 403);
  try {
    const input = await readLimitedJson(request, 2000) as { slug?:unknown; event?:unknown };
    const slug = input.slug, event = input.event;
    if (typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || typeof event !== "string" || !EVENTS.has(event)) return apiError("Invalid article event.", 400);
    const live = await db().prepare("SELECT slug FROM blog_posts WHERE slug=? AND published_json IS NOT NULL").bind(slug).first();
    if (!live) return apiError("Article not found.", 404);
    // Repeated reloads and clicks from the same connection are suppressed. These remain event counts, not unique users.
    const key = `blog:${event}:${slug}:${await clientKey(request)}`;
    if (!await withinLimit(key, event === "view" ? 1800 : 600, 1)) return new Response(null,{status:204});
    const day = new Date().toISOString().slice(0,10);
    await db().prepare("INSERT INTO blog_engagement_daily (day,slug,event,count) VALUES (?,?,?,1) ON CONFLICT(day,slug,event) DO UPDATE SET count=count+1").bind(day,slug,event).run();
    return new Response(null,{status:204});
  } catch {
    return apiError("Could not record event.", 400);
  }
}
