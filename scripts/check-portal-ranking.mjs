// Ranking quality check on the seed set: 36 fictional Indian CVs rendered as
// real PDF/DOCX files, run through the real parser, the portal matching engine
// and the automatic release rules for 5 JDs from 3 companies. Reports
// precision@5, nDCG@10, release precision and the top matches with their
// explanations, and checks the seed edge cases (scanned, duplicate, stuffed).
//   node scripts/check-portal-ranking.mjs [report.md]
import assert from "node:assert/strict";
import { createRequire, register } from "node:module";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateRawSync, crc32 } from "node:zlib";
import { createD1 } from "./lib/d1-sqlite.mjs";
import { CVS, JDS, COMPANIES } from "./portal-seed-data.mjs";

register("data:text/javascript," + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (/^\\.\\.?\\//.test(specifier) && !/\\.[cm]?[jt]s$/.test(specifier) && context.parentURL?.endsWith(".ts")) return next(specifier + ".ts", context);
  return next(specifier, context);
}`));
const root = resolve(import.meta.dirname, "..");
const mod = name => import(resolve(root, "lib/portal", name));
const [dbm, company, candidate, consent, ingest, queue, client] = await Promise.all(["db.ts", "company.ts", "candidate.ts", "consent.ts", "ingest.ts", "queue.ts", "client.ts"].map(mod));
dbm.setClock(() => new Date("2026-11-09T06:00:00Z"));
const SECRET = "ranking-check-secret-ranking-check-secret";

// ---------- Render CV files ----------
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const browser = await chromium.launch();
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
async function pdf(text, scanned) {
  const page = await browser.newPage();
  const body = scanned ? `<div style="width:520px;height:740px;background:repeating-linear-gradient(0deg,#ddd,#ddd 5px,#fff 5px,#fff 11px)"></div>`
    : text.split("\n").map(l => /^[A-Z][A-Z &/]{3,}$/.test(l.trim()) ? `<h3 style="margin:10px 0 4px">${esc(l)}</h3>` : `<p style="margin:0 0 3px">${esc(l) || "&nbsp;"}</p>`).join("");
  await page.setContent(`<html><body style="font-family:Arial;font-size:10.5px">${body}</body></html>`);
  const out = new Uint8Array(await page.pdf({ format: "A4", margin: { top: "14mm", bottom: "14mm", left: "14mm", right: "14mm" } }));
  await page.close();
  return out;
}
function docx(text) {
  const para = t => `<w:p>${t.startsWith("• ") ? '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>' : ""}<w:r><w:t xml:space="preserve">${esc(t.replace(/^• /, ""))}</w:t></w:r></w:p>`;
  const files = { "[Content_Types].xml": '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>', "word/document.xml": `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${text.split("\n").map(para).join("")}</w:body></w:document>` };
  const locals = [], centrals = []; let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content), packed = deflateRawSync(data), n = Buffer.from(name), crc = crc32(data);
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(8, 8); l.writeUInt32LE(crc, 14); l.writeUInt32LE(packed.length, 18); l.writeUInt32LE(data.length, 22); l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10); c.writeUInt32LE(crc, 16); c.writeUInt32LE(packed.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    locals.push(l, n, packed); centrals.push(c, n); offset += 30 + n.length + packed.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(2, 8); end.writeUInt16LE(2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, end]));
}

// ---------- Build the portal ----------
const db = createD1(root);
const companyIds = {}, jdIds = {};
for (const c of COMPANIES) {
  const { createAccount } = await mod("accounts.ts");
  const acc = await createAccount(db, "company_user", `owner@${c.key}.example.com`, "quiet harbour lantern 2026");
  companyIds[c.key] = await company.applyCompany(db, { accountId: acc, legalName: c.legalName, displayName: c.displayName, city: c.city });
  await company.activateCompany(db, companyIds[c.key], c.params, "admin");
}
const candIds = {}, byCand = {};
for (const cv of CVS) {
  const first = cv.text.split("\n")[0]?.trim() || cv.key;
  const email = cv.text.match(/[A-Za-z0-9._%+-]+@example\.(?:com|in)/)?.[0] ?? `${cv.key}@example.com`;
  const id = await candidate.createCandidate(db, { accountId: null, displayName: first, email, phone: cv.text.match(/\+91 90000 1\d{4}/)?.[0] ?? "" });
  await consent.recordConsent(db, id, "profile_processing", "granted");
  await consent.recordConsent(db, id, "share_with_companies", "granted");
  const bytes = cv.format === "docx" ? docx(cv.text) : await pdf(cv.text, cv.format === "scanned");
  const out = await ingest.ingestCv(db, null, id, { bytes, fileName: `${cv.key}.${cv.format === "docx" ? "docx" : "pdf"}` });
  candIds[cv.key] = id; byCand[id] = { key: cv.key, status: out.status, profile: out.profile };
}
await browser.close();
for (const jd of JDS) {
  const cid = companyIds[jd.company];
  const { id } = await company.createJd(db, cid, "owner", { title: jd.title, text: jd.text, location: jd.location, workMode: jd.workMode });
  const { conflicts } = await company.submitJd(db, cid, id, "owner");
  assert.deepEqual(conflicts, [], `${jd.key} conflicts: ${conflicts.join(" | ")}`);
  await company.decideJd(db, id, true, "admin");
  jdIds[jd.key] = id;
}
let pass = 0;
do { pass = (await queue.drainQueue(db, SECRET, 2000)).remaining; } while (pass > 0);

// ---------- Evaluate ----------
const dcg = rels => rels.reduce((s, r, i) => s + (2 ** r - 1) / Math.log2(i + 2), 0);
const lines = ["# Ranking check on the seed set", "", "36 fictional CVs (real PDF/DOCX files through the real parser) × 5 JDs. Ranked by the lower bound (score − 1 SD); released only when hard filters pass and the lower bound reaches the company's approved minimum.", ""];
const summary = [];
for (const jd of JDS) {
  const id = jdIds[jd.key];
  const params = (await company.currentParams(db, companyIds[jd.company])).params;
  const { results } = await db.prepare("SELECT candidate_id, score, lower_bound, hard_pass, failed_filters, explanation FROM matches WHERE jd_id = ? ORDER BY hard_pass DESC, lower_bound DESC, score DESC").bind(id).all();
  const ranked = results.filter(r => r.hard_pass === 1);
  const rel = r => jd.relevance[byCand[r.candidate_id].key] ?? 0;
  const top10 = ranked.slice(0, 10).map(rel);
  const ideal = Object.values(jd.relevance).sort((a, b) => b - a).slice(0, 10);
  const ndcg = dcg(top10) / (dcg(ideal) || 1);
  const p5 = ranked.slice(0, 5).filter(r => rel(r) >= 2).length / Math.max(1, Math.min(5, ranked.length));
  // "Released" here means clearing the client's shortlist bar (hard filters passed and the lower bound at or above the
  // minimum score). Nothing reaches a client automatically any more: a recruiter submits from this shortlist.
  const released = ranked.filter(r => r.lower_bound >= params.minScore).slice(0, params.maxReleasePerJd).map(r => r.candidate_id);
  const relPrecision = released.length ? released.filter(c => (jd.relevance[byCand[c].key] ?? 0) >= 2).length / released.length : 1;
  const strongMissed = Object.entries(jd.relevance).filter(([k, r]) => r >= 2 && !released.includes(candIds[k])).map(([k]) => k);
  summary.push({ jd: jd.key, eligible: ranked.length, released: released.length, p5: +p5.toFixed(2), ndcg10: +ndcg.toFixed(2), releasePrecision: +relPrecision.toFixed(2), strongNotReleased: strongMissed.join(", ") });
  lines.push(`## ${jd.title} (${jd.location}) — min score ${params.minScore}`, "", `Eligible after hard filters: ${ranked.length} · Released: ${released.length} · P@5 ${p5.toFixed(2)} · nDCG@10 ${ndcg.toFixed(2)} · release precision ${relPrecision.toFixed(2)}`, "");
  lines.push("| # | CV | Label | Score | Lower bound | Released | Explanation |", "|---|---|---|---|---|---|---|");
  ranked.slice(0, 10).forEach((r, i) => { const e = JSON.parse(r.explanation); lines.push(`| ${i + 1} | ${byCand[r.candidate_id].key} | ${rel(r)} | ${r.score} | ${r.lower_bound} | ${released.includes(r.candidate_id) ? "yes" : "no"} | ${e.summary} Meets: ${e.meets.slice(0, 4).join("; ")}. ${e.misses.length ? `Misses: ${e.misses.slice(0, 3).join("; ")}.` : ""} ${e.why} |`); });
  const failedStrong = results.filter(r => r.hard_pass === 0 && (jd.relevance[byCand[r.candidate_id].key] ?? 0) >= 2);
  if (failedStrong.length) lines.push("", `Labelled 2+ but stopped by a hard filter: ${failedStrong.map(r => `${byCand[r.candidate_id].key} (${JSON.parse(r.failed_filters).join(" ")})`).join("; ")}`);
  lines.push("");
}
console.table(summary);
if (process.env.COMP) for (const [jk, ck] of process.env.COMP.split(",").map(x => x.split(":"))) { const r = await db.prepare("SELECT explanation FROM matches WHERE jd_id = ? AND candidate_id = ?").bind(jdIds[jk], candIds[ck]).first(); const e = JSON.parse(r.explanation); console.log(jk, ck, JSON.stringify(e.components.map(c => [c.key, c.weight, c.mean === null ? null : +c.mean.toFixed(2), +c.sd.toFixed(2), c.detail])), JSON.stringify(e.checks.map(c => [c.requirement, c.status, c.mean]))); }
if (process.env.DIAG) for (const jd of JDS) { const { results } = await db.prepare("SELECT candidate_id, score, failed_filters FROM matches WHERE jd_id = ? AND hard_pass = 0").bind(jdIds[jd.key]).all(); for (const r of results) if ((jd.relevance[byCand[r.candidate_id].key] ?? 0) >= 2) console.log(jd.key, byCand[r.candidate_id].key, r.score, r.failed_filters, JSON.stringify(byCand[r.candidate_id].profile.india)); }

