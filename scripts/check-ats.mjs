// Checks for the owner-only CV screening engine (lib/ats) using fictional CVs.
// Builds real PDF (Chromium) and DOCX fixtures, then checks extraction,
// parsing, personal-data exclusion, redaction, JD parsing and scoring.
// No network access and no API key are needed.
//
//   node scripts/check-ats.mjs [output-dir]   (writes the parsed JSON for review)
import assert from "node:assert/strict";
import { register } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildFixtures } from "./ats-fixtures.mjs";

// Resolve extension-less relative imports between the TypeScript sources.
register("data:text/javascript," + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (/^\\.\\.?\\//.test(specifier) && !/\\.[cm]?[jt]s$/.test(specifier) && context.parentURL?.endsWith(".ts")) return next(specifier + ".ts", context);
  return next(specifier, context);
}`));

const root = resolve(import.meta.dirname, "..");
const out = process.argv[2] ? resolve(process.argv[2]) : null;
if (out) mkdirSync(out, { recursive: true });
const lib = name => import(resolve(root, "lib/ats", name));
const { analyseCv, screen } = await lib("pipeline.ts");
const { parseJobDescription, sanitiseRequirements } = await lib("jd-parser.ts");
const { redact } = await lib("ai.ts");
const { titleSimilarity } = await lib("score.ts");
const { docxXmlToText } = await lib("extract.ts");

let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log("PASS", name); };
const NOW = new Date("2026-11-09T00:00:00Z");

const { accountantPdf, stuffedPdf, scannedPdf, salesDocx, accountsJob } = await buildFixtures();
const encode = text => new TextEncoder().encode(text);

// ---------- Checks ----------
const accountant = await analyseCv({ bytes: accountantPdf, fileName: "riya-sen.pdf", now: NOW });
const stuffed = await analyseCv({ bytes: stuffedPdf, fileName: "arjun-das.pdf", now: NOW });
const sales = await analyseCv({ bytes: salesDocx, fileName: "kabir-roy.docx", knownLocation: "Asansol", now: NOW });
const scanned = await analyseCv({ bytes: scannedPdf, fileName: "scan.pdf", now: NOW });
const req = parseJobDescription(accountsJob);
const results = { accountant: screen(accountant, req, "", NOW), stuffed: screen(stuffed, req, "", NOW), sales: screen(sales, req, "Sales", NOW), scanned: screen(scanned, req, "", NOW) };
if (out) {
  writeFileSync(resolve(out, "requirements.json"), JSON.stringify(req, null, 2));
  for (const [name, profile] of Object.entries({ accountant, stuffed, sales, scanned })) writeFileSync(resolve(out, `${name}.profile.json`), JSON.stringify(profile, null, 2));
  for (const [name, result] of Object.entries(results)) writeFileSync(resolve(out, `${name}.result.json`), JSON.stringify(result, null, 2));
}

await check("PDF: contact details", () => {
  assert.equal(accountant.contact.name, "Riya Sen");
  assert.equal(accountant.contact.email, "riya.sen@example.com");
  assert.match(accountant.contact.phone, /98300 12345/);
});
await check("PDF: two dated roles with titles and employers", () => {
  assert.equal(accountant.work.length, 2, JSON.stringify(accountant.work, null, 1));
  assert.equal(accountant.work[0].title, "Accounts Executive");
  assert.match(accountant.work[0].employer, /Example Steel Traders/);
  assert.equal(accountant.work[0].current, true);
  assert.equal(accountant.work[1].title, "Junior Accountant");
  assert.equal(accountant.work[1].months, 22);
  assert.ok(accountant.work[0].highlights.some(h => /GST returns/.test(h)));
});
await check("PDF: total experience merges roles (Jun 2021 to Nov 2026)", () => assert.equal(accountant.totalExperienceMonths, 66));
await check("PDF: skills carry evidence, usage and recency", () => {
  const tally = accountant.skills.find(s => s.id === "tally");
  assert.equal(tally.evidence, "work");
  assert.equal(tally.lastUsedYear, 2026);
  assert.ok(tally.months >= 60, `tally months ${tally.months}`);
  assert.equal(accountant.skills.find(s => s.id === "zoho-books").evidence, "listed");
  assert.ok(!accountant.skills.some(s => /^(pivot|tables\)?)$/i.test(s.name)), "bracketed lists are not split into fragments");
});
await check("PDF: education levels, fields and years", () => {
  assert.equal(accountant.education[0].qualification, "B.Com");
  assert.equal(accountant.education[0].level, 4);
  assert.equal(accountant.education[0].year, 2021);
  assert.ok(accountant.education.some(e => e.level === 2));
});
await check("PDF: languages, certification and notice period", () => {
  assert.deepEqual(accountant.languages.sort(), ["Bengali", "English", "Hindi"]);
  assert.ok(accountant.certifications.some(c => /GST Practitioner/.test(c)));
  assert.equal(accountant.noticePeriod, "30 days");
  assert.equal(accountant.statedExperienceYears, 4);
});
await check("Personal characteristics are removed and never stored", () => {
  assert.deepEqual([...accountant.excludedPersonalFields].sort(), ["date of birth", "family member names", "gender", "marital status", "religion"]);
  const json = JSON.stringify(accountant);
  for (const value of ["14/02/1996", "Female", "Married", "Hindu", "Ashok"]) assert.ok(!json.includes(value), `profile leaks ${value}`);
  assert.ok(sales.excludedPersonalFields.includes("gender") && sales.excludedPersonalFields.includes("date of birth"));
  assert.ok(!JSON.stringify(sales).includes("02-03-1994"));
});
await check("DOCX: text, roles and bullets are read", () => {
  assert.equal(sales.source.fileType, "docx");
  assert.equal(sales.work.length, 2, JSON.stringify(sales.work, null, 1));
  assert.equal(sales.work[0].title, "Senior Sales Executive");
  assert.match(sales.work[0].employer, /Example Foods/);
  assert.equal(sales.work[1].months, 20);
  assert.ok(sales.skills.some(s => s.id === "field-sales" && s.evidence !== "listed") || sales.skills.some(s => s.id === "channel-sales"));
  assert.equal(sales.contact.location, "Asansol");
  assert.match(docxXmlToText("<w:p><w:r><w:t>A &amp; B</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>C</w:t></w:r></w:p>"), /A & B\tC/);
});
await check("JD parser: must-have, nice-to-have, years, education", () => {
  const must = req.mustHave.map(s => s.id), nice = req.niceToHave.map(s => s.id);
  for (const id of ["tally", "gst", "tds", "excel", "lang-bengali", "lang-english"]) assert.ok(must.includes(id), `must ${id}: ${must}`);
  assert.ok(nice.includes("sap"), `nice: ${nice}`);
  assert.ok(nice.includes("bank-reconciliation"), `duties become nice-to-have when requirements exist: ${nice}`);
  assert.equal(req.minYears, 2); assert.equal(req.maxYears, 5);
  assert.equal(req.educationLevel, 4); assert.deepEqual(req.educationFields, ["Commerce"]);
});
await check("Matching accountant scores as a strong fit", () => {
  const r = results.accountant;
  assert.equal(r.verdict, "strong", JSON.stringify(r, null, 1));
  assert.ok(r.score >= 80, `score ${r.score}`);
  assert.ok(r.checks.filter(c => c.kind === "must").every(c => c.status === "met"), JSON.stringify(r.checks));
});
await check("Keyword-stuffed CV is not rewarded for a bare skills list", () => {
  const r = results.stuffed;
  const tally = r.checks.find(c => c.requirement === "Tally");
  assert.equal(tally.status, "unverified");
  assert.equal(tally.credit, 0.6);
  assert.ok(r.score < results.accountant.score - 25, `stuffed ${r.score} vs ${results.accountant.score}`);
  assert.notEqual(r.verdict, "strong");
  assert.ok(r.interviewProbes.some(p => /example of using Tally/.test(p)));
});
await check("Sales CV against an accounts role is a weak fit or lower", () => {
  assert.ok(["weak", "not_fit"].includes(results.sales.verdict), `${results.sales.verdict} ${results.sales.score}`);
});
await check("Unreadable or scanned CV is sent for manual review", () => {
  assert.equal(results.scanned.verdict, "needs_review");
  assert.ok(scanned.parse.warnings.some(w => /scanned/.test(w)));
});
await check("Gaps and personal fields appear as flags only", () => {
  const r = results.accountant;
  assert.ok(r.flags.some(f => /Removed before screening/.test(f)));
  assert.ok(!r.components.some(c => /gap/i.test(c.label)));
});
await check("Redaction removes contact details, names and personal fields before any AI call", () => {
  const text = "Riya Sen\nriya.sen@example.com | +91 98300 12345 | linkedin.com/in/riyasen\nDate of Birth: 14/02/1996\nAddress: 12 Example Road, Durgapur\nRiya maintained books in Tally from 2019 - 2021.";
  const red = redact(text, ["Riya Sen"]);
  for (const leak of ["Riya", "Sen", "riya.sen@", "98300", "linkedin.com", "14/02/1996", "Example Road"]) assert.ok(!red.includes(leak), `leaks ${leak}: ${red}`);
  assert.ok(red.includes("2019 - 2021") && red.includes("Tally"));
});
await check("Title similarity handles seniority and word forms", () => {
  assert.ok(titleSimilarity("Accounts Executive", "Senior Accountant") >= 0.34);
  assert.ok(titleSimilarity("Accounts Executive", "Accounts Executive") === 1);
  assert.ok(titleSimilarity("Accounts Executive", "Field Sales Officer") === 0);
  assert.ok(titleSimilarity("Accounts Executive", "Sales Executive") < 0.3, "shared level words alone are not a match");
});
await check("JD parser: an inline 'Requirements:' line marks must-haves", () => {
  const r = parseJobDescription({ title: "Field Sales Executive", description: "We need a field sales executive.\nRequirements: 3+ years in FMCG field sales, lead generation and cold calling. CRM experience preferred." });
  for (const id of ["field-sales", "fmcg-sales", "lead-generation", "cold-calling"]) assert.ok(r.mustHave.some(s => s.id === id), `${id} must: ${r.mustHave.map(s => s.id)}`);
  assert.ok(r.niceToHave.some(s => s.id === "crm"));
  assert.equal(r.minYears, 3);
});
await check("Edited requirements are validated", () => {
  const edited = sanitiseRequirements({ title: "", mustHave: "Tally, GST, HSN codes", niceToHave: ["SAP", "Tally"], minYears: "3", maxYears: "1", educationLevel: "9", educationFields: "Commerce" }, "Accounts Executive");
  assert.equal(edited.title, "Accounts Executive");
  assert.deepEqual(edited.mustHave.map(s => s.id), ["tally", "gst", "term:hsn codes"]);
  assert.deepEqual(edited.niceToHave.map(s => s.id), ["sap"]);
  assert.equal(edited.minYears, 3); assert.equal(edited.maxYears, null);
  assert.equal(edited.educationLevel, null);
  assert.equal(edited.origin, "edited");
});
await check("Unsupported files are refused", async () => {
  await assert.rejects(analyseCv({ bytes: encode("hello"), fileName: "cv.txt" }), /PDF or DOCX/);
});
const { findSkills } = await lib("taxonomy.ts");
const ids = (text, opts) => findSkills(text, opts).map(f => f.skill.id).sort();
await check("IT skills: frameworks are separate from languages; a CV framework implies its language, a JD does not", () => {
  const jd = parseJobDescription({ title: "Java Developer", description: "Must have Spring Boot, Microservices and Kafka. Good to have Kubernetes and AWS." });
  const must = jd.mustHave.map(x => x.id);
  assert.ok(must.includes("spring-boot") && must.includes("microservices") && must.includes("kafka"), must.join());
  assert.ok(!must.includes("java"), "the JD's Spring Boot does not add a separate Java requirement");
  assert.deepEqual(ids("Built REST services in Java 11 at work"), ["java"], "Java alone is not Spring Boot");
  assert.ok(ids("Developed Spring Boot microservices", { implied: true }).includes("java"), "Spring Boot in a CV also counts as Java");
  assert.ok(ids("ASP.NET Core Web API", { implied: true }).includes("c-sharp") && ids("ASP.NET Core Web API").includes("dotnet"));
  assert.ok(ids("Next.js and Tailwind", { implied: true }).join() === ["css-frameworks", "javascript", "nextjs", "react"].sort().join());
  assert.ok(!ids("Docker").includes("kubernetes") && ids("Kubernetes (EKS)", { implied: true }).includes("docker"));
});
await check("IT skills: everyday words do not create IT skills out of context", () => {
  assert.deepEqual(ids("Processed SWIFT transfers and handled iOS users' complaints in a rust-coloured spring catalogue").filter(x => ["ios", "rust", "spring-boot"].includes(x)), [], "bare ios, rust, spring and swift are ignored in prose");
  assert.ok(ids("iOS, Rust", { allowShortAliases: true }).includes("ios"), "but count in a skills section");
});

console.log(`\n${passed} checks passed.`);
for (const [name, r] of Object.entries(results)) console.log(`${name.padEnd(11)} ${String(r.score).padStart(3)}  ${r.verdictLabel}`);
