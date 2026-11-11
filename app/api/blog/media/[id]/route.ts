import { env } from "cloudflare:workers";
import { blogAdmin } from "@/lib/blog/store";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const publicUse = await env.DB!.prepare("SELECT id FROM blog_posts WHERE published_json IS NOT NULL AND instr(published_json, ?) > 0 LIMIT 1").bind(`/api/blog/media/${id}`).first();
  if (!publicUse && await blogAdmin(request) instanceof Response) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  const asset = await env.DB!.prepare("SELECT r2_key, mime, size FROM blog_assets WHERE id = ?").bind(id).first<{ r2_key: string; mime: string; size: number }>();
  if (!asset) return new Response("Not found", { status: 404 });
  let offset = 0, length = asset.size, partial = false;
  const range = request.headers.get("range");
  if (range) { const match = /^bytes=(\d*)-(\d*)$/.exec(range); if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { "content-range": `bytes */${asset.size}` } });
    offset = match[1] ? Number(match[1]) : Math.max(0, asset.size - Number(match[2])); const end = match[1] && match[2] ? Math.min(Number(match[2]), asset.size - 1) : asset.size - 1; length = end - offset + 1; partial = true;
    if (offset >= asset.size || length <= 0) return new Response(null, { status: 416, headers: { "content-range": `bytes */${asset.size}` } });
  }
  const file = await env.BUCKET!.get(asset.r2_key, partial ? { range: { offset, length } } : undefined);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.body, { status: partial ? 206 : 200, headers: { "content-type": asset.mime, "content-length": String(length), "accept-ranges": "bytes", "x-content-type-options": "nosniff", "cache-control": "private, no-store", "content-security-policy": "default-src 'none'; sandbox", ...(partial ? { "content-range": `bytes ${offset}-${offset + length - 1}/${asset.size}` } : {}) } });
}
