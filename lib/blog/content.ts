// Structured content is allowlisted and rendered as React elements, never raw HTML.
export type RichNode = { type: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: RichNode[] };
export type PostContent = { title: string; slug: string; summary: string; audience: string; author: string; authorBio: string; seoTitle: string; seoDescription: string; answer: string; noindex: boolean; banner: { src: string; kind: "image" | "video"; description: string; poster: string }; body: RichNode; faqs: { question: string; answer: string }[]; sources: { label: string; url: string }[] };
export const blankPost = (): PostContent => ({ title: "", slug: "", summary: "", audience: "Both", author: "Jobboard300 editorial team", authorBio: "", seoTitle: "", seoDescription: "", answer: "", noindex: false, banner: { src: "", kind: "image", description: "", poster: "" }, body: { type: "doc", content: [{ type: "paragraph" }] }, faqs: [], sources: [] });
export const assetPath = /^\/api\/blog\/media\/[a-f0-9-]{36}$/;
export function safeUrl(value: unknown): string { if (typeof value !== "string") return ""; if (/^\/(?!\/)[^\s\\]*$/.test(value)) return value; try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password ? u.href : ""; } catch { return ""; } }
const plain = (v: unknown, n: number) => typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, n).trim() : "";
const allowed = new Set(["doc", "paragraph", "heading", "text", "bulletList", "orderedList", "listItem", "blockquote", "codeBlock", "hardBreak", "horizontalRule", "table", "tableRow", "tableHeader", "tableCell", "blogMedia", "blogChart"]);
export function cleanDocument(input: unknown): RichNode {
  let nodes = 0;
  const walk = (value: unknown, depth: number): RichNode => {
    if (!value || typeof value !== "object" || depth > 20 || ++nodes > 6000) throw new Error("The article is too complex or has invalid content.");
    const v = value as RichNode;
    if (!allowed.has(v.type)) throw new Error(`Unsupported content type: ${String(v.type).slice(0, 30)}`);
    const n: RichNode = { type: v.type }, a = v.attrs || {};
    if (v.type === "text") n.text = typeof v.text === "string" ? v.text.slice(0, 30000) : "";
    if (v.type === "heading") n.attrs = { level: [2, 3, 4].includes(Number(a.level)) ? Number(a.level) : 2 };
    if (["paragraph", "heading"].includes(v.type) && ["left", "center", "right", "justify"].includes(String(a.textAlign))) n.attrs = { ...n.attrs, textAlign: a.textAlign };
    if (["tableCell", "tableHeader"].includes(v.type)) n.attrs = { colspan: Math.max(1, Math.min(12, Number(a.colspan) || 1)), rowspan: Math.max(1, Math.min(30, Number(a.rowspan) || 1)) };
    if (v.type === "orderedList") n.attrs = { start: Math.max(1, Math.min(1000, Number(a.start) || 1)) };
    if (v.type === "blogMedia") { if (!assetPath.test(String(a.src))) throw new Error("Upload images and videos using the media tool."); n.attrs = { src: a.src, kind: a.kind === "video" ? "video" : "image", description: plain(a.description, 600), transcript: plain(a.transcript, 8000) }; }
    if (v.type === "blogChart") { const rows = Array.isArray(a.rows) ? a.rows.slice(0, 30) as { label: unknown; value: unknown }[] : []; if (!rows.length || rows.some(r => !Number.isFinite(Number(r.value)))) throw new Error("Charts need labelled, finite numbers."); n.attrs = { title: plain(a.title, 160), kind: a.kind === "line" ? "line" : "bar", source: safeUrl(a.source), rows: rows.map(r => ({ label: plain(r.label, 100), value: Math.max(-1e12, Math.min(1e12, Number(r.value))) })) }; }
    if (Array.isArray(v.marks)) n.marks = v.marks.slice(0, 12).flatMap(m => {
      if (["bold", "italic", "strike", "underline", "code", "subscript", "superscript"].includes(m.type)) return [{ type: m.type }];
      if (m.type === "link") { const href = safeUrl(m.attrs?.href); return href ? [{ type: "link", attrs: { href } }] : []; }
      if (m.type === "textStyle") { const attrs: Record<string, unknown> = {}; const a = m.attrs || {}; for (const key of ["color", "backgroundColor"]) if (/^#[0-9a-f]{6}$/i.test(String(a[key]))) attrs[key] = a[key]; if (["Roboto", "Georgia", "monospace"].includes(String(a.fontFamily))) attrs.fontFamily = a.fontFamily; if (/^(12|14|16|18|20|24|28|32)px$/.test(String(a.fontSize))) attrs.fontSize = a.fontSize; return [{ type: "textStyle", attrs }]; }
      return [];
    });
    if (Array.isArray(v.content)) n.content = v.content.map(c => walk(c, depth + 1));
    return n;
  };
  const doc = walk(input, 0); if (doc.type !== "doc") throw new Error("The body must be a document."); return doc;
}
export function bodyText(n: RichNode): string { return [n.text || "", ...(n.content || []).map(bodyText)].join(" ").trim(); }
export function mediaIds(post: PostContent): string[] { const ids = new Set<string>(); const add = (v: unknown) => { if (assetPath.test(String(v))) ids.add(String(v).split("/").pop()!); }; add(post.banner.src); add(post.banner.poster); const visit = (n: RichNode) => { if (n.type === "blogMedia") add(n.attrs?.src); n.content?.forEach(visit); }; visit(post.body); return [...ids]; }
export function validatePost(input: unknown, publish = false): PostContent {
  const v = input as Partial<PostContent>; if (!v || typeof v !== "object") throw new Error("Enter an article.");
  const p = blankPost();
  for (const [key, limit] of Object.entries({ title: 160, slug: 100, summary: 320, author: 120, authorBio: 500, seoTitle: 80, seoDescription: 200, answer: 1200 })) (p as unknown as Record<string, unknown>)[key] = plain((v as Record<string, unknown>)[key], limit);
  if (!p.title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug)) throw new Error("Add a title and a URL slug using lowercase letters, numbers and hyphens.");
  p.audience = ["Candidates", "Employers", "Both"].includes(v.audience || "") ? v.audience! : "Both"; p.noindex = v.noindex === true;
  const b = v.banner; p.banner = { src: assetPath.test(b?.src || "") ? b!.src : "", kind: b?.kind === "video" ? "video" : "image", description: plain(b?.description, 600), poster: assetPath.test(b?.poster || "") ? b!.poster : "" };
  p.body = cleanDocument(v.body);
  p.faqs = (Array.isArray(v.faqs) ? v.faqs : []).slice(0, 15).map(f => ({ question: plain(f.question, 240), answer: plain(f.answer, 1600) })).filter(f => f.question && f.answer);
  p.sources = (Array.isArray(v.sources) ? v.sources : []).slice(0, 30).map(s => ({ label: plain(s.label, 200), url: safeUrl(s.url) })).filter(s => s.label && s.url);
  if (publish && (!p.summary || !p.author || !p.banner.src || !p.banner.description || bodyText(p.body).length < 100)) throw new Error("Before publishing, add a summary, author, banner with description and at least 100 characters of article text.");
  if (publish && p.banner.kind === "video" && !p.banner.poster) throw new Error("Add an image poster for the video banner and social preview.");
  return p;
}
