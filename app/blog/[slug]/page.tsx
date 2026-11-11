import { notFound } from "next/navigation";
import type { Metadata } from "next";
import PublicHeader from "@/components/public-header";
import PublicFooter from "@/components/public-footer";
import Link from "@/components/app-link";
import { ArticleView } from "@/components/blog-content";
import ArticleEngagement from "@/components/article-engagement";
import { publishedPost } from "@/lib/blog/store";
import type { PostContent } from "@/lib/blog/content";
import { SITE_URL } from "@/lib/site";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const row = await publishedPost((await params).slug); if (!row) return { title: "Article not found", robots: { index: false } };
  const p = JSON.parse(row.published_json!) as PostContent, url = `${SITE_URL}/blog/${row.slug}`, image = p.banner.kind === "image" ? p.banner.src : p.banner.poster;
  return { title: p.seoTitle || p.title, description: p.seoDescription || p.summary, alternates: { canonical: url }, robots: { index: !p.noindex, follow: true }, openGraph: { type: "article", title: p.seoTitle || p.title, description: p.seoDescription || p.summary, url, publishedTime: row.published_at!, modifiedTime: row.published_updated_at!, authors: [p.author], images: image ? [{ url: SITE_URL + image, width: 1920, height: 1080, alt: p.banner.description }] : [] }, twitter: { card: "summary_large_image", title: p.seoTitle || p.title, description: p.seoDescription || p.summary, images: image ? [SITE_URL + image] : [] } };
}
export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const row = await publishedPost((await params).slug); if (!row) notFound();
  const p = JSON.parse(row.published_json!) as PostContent, url = `${SITE_URL}/blog/${row.slug}`, image = p.banner.kind === "image" ? p.banner.src : p.banner.poster;
  const schema: Record<string, unknown>[] = [{ "@context": "https://schema.org", "@type": "BlogPosting", headline: p.title, description: p.summary, datePublished: row.published_at, dateModified: row.published_updated_at, mainEntityOfPage: url, url, author: { "@type": p.author === "Jobboard300 editorial team" ? "Organization" : "Person", name: p.author }, publisher: { "@type": "Organization", name: "Jobboard300", url: SITE_URL }, ...(image ? { image: { "@type": "ImageObject", url: SITE_URL + image, width: 1920, height: 1080, caption: p.banner.description } } : {}), citation: p.sources.map(s => s.url), inLanguage: "en" }, { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Blog", item: `${SITE_URL}/blog` }, { "@type": "ListItem", position: 2, name: p.title, item: url }] }];
  if (p.banner.kind === "video" && p.banner.poster) schema.push({ "@context": "https://schema.org", "@type": "VideoObject", name: p.title, description: p.banner.description, thumbnailUrl: SITE_URL + p.banner.poster, uploadDate: row.published_at, contentUrl: SITE_URL + p.banner.src, embedUrl: url });
  return <><PublicHeader /><main id="main" className="blog-page"><nav className="container blog-breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link> / <Link href="/blog">Blog</Link> / <span>{p.title}</span></nav><ArticleView post={p} date={row.published_updated_at || row.published_at || undefined} /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} /><ArticleEngagement slug={row.slug} /></main><PublicFooter /></>;
}
