/* eslint-disable @next/next/no-img-element -- Published uploads use the R2 media route. */
import PublicHeader from "@/components/public-header";
import PublicFooter from "@/components/public-footer";
import Link from "@/components/app-link";
import { publishedPosts } from "@/lib/blog/store";
import type { PostContent } from "@/lib/blog/content";
import { SITE_URL } from "@/lib/site";
export const dynamic = "force-dynamic";
export const metadata = { title: "IT & non-IT jobs and hiring advice | Jobboard300 Blog", description: "Practical articles for candidates and employers: CVs, interviews and hiring for IT and non-IT roles.", alternates: { canonical: `${SITE_URL}/blog`, types: { "application/rss+xml": `${SITE_URL}/blog/feed.xml` } } };
export default async function BlogPage() {
  const posts = (await publishedPosts()).map(r => ({ ...r, post: JSON.parse(r.published_json!) as PostContent })).filter(r => !r.post.noindex);
  return <><PublicHeader /><main id="main"><section className="blog-hero"><div className="container"><span className="eyebrow">THE JOBBOARD300 BLOG</span><h1>Practical advice for your next career or hiring decision.</h1><p>CVs, interviews and recruitment, with equal attention to IT and non-IT roles.</p><Link className="text-link" href="/jobs">Explore current job openings →</Link></div></section><section className="section"><div className="container"><h2>Latest articles</h2>{posts.length ? <div className="blog-cards">{posts.map(({ slug, post, published_at }) => <article key={slug}><Link href={`/blog/${slug}`}>{(post.banner.kind === "image" ? post.banner.src : post.banner.poster) && <img width={1920} height={1080} src={post.banner.kind === "image" ? post.banner.src : post.banner.poster} alt={post.banner.description} loading="lazy" />}<div><span className="eyebrow">{post.audience}</span><h3>{post.title}</h3><p>{post.summary}</p><small>{post.author} · {new Date(published_at!).toLocaleDateString("en", { dateStyle: "medium", timeZone: "UTC" })}</small></div></Link></article>)}</div> : <div className="blog-empty"><h3>Articles are on the way</h3><p>We’re preparing practical guides for candidates and employers. You can explore current openings or share your hiring needs in the meantime.</p><div className="calendar-actions"><Link href="/jobs">Find jobs</Link><Link href="/employers">For employers</Link></div></div>}</div></section></main><PublicFooter /></>;
}
