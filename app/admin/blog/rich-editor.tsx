"use client";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { useState } from "react";
import type { RichNode } from "@/lib/blog/content";
const Media = Node.create({ name: "blogMedia", group: "block", atom: true, addAttributes: () => ({ src: { default: "" }, kind: { default: "image" }, description: { default: "" }, transcript: { default: "" } }), parseHTML: () => [{ tag: "figure[data-blog-media]" }], renderHTML: ({ node, HTMLAttributes }) => ["figure", mergeAttributes(HTMLAttributes, { "data-blog-media": "true" }), node.attrs.kind === "video" ? ["video", { src: node.attrs.src, controls: true }] : ["img", { src: node.attrs.src, alt: node.attrs.description }], ["figcaption", {}, node.attrs.description]] });
const Chart = Node.create({ name: "blogChart", group: "block", atom: true, addAttributes: () => ({ title: { default: "" }, rows: { default: [] }, kind: { default: "bar" }, source: { default: "" } }), parseHTML: () => [{ tag: "figure[data-blog-chart]" }], renderHTML: ({ node }) => ["figure", { "data-blog-chart": "true", class: "editor-chart" }, ["strong", {}, node.attrs.title || "Chart"], ["p", {}, `${node.attrs.kind === "line" ? "Line" : "Bar"} chart · ${node.attrs.rows.length} data points · Open preview to see the graph`]] });
export default function RichEditor({ content, onChange, onReady }: { content: RichNode; onChange: (body: RichNode) => void; onReady: (editor: Editor) => void }) {
  const [link, setLink] = useState("");
  const editor = useEditor({ extensions: [StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: { openOnClick: false } }), TableKit, TextAlign.configure({ types: ["heading", "paragraph"] }), TextStyleKit, Subscript, Superscript, Media, Chart], content, immediatelyRender: false, shouldRerenderOnTransaction: true, onCreate: ({ editor }) => onReady(editor), onUpdate: ({ editor }) => onChange(editor.getJSON() as RichNode), editorProps: { attributes: { "aria-label": "Article body", class: "blog-rich cms-writing" } } });
  if (!editor) return <p>Loading editor…</p>;
  const action = (label: string, run: () => void, active = false) => <button type="button" key={label} aria-pressed={active} onClick={run}>{label}</button>;
  const c = () => editor.chain().focus();
  return <div className="cms-rich-editor"><div className="cms-toolbar" aria-label="Text formatting">
    <select aria-label="Paragraph style" value={editor.isActive("heading") ? String(editor.getAttributes("heading").level) : "p"} onChange={e => e.target.value === "p" ? c().setParagraph().run() : c().toggleHeading({ level: Number(e.target.value) as 2 | 3 | 4 }).run()}><option value="p">Paragraph</option><option value="2">Heading 2</option><option value="3">Heading 3</option><option value="4">Heading 4</option></select>
    {action("Bold", () => c().toggleBold().run(), editor.isActive("bold"))}{action("Italic", () => c().toggleItalic().run(), editor.isActive("italic"))}{action("Underline", () => c().toggleUnderline().run(), editor.isActive("underline"))}{action("Strike", () => c().toggleStrike().run(), editor.isActive("strike"))}{action("Subscript", () => c().toggleSubscript().run())}{action("Superscript", () => c().toggleSuperscript().run())}
    <select aria-label="Font family" onChange={e => c().setFontFamily(e.target.value).run()} defaultValue="Roboto"><option>Roboto</option><option>Georgia</option><option>monospace</option></select><select aria-label="Font size" onChange={e => c().setFontSize(e.target.value).run()} defaultValue="18px">{[12,14,16,18,20,24,28,32].map(n => <option key={n}>{n}px</option>)}</select>
    <label>Text <input type="color" aria-label="Text colour" onChange={e => c().setColor(e.target.value).run()} /></label><label>Highlight <input type="color" aria-label="Highlight colour" defaultValue="#fff3b0" onChange={e => c().setBackgroundColor(e.target.value).run()} /></label>
    {(["left", "center", "right", "justify"] as const).map(align => action(align, () => c().setTextAlign(align).run()))}
    {action("Bullets", () => c().toggleBulletList().run())}{action("Numbered list", () => c().toggleOrderedList().run())}{action("Quote", () => c().toggleBlockquote().run())}{action("Divider", () => c().setHorizontalRule().run())}{action("Code", () => c().toggleCode().run())}{action("Code block", () => c().toggleCodeBlock().run())}
    {action("Table", () => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}{editor.isActive("table") && <>{action("+ row", () => c().addRowAfter().run())}{action("− row", () => c().deleteRow().run())}{action("+ column", () => c().addColumnAfter().run())}{action("− column", () => c().deleteColumn().run())}{action("Merge cells", () => c().mergeCells().run())}{action("Split cell", () => c().splitCell().run())}{action("Remove table", () => c().deleteTable().run())}</>}
    {action("Clear formatting", () => c().clearNodes().unsetAllMarks().run())}{action("Undo", () => c().undo().run())}{action("Redo", () => c().redo().run())}
    <div className="cms-link-tool"><input type="url" placeholder="https://…" aria-label="Link URL" value={link} onChange={e => setLink(e.target.value)} />{action("Link selection", () => { if (/^https:\/\//.test(link)) c().setLink({ href: link }).run(); })}{action("Unlink", () => c().unsetLink().run())}</div>
  </div><EditorContent editor={editor} /></div>;
}
