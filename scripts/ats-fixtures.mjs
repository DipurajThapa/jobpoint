// Fictional CV fixtures for the CV screening checks. All people, companies,
// emails and phone numbers are invented. Requires the pre-installed Chromium.
import { createRequire } from "node:module";
import { deflateRawSync, crc32 } from "node:zlib";

export async function buildFixtures() {
  const require = createRequire(import.meta.url);
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  async function pdfFrom(html) {
    const page = await browser.newPage();
    await page.setContent(html);
    const pdf = await page.pdf({ format: "A4", margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" } });
    await page.close();
    return new Uint8Array(pdf);
  }

  const accountantPdf = await pdfFrom(`<html><body style="font-family:Arial;font-size:11px">
  <h1 style="margin:0">Riya Sen</h1>
  <p>Accounts Executive · riya.sen@example.com · +91 98300 12345 · Durgapur, West Bengal</p>
  <div style="display:flex;gap:28px"><div style="width:32%">
  <h3>KEY SKILLS</h3><ul><li>Tally Prime</li><li>GST returns (GSTR-1, GSTR-3B)</li><li>TDS</li><li>Advanced Excel (VLOOKUP, pivot tables)</li><li>Bank reconciliation</li><li>Zoho Books</li></ul>
  <h3>LANGUAGES</h3><p>English, Hindi, Bengali</p>
  <h3>PERSONAL DETAILS</h3><p>Date of Birth: 14/02/1996</p><p>Gender: Female</p><p>Marital Status: Married</p><p>Religion: Hindu</p><p>Father's Name: Ashok Sen</p>
  </div><div style="width:68%">
  <h3>PROFESSIONAL SUMMARY</h3><p>Accounts professional with 4+ years of experience in bookkeeping, GST compliance and month-end closing for manufacturing and trading businesses.</p>
  <h3>WORK EXPERIENCE</h3>
  <p><b>Accounts Executive</b><br>Example Steel Traders Pvt. Ltd., Durgapur<br>Apr 2023 – Present</p>
  <ul><li>Maintain books of accounts in Tally Prime for 3 group companies</li><li>File GST returns (GSTR-1, GSTR-3B) and TDS returns every month</li><li>Prepare bank reconciliation statements and MIS reports in Excel</li></ul>
  <p><b>Junior Accountant</b><br>Sample Agro Industries Ltd, Asansol<br>Jun 2021 – Mar 2023</p>
  <ul><li>Voucher entry and ledger posting in Tally ERP 9</li><li>Vendor payments and accounts payable follow-up</li></ul>
  <h3>EDUCATION</h3><p>B.Com (Accountancy Honours), Example University, 2021</p><p>Higher Secondary (Commerce), WBCHSE, 2018</p>
  <h3>CERTIFICATIONS</h3><p>GST Practitioner Course, Example Institute</p>
  <p>Notice period: 30 days</p>
  </div></div></body></html>`);

  // A CV that lists every keyword but shows none of them in work history.
  const stuffedPdf = await pdfFrom(`<html><body style="font-family:Arial;font-size:11px">
  <h1>Arjun Das</h1><p>arjun.das@example.com · 9831012345 · Kolkata</p>
  <h3>SKILLS</h3><p>Tally, GST, TDS, Excel, Bank reconciliation, SAP FICO, Busy, QuickBooks, Payroll, Audit, Costing, Budgeting</p>
  <h3>EXPERIENCE</h3><p><b>Customer Support Associate</b>, Example BPO Services Pvt Ltd, Kolkata, Jan 2022 – Present</p>
  <ul><li>Handled inbound customer calls and resolved complaints</li><li>Logged tickets in Freshdesk</li></ul>
  <h3>EDUCATION</h3><p>B.A., Example College, 2021</p></body></html>`);

  const scannedPdf = await pdfFrom(`<html><body><div style="width:500px;height:700px;background:repeating-linear-gradient(0deg,#eee,#eee 6px,#fff 6px,#fff 12px)"></div><p>CV</p></body></html>`);
  await browser.close();

  function zip(files) {
    const locals = [], centrals = [];
    let offset = 0;
    for (const [name, content] of Object.entries(files)) {
      const data = Buffer.from(content, "utf8"), packed = deflateRawSync(data), nameBuf = Buffer.from(name);
      const crc = crc32(data);
      const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
      local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
      const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
      central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
      locals.push(local, nameBuf, packed); centrals.push(central, nameBuf);
      offset += 30 + nameBuf.length + packed.length;
    }
    const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
    return new Uint8Array(Buffer.concat([...locals, cd, end]));
  }
  const para = (text, bullet = false) => `<w:p>${bullet ? "<w:pPr><w:numPr><w:ilvl w:val=\"0\"/><w:numId w:val=\"1\"/></w:numPr></w:pPr>" : ""}<w:r><w:t xml:space="preserve">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</w:t></w:r></w:p>`;
  const salesDocx = zip({
    "[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    "word/document.xml": `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${[
      para("Kabir Roy"), para("kabir.roy@example.com | 7001234567 | Asansol, West Bengal"), para("Gender: Male | DOB: 02-03-1994"),
      para("Career Objective"), para("Field sales professional with 6 years of experience selling FMCG products through distributors and retailers."),
      para("Work Experience"), para("Senior Sales Executive – Example Foods Pvt Ltd, Asansol"), para("Mar 2020 – Present"),
      para("Manage 40+ retailers and 3 distributors across Asansol territory", true), para("Achieved 112% of monthly sales targets; lead generation and cold calling", true), para("Report daily sales in Excel and the company CRM", true),
      para("Sales Executive, Sample Consumer Goods Ltd"), para("Jul 2018 to Feb 2020"), para("Secondary sales and dealer management in general trade", true),
      para("Education"), para("BBA, Example University, 2018"), para("Languages Known: English, Hindi, Bengali"),
    ].join("")}</w:body></w:document>`,
  });

  const accountsJob = {
    title: "Accounts Executive",
    location: "Durgapur, West Bengal",
    workMode: "On-site",
    description: "Example Engineering Works is hiring an Accounts Executive for its Durgapur plant.\nResponsibilities:\n• Maintain books of accounts and ledgers in Tally\n• Prepare bank reconciliation statements\n• Coordinate with auditors for statutory audit",
    requirements: "B.Com graduate with 2-5 years of experience in accounting.\nMust have hands-on experience with Tally, GST returns and TDS.\nGood knowledge of MS Excel.\nExperience with SAP is an advantage.\nFluent in Bengali and English.",
  };

  return { accountantPdf, stuffedPdf, scannedPdf, salesDocx, accountsJob };
}
