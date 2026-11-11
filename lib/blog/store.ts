import { env } from "cloudflare:workers";
import { isOwnerRequest, adminActor } from "@/lib/admin";
import { authorizeApi, sameOriginRequest } from "@/lib/platform/auth";
import { PortalError, audit } from "@/lib/portal/db";
import { mediaIds, validatePost, type PostContent } from "./content";
export type BlogRow = { id: string; slug: string; draft_json: string; published_json: string | null; revision: number; published_at: string | null; updated_at: string; published_updated_at: string | null };
export async function blogAdmin(request: Request, mutate = false): Promise<string | Response> {
  if (mutate && !sameOriginRequest(request)) return Response.json({ error: "Same-origin request required." }, { status: 403 });
  if (await isOwnerRequest(request)) return adminActor(request);
  const user = await authorizeApi(request, { admin: true, mutate });
  return user instanceof Response ? user : `platform:${user.id}`;
}
export async function publishedPosts() { return (await env.DB!.prepare("SELECT id, slug, json_object('title',json_extract(published_json,'$.title'),'summary',json_extract(published_json,'$.summary'),'author',json_extract(published_json,'$.author'),'audience',json_extract(published_json,'$.audience'),'noindex',json_extract(published_json,'$.noindex'),'banner',json_extract(published_json,'$.banner')) AS published_json, published_at, published_updated_at FROM blog_posts WHERE published_json IS NOT NULL ORDER BY published_at DESC LIMIT 2000").all<BlogRow>()).results; }
export async function publishedPost(slug: string) { return env.DB!.prepare("SELECT * FROM blog_posts WHERE slug = ? AND published_json IS NOT NULL").bind(slug).first<BlogRow>(); }
export async function savePost(actor: string, input: Record<string, unknown>) {
  const action = input.action;
  if (!["save", "publish", "unpublish"].includes(String(action))) throw new PortalError("ACTION", "Choose save, publish or unpublish.");
  let post: PostContent;
  try { post = validatePost(input.post, action === "publish"); } catch (e) { throw new PortalError("CONTENT", (e as Error).message); }
  const id = typeof input.id === "string" && /^[a-f0-9-]{36}$/.test(input.id) ? input.id : crypto.randomUUID();
  const current = await env.DB!.prepare("SELECT * FROM blog_posts WHERE id = ?").bind(id).first<BlogRow>();
  if (current && (Number(input.revision) !== current.revision)) throw new PortalError("CONFLICT", "Another editor saved this article. Reload it before saving your changes.", 409);
  // Published URLs stay stable, including after unpublish, to protect existing links.
  if (current?.published_at && current.slug !== post.slug) throw new PortalError("SLUG", "The URL cannot change after first publication.");
  const assets = await Promise.all(mediaIds(post).map(asset => env.DB!.prepare("SELECT id, mime, width, height FROM blog_assets WHERE id = ?").bind(asset).first<{ id: string; mime: string; width: number; height: number }>()));
  if (assets.some(a => !a)) throw new PortalError("MEDIA", "An uploaded media file could not be found.");
  const banner = assets.find(a => a && post.banner.src.endsWith(a.id));
  if (banner && (banner.width !== 1920 || banner.height !== 1080 || !banner.mime.startsWith(post.banner.kind + "/"))) throw new PortalError("BANNER", "The banner must be a 1920 × 1080 image or video of the selected type.");
  const poster = assets.find(a => a && post.banner.poster.endsWith(a.id));
  if (poster && (!poster.mime.startsWith("image/") || poster.width !== 1920 || poster.height !== 1080)) throw new PortalError("POSTER", "Use a 1920 × 1080 image for the video poster.");
  const at = new Date().toISOString(), draft = JSON.stringify(post), live = action === "publish" ? draft : action === "unpublish" ? null : current?.published_json || null;
  try {
    if (current) {
      const changed = await env.DB!.prepare("UPDATE blog_posts SET slug = ?, draft_json = ?, published_json = ?, revision = revision + 1, published_at = ?, published_updated_at = ?, updated_at = ?, updated_by = ? WHERE id = ? AND revision = ? RETURNING revision")
        .bind(post.slug, draft, live, current.published_at || (action === "publish" ? at : null), action === "publish" ? at : current.published_updated_at, at, actor, id, current.revision).first();
      if (!changed) throw new PortalError("CONFLICT", "Another editor saved this article. Reload before saving.", 409);
    } else await env.DB!.prepare("INSERT INTO blog_posts (id, slug, draft_json, published_json, revision, published_at, published_updated_at, updated_at, updated_by) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)").bind(id, post.slug, draft, live, action === "publish" ? at : null, action === "publish" ? at : null, at, actor).run();
  } catch (e) { if (/UNIQUE constraint failed: blog_posts.slug/i.test(String(e))) throw new PortalError("SLUG", "Another article already uses that URL.", 409); throw e; }
  await audit(env.DB!, actor, `blog.${String(action)}`, "blog", id);
  return { id, revision: (current?.revision || 0) + 1, published: !!live };
}
