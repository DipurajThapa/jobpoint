// Text extraction from uploaded CVs (PDF and DOCX), for Workers and Node.
// PDFs use unpdf (a serverless build of Mozilla pdf.js). DOCX files are read
// with a small ZIP reader and DecompressionStream; no other dependency.

export type ExtractedText = { text: string; pages: number | null; fileType: "pdf" | "docx"; warnings: string[] };

const MAX_PDF_PAGES = 12;
const MAX_XML_BYTES = 8 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 24 * 1024 * 1024;
const MAX_TEXT_CHARS = 200000;

export function detectFileType(bytes: Uint8Array, name: string): "pdf" | "docx" | null {
  const lower = name.toLowerCase();
  const head = new TextDecoder().decode(bytes.slice(0, 5));
  if (lower.endsWith(".pdf") && head === "%PDF-") return "pdf";
  if (lower.endsWith(".docx") && bytes[0] === 0x50 && bytes[1] === 0x4b) return "docx";
  return null;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function extractText(bytes: Uint8Array, fileType: "pdf" | "docx"): Promise<ExtractedText> {
  const result = fileType === "pdf" ? await extractPdf(bytes) : await extractDocx(bytes);
  result.text = tidy(result.text);
  if (result.text.replace(/\s/g, "").length < 200) result.warnings.push(fileType === "pdf"
    ? "Very little text was found. The PDF may be a scanned image; read the CV manually."
    : "Very little text was found in this document; read the CV manually.");
  return result;
}

async function extractPdf(bytes: Uint8Array): Promise<ExtractedText> {
  const { getDocumentProxy } = await import("unpdf");
  const warnings: string[] = [];
  // pdf.js honours isEvalSupported even though unpdf's types omit it; Workers forbid eval.
  const options = { isEvalSupported: false, useSystemFonts: false } as unknown as Parameters<typeof getDocumentProxy>[1];
  const doc = await getDocumentProxy(new Uint8Array(bytes), options);
  try {
    const inspect = doc as unknown as { getJSActions?: () => Promise<unknown>; getAttachments?: () => Promise<unknown> };
    if ((inspect.getJSActions && await inspect.getJSActions()) || (inspect.getAttachments && await inspect.getAttachments())) throw new Error("Upload a PDF without scripts or embedded attachments.");
    const pages = doc.numPages;
    if (pages > MAX_PDF_PAGES) warnings.push(`Only the first ${MAX_PDF_PAGES} of ${pages} pages were read.`);
    const out: string[] = [];
    for (let n = 1; n <= Math.min(pages, MAX_PDF_PAGES); n++) {
      const page = await doc.getPage(n);
      const actions = page as unknown as { getJSActions?: () => Promise<unknown> };
      if (actions.getJSActions && await actions.getJSActions()) throw new Error("Upload a PDF without scripts.");
      const content = await page.getTextContent();
      if (content.items.length > 100000) throw new Error("This PDF is too complex to process safely.");
      // Rebuild lines from text items: pdf.js marks line ends with hasEOL, and a
      // vertical jump between items also starts a new line.
      let line = "", lastY: number | null = null;
      for (const item of content.items as { str?: string; hasEOL?: boolean; transform?: number[] }[]) {
        if (typeof item.str !== "string") continue;
        const y = item.transform?.[5] ?? null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && line.trim()) { out.push(line); line = ""; }
        line += item.str;
        if (item.hasEOL) { out.push(line); line = ""; }
        lastY = y;
      }
      if (line.trim()) out.push(line);
      out.push("");
      if (out.reduce((n, line) => n + line.length, 0) > MAX_TEXT_CHARS) throw new Error("This PDF contains too much text for a CV.");
    }
    return { text: out.join("\n"), pages, fileType: "pdf", warnings };
  } finally {
    // Release parser memory; the method name differs between pdf.js builds.
    const disposable = doc as unknown as { destroy?: () => Promise<void>; cleanup?: () => Promise<void> };
    await (disposable.destroy ?? disposable.cleanup)?.call(doc);
  }
}

