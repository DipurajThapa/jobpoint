import { DEMO_MODE } from "@/lib/demo";
import { SITE_URL } from "@/lib/site";
import { env } from "cloudflare:workers";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function escapeXml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

export async function GET() {
  if (DEMO_MODE) return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });
  // Same address as the canonical links, whichever host the request arrived on.
  const origin = SITE_URL;
  // Policy drafts stay out of the sitemap until the company finalises them.
  const urls = ["/", "/blog", "/jobs", "/job-seekers", "/employers", "/terms/job-seekers", "/terms/employers"].map(path => `<url><loc>${escapeXml(origin + path)}</loc></url>`);
  try {
    const result = await env.DB!.prepare("SELECT id, updated_at FROM jobs WHERE status = 'published' ORDER BY updated_at DESC LIMIT 500").all<{id: string; updated_at: string}>();
    for (const job of result.results) urls.push(`<url><loc>${escapeXml(origin + "/jobs/" + encodeURIComponent(job.id))}</loc><lastmod>${escapeXml(new Date(job.updated_at.replace(" ", "T") + (job.updated_at.includes("Z") ? "" : "Z")).toISOString())}</lastmod></url>`);
    const posts = await env.DB!.prepare("SELECT slug, json_object('title',json_extract(published_json,'$.title'),'banner',json_extract(published_json,'$.banner')) AS published_json, published_at, published_updated_at FROM blog_posts WHERE published_json IS NOT NULL AND json_extract(published_json, '$.noindex') = 0 ORDER BY published_at DESC LIMIT 2000").all<{slug: string; published_json: string; published_at: string; published_updated_at: string}>();
    for (const post of posts.results) {
      const content = JSON.parse(post.published_json) as { title: string; banner: { src: string; kind: string; poster: string; description: string } }, b = content.banner;
      const image = b.kind === "image" ? b.src : b.poster;
      const imageXml = image ? `<image:image><image:loc>${escapeXml(origin + image)}</image:loc></image:image>` : "";
      const videoXml = b.kind === "video" && b.poster ? `<video:video><video:thumbnail_loc>${escapeXml(origin + b.poster)}</video:thumbnail_loc><video:title>${escapeXml(content.title)}</video:title><video:description>${escapeXml(b.description)}</video:description><video:content_loc>${escapeXml(origin + b.src)}</video:content_loc><video:publication_date>${escapeXml(post.published_at)}</video:publication_date></video:video>` : "";
      urls.push(`<url><loc>${escapeXml(origin + "/blog/" + post.slug)}</loc><lastmod>${escapeXml(post.published_updated_at)}</lastmod>${imageXml}${videoXml}</url>`);
    }
  } catch { /* The homepage remains discoverable while the database is unavailable. */ }
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">${urls.join("")}</urlset>`, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=300" } });
}
