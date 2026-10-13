import { DEMO_MODE } from "@/lib/demo";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // In demo mode public pages remain crawlable so crawlers can read their noindex tags.
  if (DEMO_MODE) return new Response("User-agent: *\nDisallow: /admin\nDisallow: /api/\n", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  const origin = new URL(request.url).origin;
  return new Response(`User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
