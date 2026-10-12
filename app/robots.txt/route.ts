import { DEMO_MODE } from "@/lib/demo";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (DEMO_MODE) return new Response("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });
  const origin = new URL(request.url).origin;
  return new Response(`User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
