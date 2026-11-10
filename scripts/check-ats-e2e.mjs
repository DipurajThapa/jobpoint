// End-to-end check of the owner-only CV screening tool against the local dev
// server (`npm run dev`). Uses fictional CVs, local Miniflare storage only, and
// blocks every browser request that leaves 127.0.0.1 except Google Fonts (icons).
//
// Seeding needs live intake, which the public demo disables. Run it only in a
// local working copy with DEMO_MODE temporarily set to false in lib/demo.ts,
// and never commit that change:
//   node scripts/local-db.mjs --reset && node scripts/local-db.mjs
//   node scripts/check-ats-e2e.mjs [screenshot-dir]
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { buildFixtures } from "./ats-fixtures.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const BASE = process.env.ATS_URL ?? "http://127.0.0.1:5173";
const OUT = resolve(process.argv[2] ?? "test-results/ats");
mkdirSync(OUT, { recursive: true });
let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; console.log("PASS", msg); };
const fx = await buildFixtures();

// Public intake (real route): a CV is now mandatory.
async function apply(fields, file) {
  const form = new FormData();
  for (const [k, v] of Object.entries({ email: `${fields.fullName.split(" ")[0].toLowerCase()}.${Date.now()}@example.com`, phone: "9830012345", location: "Durgapur", experience: "See CV", consent: "yes", adult: "yes", terms: "yes", ...fields })) form.set(k, v);
  if (file) form.set("resume", new File([file.bytes], file.name, { type: file.type }));
  const res = await fetch(`${BASE}/api/applications`, { method: "POST", body: form, headers: { origin: BASE, "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200)}` } });
  return { status: res.status, body: await res.json() };
}
const pdf = (bytes, name) => ({ bytes, name, type: "application/pdf" });
const docx = (bytes, name) => ({ bytes, name, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
const external = url => !url.toString().startsWith(BASE) && !/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url.toString());
await context.route(external, route => route.abort());
const page = await context.newPage();
await page.goto(`${BASE}/signin-with-chatgpt?return_to=/admin`, { waitUntil: "networkidle" });
const owner = (method, path, data) => page.request.fetch(`${BASE}${path}`, { method, data, headers: { origin: BASE } });

// Unauthenticated and cross-site requests are refused.
for (const path of ["/api/admin/ats", "/api/admin/ats/jobs/x", "/api/admin/ats/screenings/x"]) ok((await fetch(BASE + path)).status === 401, `anonymous GET ${path} is refused`);
ok((await fetch(`${BASE}/api/admin/ats/screen`, { method: "POST", headers: { origin: BASE, "content-type": "application/json" }, body: "{}" })).status === 401, "anonymous screening is refused");
ok((await page.request.fetch(`${BASE}/api/admin/ats/screen`, { method: "POST", data: {}, headers: { origin: "https://evil.example" } })).status() === 403, "cross-site screening is refused");

// Seed a role and applications through the real routes.
const job = await (await owner("POST", "/api/admin/jobs", { title: fx.accountsJob.title, location: fx.accountsJob.location, employmentType: "Full-time", workMode: "On-site", sector: "Accounts", description: fx.accountsJob.description, requirements: fx.accountsJob.requirements, status: "published" })).json();
ok(!!job.id, "role created");
const missing = await apply({ fullName: "Nila Bose", jobId: job.id });
if (missing.body.code === "DEMO_READ_ONLY") { console.error("Demo mode is on: set DEMO_MODE = false locally (do not commit) to seed applications."); process.exit(2); }
ok(missing.status === 400 && /attach your CV/i.test(missing.body.error), "application without a CV is rejected");
for (const [name, file] of [["Riya Sen", pdf(fx.accountantPdf, "riya-sen.pdf")], ["Arjun Das", pdf(fx.stuffedPdf, "arjun-das.pdf")], ["Kabir Roy", docx(fx.salesDocx, "kabir-roy.docx")], ["Mou Pal", pdf(fx.scannedPdf, "scan.pdf")]]) {
  const r = await apply({ fullName: name, jobId: job.id }, file);
  ok(r.status === 201, `application with CV accepted: ${name}`);
}
const general = await apply({ fullName: "Tania Ghosh", desiredRole: "Accountant", futureConsent: "yes" }, pdf(fx.accountantPdf, "tania-ghosh.pdf"));
ok(general.status === 201, "general registration with CV accepted");

// UI: screen everyone for the role.
await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /CV screening/ }).click();
await page.getByText("Requirements used for scoring").waitFor();
await page.screenshot({ path: `${OUT}/01-requirements.png`, fullPage: true });
await page.getByRole("button", { name: /Screen 4 not yet screened/ }).click();
await page.getByRole("button", { name: "All screened" }).waitFor({ timeout: 120_000 });
const rows = page.locator(".ats-row:not(.ats-row-head)");
ok(await rows.count() === 4, "four applicants listed");

const names = await rows.evaluateAll(els => els.map(e => e.querySelector("b")?.textContent));
ok(names[0] === "Riya Sen", `ranked first is the matching accountant (${names.join(", ")})`);
ok(await rows.nth(0).getByText("Strong fit").count() === 1, "top candidate is a strong fit");
ok(await page.getByText("Needs review").count() === 1, "scanned CV needs manual review");
await page.screenshot({ path: `${OUT}/02-ranked.png`, fullPage: true });

// Report, review and JSON.
await rows.nth(0).getByRole("button", { name: "Report" }).click();
await page.getByText("SCREENING REPORT").waitFor();
ok(await page.locator(".ats-check.s-met").count() >= 6, "fit-and-gap table shows met requirements");
ok(!(await page.locator(".ats-report").innerText()).includes("14/02/1996"), "date of birth never shown");
await page.getByLabel("I disagree").check();
await page.getByRole("button", { name: "Save review" }).click();
ok(await page.locator(".ats-review textarea:invalid").count() === 1, "disagreeing requires a reason");
await page.locator(".ats-review textarea").fill("Strong on paper; client prefers SAP experience.");
await page.getByRole("button", { name: "Save review" }).click();
await page.getByText("Recorded: you disagree").waitFor();
ok(true, "review with reason recorded");
await page.screenshot({ path: `${OUT}/03-report.png`, fullPage: true });
await page.locator(".ats-json summary").click();
ok((await page.locator(".ats-json pre").innerText()).includes("\"schemaVersion\": \"1.0\""), "structured JSON is shown");

// Edited requirements are saved and mark earlier screenings as out of date.
await page.getByRole("button", { name: /Requirements used for scoring/ }).click().catch(() => {});
const form = page.locator(".ats-req-form");
if (!(await form.count())) await page.getByRole("button", { name: /Requirements used for scoring/ }).click();
await page.locator(".ats-req-form textarea[name=mustHave]").fill("Tally, GST, TDS, SAP");
await page.getByRole("button", { name: "Save requirements" }).click();
await page.getByText("Requirements saved").waitFor();
await page.getByText("Requirements changed since").nth(3).waitFor();
ok(await page.getByText("Requirements changed since").count() === 4, "earlier screenings flagged as out of date");

// General registrations who agreed to other roles can be included.
await page.getByLabel(/general registration/).check();
await page.getByText("General registration", { exact: true }).waitFor();
ok(await rows.count() === 5, "pool candidate included on request");

// One-off check with a pasted client JD (nothing stored).
await page.getByRole("tab", { name: /Check a single CV/ }).click();
await page.locator(".ats-single input[type=file]").setInputFiles({ name: "kabir-roy.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from(fx.salesDocx) });
await page.getByLabel("A job description from the client").check();
await page.locator(".ats-single input[name=title]").fill("Field Sales Executive (FMCG)");
await page.locator(".ats-single input[name=location]").fill("Asansol");
await page.locator(".ats-single textarea[name=description]").fill("We need a field sales executive for FMCG distribution in Asansol.\nRequirements: 3+ years in FMCG field sales, distributor management, lead generation and cold calling. Must achieve monthly sales targets. Graduate. CRM experience preferred. Bengali and Hindi required.");
await page.getByRole("button", { name: "Check CV" }).click();
await page.getByText("SCREENING REPORT · NOT SAVED").waitFor();
ok(await page.locator(".ats-verdict-card.v-strong").count() === 1, "sales CV is a strong fit for a sales JD");
await page.screenshot({ path: `${OUT}/04-single-check.png`, fullPage: true });

// Deleting an application deletes its screenings.
const detail = await (await owner("GET", `/api/admin/ats/jobs/${job.id}`)).json();
const riya = detail.candidates.find(c => c.fullName === "Riya Sen");
const del = await owner("DELETE", `/api/admin/records/applications/${riya.id}`);
ok(del.ok(), "application deleted");
ok((await owner("GET", `/api/admin/ats/screenings/${riya.screeningId}`)).status() === 404, "its screening is deleted too");

// Activity log records screening actions without CV content.
const activity = await (await owner("GET", "/api/admin/privacy-requests")).json();
ok(activity.activity.some(a => a.action === "ats.screened") && activity.activity.some(a => a.action === "ats.reviewed"), "screening actions are in the access history");

const phone = await browser.newContext({ ...require("playwright").devices["iPhone 13"] });
await phone.route(external, route => route.abort());
const mobile = await phone.newPage();
await mobile.goto(`${BASE}/signin-with-chatgpt?return_to=/admin`, { waitUntil: "networkidle" });
await mobile.getByRole("button", { name: /CV screening/ }).click();
await mobile.getByText("Requirements used for scoring").waitFor();
ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "no horizontal scroll on a phone");
await mobile.screenshot({ path: `${OUT}/05-mobile.png`, fullPage: false });
await browser.close();
console.log(`\n${passed} end-to-end checks passed. Screenshots: ${OUT}`);
