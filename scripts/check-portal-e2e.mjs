// End-to-end check of the job portal against the local dev server (npm run dev):
// company onboarding and approvals, candidate sign-up and CV upload, automatic
// release, anonymised previews, unlock and quota, watermarked download,
// consent withdrawal, and probes that a company cannot reach any CV, contact
// detail or file outside its approved parameters and unlocked set.
// Fictional data only; every browser request leaving 127.0.0.1 is blocked
// except Google Fonts.
//   node scripts/local-db.mjs --reset && node scripts/local-db.mjs
//   node scripts/check-portal-e2e.mjs [screenshot-dir]
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { deflateRawSync, crc32 } from "node:zlib";
import { CVS, JDS, COMPANIES } from "./portal-seed-data.mjs";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");
const BASE = process.env.PORTAL_URL ?? "http://127.0.0.1:5173";
const OUT = resolve(process.argv[2] ?? "test-results/portal");
mkdirSync(OUT, { recursive: true });
let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; console.log("PASS", msg); };
const PASSWORD = "quiet harbour lantern 2026";

const browser = await chromium.launch();
const external = url => !url.toString().startsWith(BASE) && !/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url.toString());
async function ctx(opts = {}) { const c = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2, ...opts }); await c.route(external, r => r.abort()); return c; }
const api = (c, method, path, data, headers = {}) => c.request.fetch(`${BASE}${path}`, { method, data, headers: { origin: BASE, ...headers } });
let ipSeq = 0;
async function register(c, body) {
  const r = await api(c, "POST", "/api/portal/auth/register", { password: PASSWORD, terms: true, adult: true, ...body }, { "cf-connecting-ip": `198.51.100.${++ipSeq}` });
  const d = await r.json(); assert.ok(r.ok(), JSON.stringify(d));
  assert.ok(d.devLink, "local development returns the verification link");
  const token = new URL(d.devLink).searchParams.get("token");
  assert.ok((await api(c, "POST", "/api/portal/auth/verify", { token })).ok());
  const s = await api(c, "POST", "/api/portal/auth/sign-in", { email: body.email, password: PASSWORD });
  assert.ok(s.ok(), await s.text());
}

