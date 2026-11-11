import { publishedPosts } from "@/lib/blog/store";
import { SITE_URL } from "@/lib/site";
import type { PostContent } from "@/lib/blog/content";
export const dynamic = "force-dynamic";
const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export async function GET() {
  const rows = await publishedPosts();
  const items = rows.filter(r => !(JSON.parse(r.published_json!) as PostContent).noindex).slice(0, 50).map(r => { const p = JSON.parse(r.published_json!) as PostContent, url = `${SITE_URL}/blog/${r.slug}`; return `<item><title>${xml(p.title)}</title><link>${xml(url)}</link><guid>${xml(url)}</guid><description>${xml(p.summary)}</description><pubDate>${new Date(r.published_at!).toUTCString()}</pubDate></item>`; });
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Jobboard300 Blog</title><link>${SITE_URL}/blog</link><description>IT and non-IT career and hiring advice</description><language>en</language>${items.join("")}</channel></rss>`, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "no-cache" } });
}
