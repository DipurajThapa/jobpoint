import { env } from "cloudflare:workers";
import { blogAdmin, savePost } from "@/lib/blog/store";
import { readLimitedJson } from "@/lib/intake-security";
import { PortalError } from "@/lib/portal/db";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const actor = await blogAdmin(request); if (actor instanceof Response) return actor;
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const post = await env.DB!.prepare("SELECT * FROM blog_posts WHERE id = ?").bind(id).first();
    return Response.json(post ? { post } : { error: "Article not found." }, { status: post ? 200 : 404, headers: { "cache-control": "private, no-store" } });
  }
  // The library loads titles/status only; full documents are fetched one at a time.
  const rows = (await env.DB!.prepare("SELECT id, slug, json_object('title',json_extract(draft_json,'$.title')) AS draft_json, CASE WHEN published_json IS NOT NULL THEN '{}' ELSE NULL END AS published_json, revision, published_at, published_updated_at, updated_at FROM blog_posts ORDER BY updated_at DESC LIMIT 2000").all()).results;
  return Response.json({ posts: rows }, { headers: { "cache-control": "private, no-store" } });
}
export async function POST(request: Request) {
  const actor = await blogAdmin(request, true); if (actor instanceof Response) return actor;
  try { return Response.json(await savePost(actor, await readLimitedJson(request, 300_000)), { headers: { "cache-control": "no-store" } }); }
  catch (e) { if (e instanceof PortalError) return Response.json({ error: e.message }, { status: e.status }); console.error("blog save failed", e); return Response.json({ error: "Could not save the article. Please retry." }, { status: 500 }); }
}
