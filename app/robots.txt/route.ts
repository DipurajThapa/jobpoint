import { SITE_URL } from "@/lib/site";
import { DEMO_MODE } from "@/lib/demo";
export const dynamic = "force-dynamic";

export async function GET() {
  // In demo mode public pages remain crawlable so crawlers can read their noindex tags.
  if (DEMO_MODE) return new Response("User-agent: *\nDisallow: /admin\nDisallow: /platform\nDisallow: /api/\n", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  const origin = SITE_URL;
  // AI crawlers are allowed on purpose (the site also publishes /llms.txt). A named crawler
  // ignores the "*" group, so the private paths are repeated for them.
  const aiCrawlers = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User", "Google-Extended"];
  const privatePaths = "Disallow: /admin\nDisallow: /platform\nDisallow: /api/\nAllow: /api/blog/media/\n";
  return new Response(`User-agent: *\n${privatePaths}\n${aiCrawlers.map(name => `User-agent: ${name}`).join("\n")}\nAllow: /\n${privatePaths}\nSitemap: ${origin}/sitemap.xml\n`, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