async function extractDocx(bytes: Uint8Array): Promise<ExtractedText> {
  const entries = readZipDirectory(bytes);
  if (!entries.has("[Content_Types].xml")) throw new Error("This DOCX is missing its content types.");
  for (const [name, entry] of entries) {
    if (/vbaProject|embeddings\/|activeX\/|\.(?:exe|dll|com|js|vbs|ps1)$/i.test(name)) throw new Error("Upload a DOCX without macros or embedded programs.");
    if (name.endsWith(".rels")) {
      const relations = await readZipEntry(bytes, entry);
      if (/<!DOCTYPE|<!ENTITY|Type=["'][^"']*(?:attachedTemplate|oleObject|aFChunk)/i.test(relations)) throw new Error("Upload a DOCX without active or linked document content.");
    }
  }
  const main = entries.get("word/document.xml");
  if (!main) throw new Error("This DOCX file has no main document part.");
  const parts = [...entries.keys()].filter(name => /^word\/header\d*\.xml$/.test(name)).sort();
  if (parts.length > 24) throw new Error("This DOCX contains too many header sections.");
  const texts: string[] = [];
  for (const name of [...parts, "word/document.xml"]) texts.push(docxXmlToText(await readZipEntry(bytes, entries.get(name)!)));
  if (texts.join("\n").length > MAX_TEXT_CHARS) throw new Error("This DOCX contains too much text for a CV.");
  return { text: texts.join("\n"), pages: null, fileType: "docx", warnings: [] };
}

type ZipEntry = { method: number; compressedSize: number; size: number; offset: number };

function readZipDirectory(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("The DOCX file is not a valid ZIP archive.");
  const count = view.getUint16(eocd + 10, true);
  if (count > 1000 || view.getUint16(eocd + 4, true) || view.getUint16(eocd + 6, true)) throw new Error("Unsupported DOCX archive.");
  let expanded = 0;
  let pos = view.getUint32(eocd + 16, true);
  const entries = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i++) {
    if (pos + 46 > eocd || view.getUint32(pos, true) !== 0x02014b50) throw new Error("The DOCX directory is damaged.");
    if (view.getUint16(pos + 8, true) & 1) throw new Error("Encrypted DOCX files are not supported.");
    const method = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true), size = view.getUint32(pos + 24, true);
    const nameLength = view.getUint16(pos + 28, true), extra = view.getUint16(pos + 30, true), comment = view.getUint16(pos + 32, true);
    const offset = view.getUint32(pos + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + nameLength));
    expanded += size;
    if (pos + 46 + nameLength + extra + comment > eocd || offset + 30 > bytes.length || compressedSize > bytes.length || size > MAX_XML_BYTES || expanded > MAX_ARCHIVE_BYTES || (compressedSize && size / compressedSize > 200)) throw new Error("This DOCX archive exceeds safe processing limits.");
    if (entries.has(name) || name.includes("..") || name.startsWith("/") || name.includes("\\") || name.includes("\0")) throw new Error("The DOCX has invalid archive paths.");
    entries.set(name, { method, compressedSize, size, offset });
    pos += 46 + nameLength + extra + comment;
  }
  return entries;
}

async function readZipEntry(bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(entry.offset, true) !== 0x04034b50) throw new Error("The DOCX file is damaged.");
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
  if (start + entry.compressedSize > bytes.length) throw new Error("The DOCX entry is truncated.");
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (entry.size > MAX_XML_BYTES) throw new Error("The DOCX file is too large to read.");
  if (entry.method === 0) { if (data.length !== entry.size) throw new Error("The DOCX entry size is invalid."); return new TextDecoder().decode(data); }
  if (entry.method !== 8) throw new Error("The DOCX file uses an unsupported compression method.");
  // Inflate with a hard cap so a crafted file cannot expand without limit.
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_XML_BYTES) { await reader.cancel(); throw new Error("The DOCX file is too large to read."); }
    chunks.push(value);
  }
  if (total !== entry.size) throw new Error("The DOCX entry size is invalid.");
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.byteLength; }
  return new TextDecoder().decode(out);
}

export function docxXmlToText(xml: string): string {
  if (/<!DOCTYPE|<!ENTITY|\bDDEAUTO\b|\bINCLUDETEXT\b/i.test(xml)) throw new Error("Upload a DOCX without external entities or active fields.");
  return decodeEntities(xml
    .replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, "") // text boxes are stored twice
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:(?:br|cr)\b[^>]*\/>/g, "\n")
    .replace(/<\/w:tc>/g, "\t")
    .replace(/<\/w:(?:p|tr)>/g, "\n")
    .replace(/<w:numPr>[\s\S]*?<\/w:numPr>/g, "• ")
    .replace(/<[^>]+>/g, ""));
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/** Normalise whitespace and bullet glyphs while keeping line structure. */
export function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[  -​  　]/g, " ")
    .replace(/[▪●◦‣⁃∙➢❖]/g, "•")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