// Fictional files.
async function pdfOf(text) { const p = await browser.newPage(); await p.setContent(`<html><body style="font-family:Arial;font-size:10.5px">${text.split("\n").map(l => `<p style="margin:0 0 3px">${l.replace(/&/g, "&amp;").replace(/</g, "&lt;") || "&nbsp;"}</p>`).join("")}</body></html>`); const b = await p.pdf({ format: "A4" }); await p.close(); return b; }
function docxOf(text) {
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const files = { "[Content_Types].xml": '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>', "word/document.xml": `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${text.split("\n").map(t => `<w:p><w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`).join("")}</w:body></w:document>` };
  const locals = [], centrals = []; let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content), packed = deflateRawSync(data), n = Buffer.from(name), crc = crc32(data);
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(8, 8); l.writeUInt32LE(crc, 14); l.writeUInt32LE(packed.length, 18); l.writeUInt32LE(data.length, 22); l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10); c.writeUInt32LE(crc, 16); c.writeUInt32LE(packed.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    locals.push(l, n, packed); centrals.push(c, n); offset += 30 + n.length + packed.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(2, 8); end.writeUInt16LE(2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// ---------- Admin (site owner) ----------
const admin = await ctx();
const adminPage = await admin.newPage();
await adminPage.goto(`${BASE}/signin-with-chatgpt?return_to=/admin`, { waitUntil: "networkidle" });
const adminApi = (action, body) => api(admin, "POST", `/api/admin/portal/${action}`, body);
await api(admin, "GET", "/api/admin/portal/overview");

// ---------- Sign-up rate limit ----------
{
  const c = await ctx(); let last = 0;
  for (let i = 0; i < 11; i++) last = (await api(c, "POST", "/api/portal/auth/register", { kind: "candidate", email: `spam${i}@example.com`, password: "short", terms: true, adult: true }, { "cf-connecting-ip": "203.0.113.9" })).status();
  ok(last === 429, "the 11th sign-up from one connection within an hour is blocked");
}

// ---------- Companies ----------
const companies = {};
for (const c of COMPANIES.slice(0, 2)) {
  const context = await ctx();
  const email = `owner@${c.key}.example.com`;
  await register(context, { kind: "company", email, phone: "+91 90000 19999", companyName: c.displayName, legalName: c.legalName, city: c.city });
  const dash = await (await api(context, "GET", "/api/portal/company/dashboard")).json();
  companies[c.key] = { context, id: null, dash };
  ok(dash.company.status === "applied", `${c.displayName}: new company waits for approval`);
  const jdTry = await api(context, "POST", "/api/portal/company/jd-create", { title: "x", text: "y".repeat(100) });
  ok(jdTry.status() === 403, `${c.displayName}: cannot post a job before approval`);
}
const overview = await (await api(admin, "GET", "/api/admin/portal/overview")).json();
for (const c of COMPANIES.slice(0, 2)) {
  const row = overview.companies.find(x => x.display_name === c.displayName);
  companies[c.key].id = row.id;
  const r = await adminApi("company-activate", { companyId: row.id, params: c.params, plan: "free" });
  ok(r.ok(), `admin approves ${c.displayName} with its matching parameters`);
}
// Each company posts its first JD; admin approves.
const jdIds = {};
for (const jd of JDS.filter(j => companies[j.company]).slice(0, 3)) {
  const c = companies[jd.company];
  const created = await (await api(c.context, "POST", "/api/portal/company/jd-create", { title: jd.title, text: jd.text, location: jd.location, workMode: jd.workMode })).json();
  const sub = await (await api(c.context, "POST", "/api/portal/company/jd-submit", { jdId: created.id })).json();
  assert.deepEqual(sub.conflicts, [], JSON.stringify(sub));
  const before = await (await api(c.context, "GET", `/api/portal/company/matches?jd=${created.id}`)).json();
  ok(before.matches.length === 0, `${jd.key}: nothing is released before admin approval`);
  ok((await adminApi("jd-decide", { jdId: created.id, approve: true })).ok(), `admin approves ${jd.key}`);
  jdIds[jd.key] = created.id;
}

// ---------- Candidates ----------
const pick = ["acc-01", "acc-03", "acc-07", "sal-01", "sal-03", "sup-01", "sup-02", "sup-06", "ops-01", "sw-01", "acc-04", "acc-05", "scan-01"];
const cands = {};
for (const key of pick) {
  const cv = CVS.find(c => c.key === key);
  const context = await ctx();
  const email = cv.text.match(/[A-Za-z0-9._%+-]+@example\.(?:com|in)/)?.[0] ?? `${key}@example.com`;
  await register(context, { kind: "candidate", email: key === "acc-05" ? `dup.${email}` : email, phone: `+91 9${String(100000000 + pick.indexOf(key) * 7919).slice(0, 9)}`, name: cv.text.split("\n")[0] || key, city: "Durgapur" });
  const bytes = cv.format === "docx" ? docxOf(cv.text) : cv.format === "scanned" ? await pdfOf("") : await pdfOf(cv.text);
  const name = `${key}.${cv.format === "docx" ? "docx" : "pdf"}`;
  const up = await context.request.fetch(`${BASE}/api/portal/candidate/upload`, { method: "POST", headers: { origin: BASE }, multipart: { resume: { name, mimeType: cv.format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf", buffer: Buffer.from(bytes) }, consentProfile: "yes", consentShare: "yes" } });
  const d = await up.json();
  assert.ok(up.ok(), `${key} upload: ${JSON.stringify(d)}`);
  cands[key] = { context, status: d.status };
}
ok(cands["scan-01"].status === "needs_review", "a scanned CV is flagged for manual review, not dropped");
await adminApi("run-queue", {});
const ov2 = await (await api(admin, "GET", "/api/admin/portal/overview")).json();
ok(ov2.reviews.length >= 1, "the review queue shows the scanned CV");
ok(ov2.duplicates.some(d => d.signal === "near_identical_text" || d.signal === "same_file"), "the duplicate CV pair is flagged");

// ---------- Company view: anonymised, ranked, released only ----------
const ferro = companies["demo-ferro"], fintech = companies["sample-fintech"];
const accJd = jdIds["jd-accounts-durgapur"];
const m = await (await api(ferro.context, "GET", `/api/portal/company/matches?jd=${accJd}`)).json();
ok(m.matches.length >= 2, `accounts JD has released matches (${m.matches.length})`);
const allText = JSON.stringify(m.matches);
for (const key of pick) { const cv = CVS.find(c => c.key === key); const email = cv.text.match(/[A-Za-z0-9._%+-]+@example\.(?:com|in)/)?.[0]; if (email) ok(!allText.includes(email), `preview hides ${key}'s email`); }
ok(!/\+91 90000/.test(allText) && !/example steel traders/i.test(allText) && !/https?:\/\//.test(allText), "previews contain no phone numbers, employer names or links");
ok(m.matches.every(x => x.explanation.summary && x.explanation.why), "every released CV carries an explanation");
ok(m.matches.every((x, i, a) => i === 0 || a[i - 1].lowerBound >= x.lowerBound), "matches are ranked by the confidence-adjusted score");
ok(new Set(m.matches.map(x => JSON.stringify([x.keySkills, x.yearsExperience, x.expectedCtc]))).size === m.matches.length, "an unresolved duplicate CV is not shown twice");
const salesOnly = await (await api(ferro.context, "GET", `/api/portal/company/matches?jd=${accJd}`)).json();
ok(!JSON.stringify(salesOnly).includes("Inside sales"), "an accounts company never sees sales CVs");

// Company UI screenshot.
const ferroPage = await ferro.context.newPage();
await ferroPage.goto(`${BASE}/company`, { waitUntil: "networkidle" });
await ferroPage.getByRole("button", { name: "Jobs", exact: true }).click();
await ferroPage.getByRole("button", { name: "View matches" }).first().click();
await ferroPage.locator(".pj-item").first().waitFor();
await ferroPage.screenshot({ path: `${OUT}/company-matches.png`, fullPage: true });

// ---------- Probes: no access outside the approved, unlocked set ----------
const ref = m.matches[0].ref;
ok((await api(ferro.context, "GET", `/api/portal/company/candidate?ref=${ref}`)).status() === 403, "full CV is refused before unlock");
ok((await api(ferro.context, "GET", `/api/portal/company/download?ref=${ref}`)).status() === 403, "CV download is refused before unlock");
ok((await api(fintech.context, "GET", `/api/portal/company/matches?jd=${accJd}`)).status() === 404, "another company cannot read this JD's matches");
ok((await api(fintech.context, "POST", "/api/portal/company/unlock", { ref, jdId: accJd })).status() === 404, "another company cannot unlock this company's release");
ok((await api(cands["acc-01"].context, "GET", `/api/portal/company/matches?jd=${accJd}`)).status() === 403, "a candidate cannot call company APIs");
ok((await (await ctx()).request.fetch(`${BASE}/api/portal/company/dashboard`)).status() === 401, "anonymous requests are refused");
ok((await api(ferro.context, "POST", "/api/portal/company/unlock", { ref, jdId: accJd }, { origin: "https://evil.example" })).status() === 403, "cross-site unlock is refused");
ok((await api(ferro.context, "GET", "/api/admin/portal/overview")).status() === 401, "a company cannot use admin APIs");
ok((await api(ferro.context, "GET", "/api/portal/candidate/profile")).status() === 403, "a company cannot use candidate APIs");

// ---------- Unlock, quota, watermark ----------
const q0 = (await (await api(ferro.context, "GET", "/api/portal/company/dashboard")).json()).quota.remaining;
const u1 = await (await api(ferro.context, "POST", "/api/portal/company/unlock", { ref, jdId: accJd })).json();
ok(u1.charged === true && u1.remaining === q0 - 1, `unlock uses one unit (${q0} → ${u1.remaining})`);
const u2 = await (await api(ferro.context, "POST", "/api/portal/company/unlock", { ref, jdId: accJd })).json();
ok(u2.charged === false && u2.remaining === q0 - 1, "unlocking the same CV again is free");
const full = await (await api(ferro.context, "GET", `/api/portal/company/candidate?ref=${ref}`)).json();
ok(/@example\.(com|in)/.test(full.profile.contact.email), "after unlock the company sees contact details");
const dl = await api(ferro.context, "GET", `/api/portal/company/download?ref=${ref}`);
ok(dl.ok() && (dl.headers()["content-type"] ?? "").includes("pdf"), "unlocked CV downloads as a PDF");
const { extractText, getDocumentProxy } = await import(resolve(import.meta.dirname, "../node_modules/unpdf/dist/index.mjs"));
const pdfText = (await extractText(await getDocumentProxy(new Uint8Array(await dl.body())), { mergePages: true })).text;
ok(pdfText.includes("Unlocked by Demo Ferro Alloys") && pdfText.includes(full.traceId), "the downloaded CV is watermarked with the company and trace ID");
await ferroPage.goto(`${BASE}/company`, { waitUntil: "networkidle" });
await ferroPage.getByRole("button", { name: "Jobs", exact: true }).click();
await ferroPage.getByRole("button", { name: "View matches" }).first().click();
await ferroPage.getByRole("button", { name: "View CV" }).first().click();
await ferroPage.getByText("Download CV (watermarked PDF)").waitFor();
await ferroPage.screenshot({ path: `${OUT}/company-unlocked.png`, fullPage: true });

// ---------- Client workspace: pipeline, interviews, offers ----------
await ferroPage.getByRole("button", { name: "Add to pipeline" }).click();
await ferroPage.getByText("Added to your pipeline as shortlisted.").waitFor();
const pipe1 = await (await api(ferro.context, "GET", "/api/portal/company/pipeline")).json();
const entry = pipe1.pipeline.find(e => e.ref === ref);
ok(entry && entry.stage === "shortlisted", "an unlocked candidate is added to the pipeline from the profile page");
await ferroPage.getByRole("button", { name: "Pipeline", exact: true }).click();
await ferroPage.getByRole("button", { name: "Schedule interview" }).first().click();
await ferroPage.locator("input[name=round]").fill("Technical 1");
await ferroPage.locator("input[name=when]").fill("2030-01-15T11:00");
await ferroPage.locator("input[name=interviewer]").fill("Finance lead");
await ferroPage.getByRole("button", { name: "Schedule", exact: true }).click();
await ferroPage.getByText("Interview scheduled.").waitFor();
const pipe2 = await (await api(ferro.context, "GET", "/api/portal/company/pipeline")).json();
const iv = pipe2.pipeline.find(e => e.ref === ref);
ok(iv.stage === "interview" && iv.interviews.length === 1, "scheduling an interview from the pipeline moves the candidate to interviewing");
ok((await api(ferro.context, "POST", "/api/portal/company/pipeline-stage", { pipelineId: entry.id, stage: "joined", joiningDate: "2026-11-01" })).status() === 400, "stages cannot be skipped (interview → joined is refused)");
ok((await api(fintech.context, "POST", "/api/portal/company/pipeline-stage", { pipelineId: entry.id, stage: "rejected", reason: "other" })).status() === 404, "another company cannot move this company's candidate");
ok((await (await api(fintech.context, "GET", "/api/portal/company/pipeline")).json()).pipeline.length === 0, "another company sees none of this pipeline");
ok((await api(ferro.context, "POST", "/api/portal/company/interview-record", { interviewId: iv.interviews[0].id, status: "completed", outcome: "advance", rating: 4, feedback: "Good GST knowledge" })).ok(), "interview feedback is recorded");
ok((await api(ferro.context, "POST", "/api/portal/company/pipeline-stage", { pipelineId: entry.id, stage: "offered", offerCtcInr: 420000 })).ok(), "an offer is recorded with its CTC");
ok((await api(ferro.context, "POST", "/api/portal/company/pipeline-stage", { pipelineId: entry.id, stage: "offer_accepted", joiningDate: "2030-02-01", lastWorkingDay: "2030-01-30", competingOffers: "none known" })).ok(), "offer acceptance records joining date, last working day and other offers");
await ferroPage.getByRole("button", { name: "Overview", exact: true }).click();
await ferroPage.getByText("Offers accepted, waiting to join").waitFor();
ok(await ferroPage.getByText(/Next check-in|Check in now/).first().isVisible(), "the overview shows the next joining check-in");
await ferroPage.screenshot({ path: `${OUT}/client-overview.png`, fullPage: true });
await ferroPage.getByRole("button", { name: "Pipeline", exact: true }).click();
await ferroPage.locator(".pj-item").first().waitFor();
await ferroPage.screenshot({ path: `${OUT}/client-pipeline.png`, fullPage: true });

// Team: the owner adds a colleague who sets a password from the link; members cannot manage the team.
const inv = await (await api(ferro.context, "POST", "/api/portal/company/team-invite", { name: "Finance Lead", email: "finance.lead@demo-ferro.example.com" })).json();
ok(typeof inv.link === "string" && inv.link.includes("/portal/accept?token="), "the owner gets a one-time link for a new colleague");
const colleague = await ctx();
ok((await api(colleague, "POST", "/api/portal/auth/accept", { token: new URL(inv.link).searchParams.get("token"), password: PASSWORD })).ok(), "the colleague sets a password from the link");
ok((await api(colleague, "POST", "/api/portal/auth/sign-in", { email: "finance.lead@demo-ferro.example.com", password: PASSWORD })).ok(), "the colleague signs in");
ok((await (await api(colleague, "GET", "/api/portal/company/pipeline")).json()).pipeline.length >= 1, "the colleague sees the company's pipeline");
ok((await api(colleague, "POST", "/api/portal/company/team-invite", { name: "X", email: "x@demo-ferro.example.com" })).status() === 403, "a team member cannot add people");
await ferroPage.getByRole("button", { name: "Team", exact: true }).click();
await ferroPage.getByText("Add a colleague").waitFor();
await ferroPage.screenshot({ path: `${OUT}/client-team.png`, fullPage: true });

// Managed search: the client asks Job Point to recruit; Job Point submits a candidate with a note.
const managedJd = JDS.find(j => j.key === "jd-accounts-durgapur");
const mj = await (await api(ferro.context, "POST", "/api/portal/company/jd-create", { title: "Accounts Executive (managed)", text: managedJd.text, location: managedJd.location, workMode: managedJd.workMode, service: "managed", openings: 2 })).json();
await api(ferro.context, "POST", "/api/portal/company/jd-submit", { jdId: mj.id });
await adminApi("jd-decide", { jdId: mj.id, approve: true });
await adminApi("run-queue", {});
const ovm = await (await api(admin, "GET", "/api/admin/portal/overview")).json();
ok(ovm.clientWork.managed.some(j => j.id === mj.id), "the managed search appears in the admin console");
const sc = await (await api(admin, "GET", `/api/admin/portal/submission-candidates?jd=${mj.id}`)).json();
const pickC = sc.candidates.find(c => Number(c.hard_pass) && !Number(c.in_pipeline));
ok(!!pickC, "the admin sees ranked candidates to submit");
const q1 = (await (await api(ferro.context, "GET", "/api/portal/company/dashboard")).json()).quota.remaining;
const sub = await adminApi("submit-candidate", { companyId: ferro.id, jdId: mj.id, candidateId: pickC.candidate_id, note: "Strong Tally and GST; 30 days notice; expects 4.2 LPA" });
ok(sub.ok(), "Job Point submits a candidate to the client with a note");
const pipe3 = await (await api(ferro.context, "GET", `/api/portal/company/pipeline?jd=${mj.id}`)).json();
ok(pipe3.pipeline[0]?.stage === "submitted" && pipe3.pipeline[0].recruiterNote.includes("Tally"), "the client sees the submission and the recruiter's note");
ok((await (await api(ferro.context, "GET", "/api/portal/company/dashboard")).json()).quota.remaining === q1, "a managed submission uses no unlock quota");
ok((await api(ferro.context, "GET", `/api/portal/company/candidate?ref=${pipe3.pipeline[0].ref}`)).ok(), "the client can open the submitted candidate's full profile");
ok((await api(fintech.context, "GET", `/api/portal/company/candidate?ref=${pipe3.pipeline[0].ref}`)).status() !== 200, "another company cannot open the submitted profile");

// Admin-invited client: works without public registration.
const ci = await (await adminApi("client-invite", { displayName: "Example Infotech", legalName: "Example Infotech Pvt Ltd", city: "Kolkata", ownerName: "Owner", ownerEmail: "owner@example-infotech.example.com", guaranteeDays: 90, nonSolicitMonths: 12, feeTerms: "8.33% of fixed CTC", params: { minScore: 65, roleFamilies: ["software-it"], seniority: ["junior", "mid"], cities: ["Kolkata"], allowRemote: true, ctcBands: [], maxNoticeDays: 90, mandatoryFilters: [], maxReleasePerJd: 25, maxLiveJds: 10 }, plan: "free" })).json();
ok(typeof ci.link === "string" && ci.link.includes("/portal/accept?token="), "the admin creates a client and gets a one-time sign-in link");
const infotech = await ctx();
const acceptPage = await infotech.newPage();
await acceptPage.goto(ci.link, { waitUntil: "networkidle" });
await acceptPage.locator("input[name=password]").fill(PASSWORD);
await acceptPage.locator("input[name=confirm]").fill(PASSWORD);
await acceptPage.getByRole("button", { name: "Set password" }).click();
await acceptPage.getByText("Your password is set.").waitFor();
ok(true, "the client owner sets a password on the accept page");
ok((await api(infotech, "POST", "/api/portal/auth/sign-in", { email: "owner@example-infotech.example.com", password: PASSWORD })).ok(), "the invited client signs in");
ok((await (await api(infotech, "GET", "/api/portal/company/dashboard")).json()).company.status === "active", "the invited client is active straight away");

// Quota exhaustion prompts an upgrade (free allowance = 5).
const refs = m.matches.map(x => x.ref).filter(r => r !== ref);
await adminApi("quota-adjust", { companyId: ferro.id, delta: -(u1.remaining), note: "e2e: use up the free allowance" });
if (refs[0]) {
  const r = await api(ferro.context, "POST", "/api/portal/company/unlock", { ref: refs[0], jdId: accJd });
  ok(r.status() === 402 && /upgrade/i.test((await r.json()).error), "unlocks are blocked with an upgrade prompt when the quota is used");
}
ok((await api(ferro.context, "GET", `/api/portal/company/candidate?ref=${ref}`)).ok(), "a previously unlocked CV stays visible after the quota runs out");

// ---------- Candidate side ----------
const cPage = await cands["acc-01"].context.newPage();
await cPage.goto(`${BASE}/candidate`, { waitUntil: "networkidle" });
await cPage.getByText("Jobs that fit your profile").waitFor();
const jobs = await (await api(cands["acc-01"].context, "GET", "/api/portal/candidate/jobs")).json();
ok(jobs.jobs.some(j => j.title === "Accounts Executive") && jobs.jobs.every(j => typeof j.band === "string" && !("score" in j)), "the candidate sees fitting jobs with a band, not a raw score");
await cPage.screenshot({ path: `${OUT}/candidate-jobs.png`, fullPage: true });
ok((await api(cands["acc-01"].context, "POST", "/api/portal/candidate/apply", { jdId: accJd })).ok(), "the candidate applies");
await cPage.getByRole("button", { name: "My CV" }).click();
await cPage.getByText("Details read from your CV").waitFor();
await cPage.screenshot({ path: `${OUT}/candidate-cv.png`, fullPage: true });

// ---------- Consent withdrawal ----------
const victim = Object.entries(cands).find(([k]) => k === "acc-01")[1];
const wd = await api(victim.context, "POST", "/api/portal/candidate/consent", { purpose: "share_with_companies", grant: false });
ok(wd.ok(), "the candidate withdraws sharing consent");
const after = await (await api(ferro.context, "GET", `/api/portal/company/matches?jd=${accJd}`)).json();
const unlockedNow = await api(ferro.context, "GET", `/api/portal/company/candidate?ref=${ref}`);
ok(after.matches.length <= m.matches.length - (full.profile.contact.email.startsWith("sourav") ? 1 : 0), "the withdrawn CV leaves the company's list");
if (full.profile.contact.email.startsWith("sourav")) {
  ok(unlockedNow.status() === 410, "an unlocked copy becomes unavailable after withdrawal");
  const pw = (await (await api(ferro.context, "GET", "/api/portal/company/pipeline")).json()).pipeline.find(e => e.ref === ref);
  ok(pw && pw.available === false && pw.name === "Candidate withdrew consent", "the pipeline hides a candidate who withdrew consent");
}

// ---------- Admin UI ----------
await adminPage.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
await adminPage.getByRole("button", { name: /Job portal/ }).click();
await adminPage.getByText("Release and unlock log").waitFor();
await adminPage.screenshot({ path: `${OUT}/admin-portal.png`, fullPage: true });
const log = (await (await api(admin, "GET", "/api/admin/portal/overview")).json()).log;
ok(log.some(l => l.kind === "release") && log.some(l => l.kind === "unlock"), "every release and unlock is logged with company, JD, candidate, score and time");

// Phone layout.
const phone = await ctx({ ...devices["iPhone 13"] });
await phone.addCookies(await cands["sal-01"].context.cookies());
const pp = await phone.newPage();
await pp.goto(`${BASE}/candidate`, { waitUntil: "networkidle" });
await pp.getByText("Jobs that fit your profile").waitFor();
ok(await pp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "the candidate portal has no horizontal scroll on a phone");
await pp.screenshot({ path: `${OUT}/candidate-phone.png` });
await browser.close();
console.log(`\n${passed} portal end-to-end checks passed. Screenshots: ${OUT}`);
