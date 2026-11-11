/* eslint-disable @next/next/no-img-element -- Uploaded media is streamed from the authorised R2 route. */
import { Fragment, type CSSProperties, type ReactNode } from "react";
import Link from "@/components/app-link";
import { safeUrl, type RichNode, type PostContent } from "@/lib/blog/content";
function Chart({ attrs }: { attrs: Record<string, unknown> }) {
  const rows = attrs.rows as { label: string; value: number }[];
  const min = Math.min(0, ...rows.map(r => r.value)), max = Math.max(1, ...rows.map(r => r.value)), span = max - min || 1;
  const y = (v: number) => 170 - (v - min) / span * 150;
  return <figure className="blog-chart"><figcaption>{String(attrs.title || "Chart")}</figcaption><svg viewBox="0 0 640 220" role="img" aria-label={String(attrs.title || "Chart; data follows in the table")}><line x1="40" y1={y(0)} x2="620" y2={y(0)} stroke="#aab9c4" />{attrs.kind === "line" ? <polyline fill="none" stroke="#2348c7" strokeWidth="3" points={rows.map((r, i) => `${50 + i * 550 / Math.max(1, rows.length - 1)},${y(r.value)}`).join(" ")} /> : rows.map((r, i) => <rect key={i} x={45 + i * 570 / rows.length} y={Math.min(y(0), y(r.value))} width={Math.max(2, 550 / rows.length - 8)} height={Math.max(1, Math.abs(y(r.value) - y(0)))} fill="#267461" />)}{rows.map((r, i) => <text key={i} x={50 + i * 550 / Math.max(1, rows.length - (attrs.kind === "line" ? 1 : 0))} y="200" fontSize="11">{r.label.slice(0, 12)}</text>)}</svg><table><caption>Chart data</caption><thead><tr><th scope="col">Category</th><th scope="col">Value</th></tr></thead><tbody>{rows.map((r, i) => <tr key={i}><th scope="row">{r.label}</th><td>{r.value.toLocaleString("en")}</td></tr>)}</tbody></table>{!!attrs.source && <p>Source: <a href={safeUrl(attrs.source)} rel="noopener noreferrer">{String(attrs.source)}</a></p>}</figure>;
}
function Node({ node, path }: { node: RichNode; path: string }): ReactNode {
  const a = node.attrs || {}, children = node.content?.map((n, i) => <Node key={i} node={n} path={`${path}-${i}`} />);
  const style = a.textAlign ? { textAlign: a.textAlign as CSSProperties["textAlign"] } : undefined;
  switch (node.type) {
    case "doc": return children;
    case "text": { let text: ReactNode = node.text; for (const mark of node.marks || []) { switch (mark.type) {
      case "bold": text = <strong>{text}</strong>; break; case "italic": text = <em>{text}</em>; break; case "underline": text = <u>{text}</u>; break; case "strike": text = <s>{text}</s>; break; case "code": text = <code>{text}</code>; break; case "subscript": text = <sub>{text}</sub>; break; case "superscript": text = <sup>{text}</sup>; break; case "textStyle": text = <span style={mark.attrs as CSSProperties}>{text}</span>; break; case "link": text = <Link href={safeUrl(mark.attrs?.href)} rel="noopener noreferrer">{text}</Link>; break;
    }} return text; }
    case "paragraph": return <p style={style}>{children}</p>;
    case "heading": return a.level === 4 ? <h4 id={path} style={style}>{children}</h4> : a.level === 3 ? <h3 id={path} style={style}>{children}</h3> : <h2 id={path} style={style}>{children}</h2>;
    case "bulletList": return <ul>{children}</ul>; case "orderedList": return <ol start={Number(a.start) || 1}>{children}</ol>; case "listItem": return <li>{children}</li>;
    case "blockquote": return <blockquote>{children}</blockquote>; case "codeBlock": return <pre><code>{children}</code></pre>; case "hardBreak": return <br />; case "horizontalRule": return <hr />;
    case "table": return <div className="blog-table"><table><tbody>{children}</tbody></table></div>; case "tableRow": return <tr>{children}</tr>; case "tableCell": return <td colSpan={Number(a.colspan)} rowSpan={Number(a.rowspan)}>{children}</td>; case "tableHeader": return <th scope="col" colSpan={Number(a.colspan)} rowSpan={Number(a.rowspan)}>{children}</th>;
    case "blogMedia": return <figure>{a.kind === "video" ? <video src={String(a.src)} controls preload="metadata" aria-label={String(a.description)} /> : <img src={String(a.src)} alt={String(a.description)} loading="lazy" /> }<figcaption>{String(a.description)}</figcaption>{!!a.transcript && <details><summary>Video transcript</summary><p>{String(a.transcript)}</p></details>}</figure>;
    case "blogChart": return <Chart attrs={a} />;
    default: return null;
  }
}
export default function BlogContent({ body }: { body: RichNode }) { return <div className="blog-rich"><Node node={body} path="section" /></div>; }
export function ArticleView({ post, date }: { post: PostContent; date?: string }) {
  return <article className="blog-article"><header><p className="eyebrow">{post.audience === "Both" ? "CANDIDATES & EMPLOYERS" : post.audience.toUpperCase()}</p><h1>{post.title}</h1><p className="blog-deck">{post.summary}</p><p className="blog-byline">By {post.author}{date && <> · <time dateTime={date}>{new Date(date).toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</time></>}</p></header>{post.banner.src && <figure className="blog-banner">{post.banner.kind === "video" ? <video width={1920} height={1080} src={post.banner.src} poster={post.banner.poster || undefined} controls preload="metadata" aria-label={post.banner.description} /> : <img width={1920} height={1080} src={post.banner.src} alt={post.banner.description} fetchPriority="high" />}<figcaption>{post.banner.description}</figcaption></figure>}{post.answer && <aside className="blog-answer"><h2>Key takeaway</h2><p>{post.answer}</p></aside>}<BlogContent body={post.body} />{post.faqs.length > 0 && <section className="blog-faq"><h2>Questions answered</h2>{post.faqs.map((f, i) => <Fragment key={i}><h3>{f.question}</h3><p>{f.answer}</p></Fragment>)}</section>}{post.sources.length > 0 && <section><h2>Sources and further reading</h2><ul>{post.sources.map((s, i) => <li key={i}><a href={s.url} rel="noopener noreferrer">{s.label}</a></li>)}</ul></section>}{post.authorBio && <aside className="blog-author"><h2>About the author</h2><p><strong>{post.author}</strong> — {post.authorBio}</p></aside>}</article>;
}