// ---------- Edge cases ----------
const scans = CVS.filter(c => c.format === "scanned").map(c => byCand[candIds[c.key]].status);
assert.ok(scans.every(s => s === "needs_review"), `scanned CVs go to review: ${scans}`);
const dup = (await db.prepare("SELECT signal FROM duplicate_flags").all()).results.map(r => r.signal);
assert.ok(dup.includes("same_email") || dup.includes("near_identical_text"), `duplicate pair flagged: ${dup}`);
const stuffed = await db.prepare("SELECT score, hard_pass FROM matches WHERE jd_id = ? AND candidate_id = ?").bind(jdIds["jd-accounts-durgapur"], candIds["sup-02"]).first();
assert.ok(!stuffed || stuffed.hard_pass === 0 || stuffed.score < 60, `keyword-stuffed support CV is not an accounts match: ${JSON.stringify(stuffed)}`);
const leaks = [];
for (const jd of JDS) {
  // What a recruiter sees in the shortlist: a summary for every row, and no contact details in it.
  const shortlist = await client.submissionCandidates(db, jdIds[jd.key]);
  const text = JSON.stringify(shortlist.map(r => r.explanation));
  for (const cv of CVS) {
    const email = cv.text.match(/[A-Za-z0-9._%+-]+@example\.(?:com|in)/)?.[0];
    const phone = cv.text.match(/\+91 90000 1\d{4}/)?.[0];
    if ((email && text.includes(email)) || (phone && text.includes(phone))) leaks.push(`${jd.key}:${cv.key}`);
  }
  for (const r of shortlist) assert.ok(r.explanation, "every shortlisted CV carries an explanation");
}
assert.deepEqual(leaks, [], `contact details leaked into shortlist summaries: ${leaks}`);
for (const s of summary) assert.ok(s.p5 >= 0.6 && s.ndcg10 >= 0.6 && s.releasePrecision >= 0.75, `ranking quality too low for ${s.jd}: ${JSON.stringify(s)}`);
lines.push("Edge cases: scanned CVs are in manual review; the duplicate pair is flagged; the keyword-stuffed support CV is not an accounts match; previews contain no contact details.");
if (process.argv[2]) writeFileSync(resolve(process.argv[2]), lines.join("\n") + "\n");
console.log("\nRanking check passed.");
