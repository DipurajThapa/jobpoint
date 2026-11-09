// Watermarked CV copies for companies. Every unlocked copy carries a visible
// stamp on every page ("Unlocked by <company> · <date> · Trace <id>") and the
// trace ID in the PDF metadata, so a leaked copy identifies its source.
// PDF originals are stamped; DOCX CVs (and PDFs that cannot be edited) are
// rendered as a clean PDF from the parsed profile and the extracted text.

import type { PortalProfile } from "./profile";
import { formatLpa } from "./india";

// Standard PDF fonts only cover WinAnsi; replace what they cannot draw.
const latin = (s: string) => s.replace(/₹/g, "Rs. ").replace(/[‘’]/g, "'").replace(/[“”]/g, "\"").replace(/[–—]/g, "-").replace(/•/g, "-").replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, "?");

export type Stamp = { company: string; traceId: string; date: string };
const stampText = (s: Stamp) => latin(`Unlocked by ${s.company} on ${s.date} via Job Point - Trace ${s.traceId} - Confidential: for this hiring purpose only`);

export async function watermarkPdf(original: Uint8Array, stamp: Stamp): Promise<Uint8Array | null> {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");
  let doc;
  try { doc = await PDFDocument.load(original, { updateMetadata: false }); }
  catch { return null; } // encrypted or damaged: caller falls back to a rendered copy
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const text = stampText(stamp);
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const size = Math.min(7.5, (width - 40) / font.widthOfTextAtSize(text, 1));
    page.drawRectangle({ x: 0, y: 0, width, height: 16, color: rgb(1, 1, 1), opacity: 0.85 });
    page.drawText(text, { x: 20, y: 5, size, font, color: rgb(0.2, 0.25, 0.4) });
    page.drawText(latin(`${stamp.company} - ${stamp.traceId}`), { x: width * 0.18, y: height * 0.3, size: 34, font, color: rgb(0.6, 0.65, 0.8), opacity: 0.12, rotate: degrees(35) });
  }
  doc.setSubject(`Unlocked copy · trace ${stamp.traceId}`);
  doc.setKeywords([`trace:${stamp.traceId}`, `company:${stamp.company}`]);
  doc.setProducer("Job Point portal");
  return doc.save();
}

/** A clean PDF of the candidate's CV from the parsed profile and extracted text, stamped like an original. */
export async function renderCvPdf(profile: PortalProfile, extractedText: string, stamp: Stamp): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 48, lineGap = 4;
  let page = doc.addPage([W, H]), y = H - M;
  const newPage = () => { page = doc.addPage([W, H]); y = H - M; };
  const write = (raw: string, size = 10, f = font, color = rgb(0.1, 0.12, 0.2)) => {
    const words = latin(raw).split(/\s+/);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(next, size) > W - 2 * M && line) { if (y < M + 20) newPage(); page.drawText(line, { x: M, y, size, font: f, color }); y -= size + lineGap; line = word; }
      else line = next;
    }
    if (line) { if (y < M + 20) newPage(); page.drawText(line, { x: M, y, size, font: f, color }); y -= size + lineGap; }
  };
  write(profile.contact.name || "Candidate", 18, bold);
  write([profile.contact.email, profile.contact.phone, profile.india.currentCity].filter(Boolean).join("  |  "), 10);
  write(`Experience ${profile.india.yearsExperience} years · Notice ${profile.india.noticeDays === null ? "not stated" : `${profile.india.noticeDays} days`} · Current CTC ${formatLpa(profile.india.ctcCurrentInr)} · Expected ${formatLpa(profile.india.ctcExpectedInr)}`, 9);
  y -= 8;
  write("CV text (as uploaded)", 12, bold);
  for (const para of extractedText.split(/\n+/).filter(p => p.trim())) write(para, 9.5);
  const text = stampText(stamp);
  for (const p of doc.getPages()) {
    const size = Math.min(7.5, (W - 40) / font.widthOfTextAtSize(text, 1));
    p.drawText(text, { x: 20, y: 14, size, font, color: rgb(0.2, 0.25, 0.4) });
  }
  doc.setTitle(latin(`CV - ${profile.contact.name || "candidate"}`));
  doc.setSubject(`Unlocked copy · trace ${stamp.traceId}`);
  doc.setKeywords([`trace:${stamp.traceId}`, `company:${stamp.company}`]);
  doc.setProducer("Job Point portal");
  return doc.save();
}
