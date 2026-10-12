import { DEMO_MODE } from "@/lib/demo";
import { env } from "cloudflare:workers";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function escapeXml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

export async function GET(request: Request) {
  if (DEMO_MODE) return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });
  const origin = new URL(request.url).origin;
  // Policy drafts stay out of the sitemap until the company finalises them.
  const urls = ["/"].map(path => `<url><loc>${escapeXml(origin + path)}</loc></url>`);
  try {
    const result = await env.DB!.prepare("SELECT id, updated_at FROM jobs WHERE status = 'published' ORDER BY updated_at DESC LIMIT 500").all<{id: string; updated_at: string}>();
    for (const job of result.results) urls.push(`<url><loc>${escapeXml(origin + "/jobs/" + encodeURIComponent(job.id))}</loc><lastmod>${escapeXml(new Date(job.updated_at.replace(" ", "T") + (job.updated_at.includes("Z") ? "" : "Z")).toISOString())}</lastmod></url>`);
  } catch { /* The homepage remains discoverable while the database is unavailable. */ }
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=300" } });
}
