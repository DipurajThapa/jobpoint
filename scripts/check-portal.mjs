// Portal Phase 1 checks: runs the real domain modules against the real
// migrations (SQLite via a D1-compatible adapter). No network, no dev server.
//   node scripts/check-portal.mjs
import assert from "node:assert/strict";
import { register } from "node:module";
import { resolve } from "node:path";
import { createD1 } from "./lib/d1-sqlite.mjs";

register("data:text/javascript," + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (/^\\.\\.?\\//.test(specifier) && !/\\.[cm]?[jt]s$/.test(specifier) && context.parentURL?.endsWith(".ts")) return next(specifier + ".ts", context);
  return next(specifier, context);
}`));

const root = resolve(import.meta.dirname, "..");
const mod = name => import(resolve(root, "lib/portal", name));
const dbm = await mod("db.ts");
const india = await mod("india.ts");
const consent = await mod("consent.ts");
const company = await mod("company.ts");
const preview = await mod("preview.ts");
const candidate = await mod("candidate.ts");
const access = await mod("access.ts");
const accounts = await mod("accounts.ts");
const profileMod = await mod("profile.ts");
const match = await mod("match.ts");
const jdMod = await mod("jd.ts");
const queue = await mod("queue.ts");
const client = await mod("client.ts");
const website = await mod("website.ts");
const staffMod = await mod("staff.ts");
const notify = await mod("notify.ts");
const views = await mod("views.ts");
const policy = await mod("policy.ts");
const adaptive = await mod("adaptive.ts");
const commitment = await mod("commitment.ts");
const pilot = await mod("pilot.ts");

const SECRET = "test-secret-test-secret-test-secret-123";
let clock = new Date("2026-11-09T06:00:00Z");
dbm.setClock(() => clock);

let passed = 0;
export const sections = [];
const check = async (name, fn) => { await fn(); passed++; console.log("PASS", name); };
const rejects = (promise, code) => assert.rejects(promise, e => e.code === code || assert.fail(`expected ${code}, got ${e.code}: ${e.message}`));

// ---------- helpers ----------
const ACCOUNTS_JD = { title: "Accounts Executive", location: "Durgapur, West Bengal", text: "We are hiring an Accounts Executive in Durgapur.\nRequirements: B.Com with 2-5 years of experience. Must have Tally, GST returns and TDS. Good knowledge of MS Excel. SAP is an advantage.\nCTC: 3-4.5 LPA. Notice period: up to 30 days." };
const PARAMS = { minScore: 70, roleFamilies: ["accounts-finance"], seniority: ["junior", "mid"], cities: ["Durgapur", "Asansol"], ctcBands: [{ minInr: 200000, maxInr: 600000 }], maxNoticeDays: 60, maxReleasePerJd: 5, maxLiveJds: 5 };

async function setup() {
  return createD1(root);
}
async function makeCompany(db, name = "Example Steel Works") {
  const acc = await accounts.createAccount(db, "company_user", `hr${Math.random().toString(36).slice(2, 7)}@example.com`, "harbour lantern 4471 quiet");
  const id = await company.applyCompany(db, { accountId: acc, legalName: `${name} Pvt Ltd`, displayName: name, city: "Durgapur" });
  return { id, userId: acc };
}
function fakeProfile(over = {}) {
  return {
    schemaVersion: "1.0", source: { method: "rules", model: null, fileName: "cv.pdf", fileType: "pdf", textCharacters: 3000, pages: 1, sha256: "x", extractedAt: clock.toISOString(), engineVersion: "t" },
    contact: { name: "Riya Sen", email: "riya.sen@example.com", phone: "+91 98300 12345", location: "Durgapur", links: ["linkedin.com/in/riyasen"] },
    headline: "Accounts Executive", summary: "", totalExperienceMonths: 54, statedExperienceYears: 4, work: [{ title: "Accounts Executive", employer: "Example Steel Traders Pvt Ltd", location: "Durgapur", start: "2022-05", end: null, current: true, months: 54, highlights: ["Tally and GST"] }],
    education: [{ qualification: "B.Com", level: 4, field: "Commerce", institution: "Example University", year: 2021 }],
    skills: [{ id: "tally", name: "Tally", family: "accounting-software", evidence: "work", months: 54, lastUsedYear: 2026, snippet: "Tally at Example Steel Traders Pvt Ltd" }, { id: "gst", name: "GST", family: "indirect-tax", evidence: "work", months: 54, lastUsedYear: 2026, snippet: "GST" }],
    certifications: [], languages: ["English"], noticePeriod: "30 days", currentCtc: "", expectedCtc: "", gaps: [], excludedPersonalFields: [], parse: { confidence: 0.9, sectionsFound: ["experience"], warnings: [] },
    india: { ctcCurrentInr: 360000, ctcExpectedInr: 420000, noticeDays: 30, currentCity: "Durgapur", preferredCities: [], willingToRelocate: false, seniority: "mid", yearsExperience: 4.5, roleFamily: "accounts-finance" },
    selfReported: [], ...over,
  };
}
async function makeCandidate(db, name, { consentShare = true, profile } = {}) {
  const id = await candidate.createCandidate(db, { accountId: null, displayName: name, email: `${name.replace(/\s/g, ".").toLowerCase()}@example.com`, phone: "" });
  await consent.recordConsent(db, id, "profile_processing", "granted");
  if (consentShare) await consent.recordConsent(db, id, "share_with_companies", "granted");
  await candidate.addCv(db, id, { r2Key: `cv/${id}`, fileName: "cv.pdf", fileType: "pdf", size: 1000, sha256: id, text: `${name} unique text ${id}`, profile: profile ?? fakeProfile({ contact: { ...fakeProfile().contact, name } }), parseOk: true });
  return id;
}
async function liveJd(db, comp) {
  await company.activateCompany(db, comp.id, PARAMS, "admin");
  const { id } = await company.createJd(db, comp.id, comp.userId, ACCOUNTS_JD);
  await company.submitJd(db, comp.id, id, comp.userId);
  await company.decideJd(db, id, true, "admin");
  return id;
}

// ---------- Indian field parsing ----------
await check("INR CTC formats parse to rupees per year", () => {
  assert.equal(india.parseCtcInr("4.5 LPA"), 450000);
  assert.equal(india.parseCtcInr("Rs. 35,000 per month"), 420000);
  assert.equal(india.parseCtcInr("₹4,50,000 p.a."), 450000);
  assert.equal(india.parseCtcInr("18 lakhs"), 1800000);
  assert.equal(india.parseCtcInr("12 LPA fixed + 2 LPA variable"), 1400000);
  assert.deepEqual(india.parseCtcRange("₹25,000–35,000 per month"), { min: 300000, max: 420000 });
  assert.deepEqual(india.parseCtcRange("up to 6 lakh per annum"), { min: null, max: 600000 });
});
await check("Notice periods parse to days", () => {
  const now = new Date("2026-11-09T00:00:00Z");
  assert.equal(india.parseNoticeDays("Immediate joiner", now), 0);
  assert.equal(india.parseNoticeDays("Notice period: 2 months", now), 60);
  assert.equal(india.parseNoticeDays("Serving notice, LWD 15 Dec", now), 36);
});
await check("Seniority bands and city normalisation", () => {
  assert.equal(india.seniorityFor(0.5), "fresher");
  assert.equal(india.seniorityFor(6, "Accounts Manager"), "lead");
  assert.deepEqual(india.citiesIn("Calcutta / Bangalore / Burdwan"), ["Kolkata", "Bengaluru", "Bardhaman"]);
});

// ---------- Approval gates ----------
await check("A JD that conflicts with approved parameters cannot be approved", async () => {
  const db = await setup();
  const comp = await makeCompany(db);
  await company.activateCompany(db, comp.id, PARAMS, "admin");
  const { id } = await company.createJd(db, comp.id, comp.userId, { title: "Senior Java Developer", location: "Bengaluru", text: "Senior Java developer in Bengaluru with 8+ years. Must have Java, Spring Boot, SQL and AWS. CTC 25-30 LPA. Notice up to 90 days." });
  const { conflicts } = await company.submitJd(db, comp.id, id, comp.userId);
  assert.ok(conflicts.length >= 3, conflicts.join(" | "));
  await rejects(company.decideJd(db, id, true, "admin"), "CONFLICTS");
  await rejects(company.decideJd(db, id, false, "admin", ""), "REASON_REQUIRED");
  await company.decideJd(db, id, false, "admin", "Outside approved roles and cities.");
});
await check("Parameter change requests apply only after admin approval; non-fitting live JDs are paused", async () => {
  const db = await setup();
  const comp = await makeCompany(db);
  const jd = await liveJd(db, comp);
  const reqId = await company.requestParamChange(db, comp.id, { ...PARAMS, minScore: 50, cities: ["Kolkata"] }, comp.userId);
  await rejects(company.requestParamChange(db, comp.id, PARAMS, comp.userId), "REQUEST_OPEN");
  assert.equal((await company.currentParams(db, comp.id)).params.minScore, 70, "unchanged before approval");
  const { paused } = await company.decideParamRequest(db, reqId, true, "admin", "ok");
  assert.equal((await company.currentParams(db, comp.id)).params.minScore, 50);
  assert.deepEqual(paused, [jd], "Durgapur JD no longer fits Kolkata-only parameters");
  assert.equal((await db.prepare("SELECT status FROM jds WHERE id = ?").bind(jd).first()).status, "paused");
});

// ---------- Releases ----------

// ---------- Unlocks and quota ----------

// ---------- Consent withdrawal ----------

// ---------- Preview redaction ----------
await check("Previews contain no name, contacts, employers, institutions or links", () => {
  const p = fakeProfile();
  p.work[0].title = "Accounts Executive at Example Steel Traders Pvt Ltd";
  const prev = preview.buildPreview(p, "c_abc", 88, { summary: "Riya Sen meets Tally at Example Steel Traders Pvt Ltd; call +91 98300 12345 or riya.sen@example.com", meets: ["Tally"], misses: [], why: "see linkedin.com/in/riyasen" });
  const text = JSON.stringify(prev);
  for (const leak of ["Riya", "Sen", "98300", "riya.sen", "example.com", "Example Steel", "Example University", "linkedin"]) assert.ok(!text.includes(leak), `preview leaks ${leak}: ${text}`);
  assert.equal(prev.title, "Accounts Executive");
  assert.deepEqual(prev.keySkills, ["Tally", "GST"]);
  assert.equal(prev.expectedCtc, "₹4–5 LPA");
});

// ---------- Duplicates and review ----------
await check("Duplicate accounts and CVs are flagged; merging never double-charges", async () => {
  const db = await setup();
  const a = await candidate.createCandidate(db, { accountId: null, displayName: "Kabir Roy", email: "Kabir.Roy+jobs@gmail.com", phone: "+91 70012 34567" });
  const b = await candidate.createCandidate(db, { accountId: null, displayName: "Kabir R", email: "kabirroy@gmail.com", phone: "" });
  const flags = await db.prepare("SELECT kind, signal FROM duplicate_flags").all();
  assert.ok(flags.results.some(f => f.kind === "account" && f.signal === "same_email"), JSON.stringify(flags.results));
  const text = "Kabir Roy senior sales executive example foods asansol managed retailers distributors achieved targets ".repeat(8);
  await candidate.addCv(db, a, { r2Key: "a", fileName: "a.pdf", fileType: "pdf", size: 1, sha256: "same", text, profile: fakeProfile(), parseOk: true });
  await candidate.addCv(db, b, { r2Key: "b", fileName: "b.pdf", fileType: "pdf", size: 1, sha256: "same", text, profile: fakeProfile(), parseOk: true });
  assert.ok((await db.prepare("SELECT 1 FROM duplicate_flags WHERE kind = 'cv' AND signal = 'same_file'").first()));
  await candidate.mergeCandidates(db, a, b, "admin");
  assert.equal((await db.prepare("SELECT status FROM candidates WHERE id = ?").bind(b).first()).status, "merged");
  const cvText = "Senior Sales Executive at Example Foods Asansol since March 2020. Manage forty retailers and three distributors across the Asansol territory and plan weekly beat routes. Achieved one hundred and twelve percent of monthly sales targets through lead generation and cold calling. Report daily secondary sales in Excel and the company CRM. Earlier worked as Sales Executive with Sample Consumer Goods handling general trade dealers and collections. Education BBA from Example University in 2018. Languages English Hindi Bengali. Notice period thirty days and expected CTC four lakh per annum.";
  assert.ok(candidate.similarity(candidate.minhash(cvText), candidate.minhash(cvText.replace("four lakh", "four point two lakh"))) >= 0.8);
  assert.ok(candidate.similarity(candidate.minhash(text), candidate.minhash("Asha Paul accounts executive tally gst durgapur five years bank reconciliation vendor payments ".repeat(8))) < 0.2);
});

// ---------- Corrections cannot buy rank ----------
await check("Candidate-added skills count only as listed; parsed version is kept", () => {
  const p = fakeProfile();
  const { profile, changed } = profileMod.applyCorrection(p, { addSkills: ["SAP FICO", "Tally"], ctcExpectedInr: 500000, noticeDays: 15 }, "CV text without that ERP");
  const sap = profile.skills.find(s => s.id === "sap-fico");
  assert.equal(sap.evidence, "listed");
  assert.ok(changed.includes("ctcExpectedInr") && changed.includes("noticeDays") && changed.includes("skill+:sap-fico"));
  assert.ok(!changed.includes("skill+:tally"), "existing skills are not duplicated");
  assert.equal(p.skills.length, 2, "original profile untouched");
});

// ---------- Rate limits and accounts ----------
await check("Browsing beyond the hourly limit is blocked and flagged", async () => {
  const db = await setup();
  let blocked = false;
  for (let i = 0; i < 125 && !blocked; i++) blocked = !(await access.guard(db, { userId: "u1", companyId: "c1", action: "list", jdId: "j" }));
  assert.ok(blocked);
  assert.ok(await db.prepare("SELECT 1 FROM abuse_flags WHERE subject_id = 'u1' AND rule = 'rate:list'").first());
});
await check("Accounts: verification required, sessions resolve to the right company", async () => {
  const db = await setup();
  const comp = await makeCompany(db);
  const email = (await db.prepare("SELECT email FROM portal_accounts WHERE id = ?").bind(comp.userId).first()).email;
  await rejects(accounts.signIn(db, email, "harbour lantern 4471 quiet", "test"), "UNVERIFIED");
  const token = await accounts.issuePortalToken(db, comp.userId, "verify", 24);
  await accounts.redeemToken(db, token, "verify");
  await rejects(accounts.redeemToken(db, token, "verify"), "INVALID_LINK");
  await rejects(accounts.signIn(db, email, "wrong password here", "test"), "BAD_CREDENTIALS");
  const session = await accounts.signIn(db, email, "harbour lantern 4471 quiet", "test");
  const acct = await accounts.accountFromToken(db, session);
  assert.equal(acct.companyId, comp.id); assert.equal(acct.companyRole, "owner"); assert.equal(acct.companyStatus, "applied");
});


// ---------- Matching engine ----------
const REQ = () => jdMod.parsePortalJd(ACCOUNTS_JD);
const fullProfile = (over = {}) => fakeProfile({ skills: [...fakeProfile().skills, { id: "tds", name: "TDS", family: "direct-tax", evidence: "work", months: 40, lastUsedYear: 2026, snippet: "" }, { id: "excel", name: "MS Excel", family: "office", evidence: "work", months: 40, lastUsedYear: 2026, snippet: "" }], ...over });
await check("JD-specific weights are bounded, sum to 100 and change with the JD", () => {
  const r1 = match.deriveWeights(REQ());
  const total = Object.values(r1.weights).reduce((a, b) => a + b, 0);
  assert.equal(total, 100);
  const entry = jdMod.parsePortalJd({ title: "Accounts Trainee", location: "Durgapur", text: "Freshers welcome. B.Com 0-1 years. Must have Tally and MS Excel. CTC 1.8-2.4 LPA." });
  const senior = jdMod.parsePortalJd({ title: "Finance Manager", location: "Kolkata", text: "10+ years in finance. Must have SAP FICO, budgeting, financial reporting, audit and team leadership. CA preferred. CTC 18-24 LPA." });
  const we = match.deriveWeights(entry).weights, ws = match.deriveWeights(senior).weights;
  assert.ok(we.education > ws.education && ws.experience > we.experience, `entry ${JSON.stringify(we)} senior ${JSON.stringify(ws)}`);
  const withTest = match.deriveWeights(REQ(), { attached: true, coverage: 1, reliability: 0.85 }).weights;
  assert.ok(withTest.assessment >= 15 && withTest.assessment <= 40 && Object.values(withTest).reduce((a, b) => a + b, 0) === 100);
  for (const [k, v] of Object.entries(withTest)) assert.ok(v >= 0 && v <= 50, `${k}=${v}`);
});
await check("Scores and lower bounds stay in 0..100; the explanation is always present", () => {
  const r = match.scoreMatch(fakeProfile(), REQ(), PARAMS);
  assert.ok(r.score >= 0 && r.score <= 100 && r.lowerBound <= r.score && r.lowerBound >= -1);
  assert.ok(r.explanation.summary.length > 20 && r.explanation.why.length > 10);
  const empty = match.scoreMatch(fakeProfile({ skills: [], work: [], education: [] }), REQ(), PARAMS);
  assert.ok(empty.score >= 0 && empty.explanation.misses.length > 0);
});
await check("Hard filters: city or relocation, experience, mandatory skills, notice, CTC", () => {
  const req = REQ();
  assert.equal(match.scoreMatch(fullProfile(), req, PARAMS).hardPass, true, JSON.stringify(match.hardFilters(fullProfile(), req, PARAMS)));
  const elsewhere = fullProfile(); elsewhere.india = { ...elsewhere.india, currentCity: "Pune", willingToRelocate: false };
  assert.ok(match.hardFilters(elsewhere, req, PARAMS).some(f => f.startsWith("Location")));
  elsewhere.india.willingToRelocate = true;
  assert.ok(!match.hardFilters(elsewhere, req, PARAMS).some(f => f.startsWith("Location")), "relocation passes");
  const junior = fullProfile(); junior.india = { ...junior.india, yearsExperience: 1 };
  assert.ok(match.hardFilters(junior, req, PARAMS).some(f => f.startsWith("Experience")));
  const noTds = fullProfile({ skills: fullProfile().skills.filter(s => s.id !== "tally") });
  // Not found in the CV is a question for the recruiter, not a failure, unless the client chose the strict setting.
  assert.ok(!match.hardFilters(noTds, req, PARAMS).some(f => f.includes("Tally")), "a skill not found does not fail the candidate by default");
  assert.ok(match.screen(noTds, req, PARAMS).questions.some(q => q.includes("Tally")), "it becomes a question");
  assert.equal(match.scoreMatch(noTds, req, PARAMS).hardPass, true);
  const strictParams = { ...PARAMS, mandatoryFilters: ["strict_mandatory_skills"] };
  assert.ok(match.hardFilters(noTds, req, strictParams).some(f => f.includes("Tally")), "the strict setting fails it");
  assert.equal(match.scoreMatch(noTds, req, strictParams).hardPass, false);
  // A CV without dates cannot show how many years: a question, not a failure.
  const undated = fullProfile(); undated.work = undated.work.map(w => ({ ...w, start: null, end: null })); undated.india = { ...undated.india, yearsExperience: 0.5 };
  assert.ok(!match.hardFilters(undated, req, PARAMS).some(f => f.startsWith("Experience")) && match.screen(undated, req, PARAMS).questions.some(q => q.startsWith("Experience")), "undated experience is a question");
  // The two level checks only advise.
  const senior = fullProfile(); senior.india = { ...senior.india, yearsExperience: 15, seniority: "lead" };
  assert.ok(!match.hardFilters(senior, req, PARAMS).some(f => f.startsWith("Seniority") || f.startsWith("Level")) && match.screen(senior, req, PARAMS).questions.some(q => q.startsWith("Level")), "level is advisory");
  const late = fullProfile(); late.india = { ...late.india, noticeDays: 90 };
  assert.ok(match.hardFilters(late, req, PARAMS).some(f => f.startsWith("Notice")));
  const pricey = fullProfile(); pricey.india = { ...pricey.india, ctcExpectedInr: 900000 };
  assert.ok(match.hardFilters(pricey, req, PARAMS).some(f => f.startsWith("Expected CTC")));
});
await check("Experience far above the stated maximum eases the score; a career break costs little", () => {
  const req = REQ(); req.maxYears = 5;
  const comp = (p, key) => match.scoreMatch(p, req, PARAMS).components.find(c => c.key === key);
  const inRange = fakeProfile(); inRange.india = { ...inRange.india, yearsExperience: 4.5 };
  const veteran = fakeProfile(); veteran.india = { ...veteran.india, yearsExperience: 15 };
  assert.ok(comp(veteran, "experience").mean < comp(inRange, "experience").mean, "15 years does not beat 4.5 on a 2-to-5-year job");
  assert.ok(comp(veteran, "experience").mean >= 0.6 * comp(inRange, "experience").mean - 1e-9, "but the easing is gradual and stops at 60%");
  assert.ok(match.scoreMatch(veteran, req, PARAMS).questions.some(q => q.includes("well above")), "the recruiter is told");
  const onBreak = fakeProfile(); onBreak.work = onBreak.work.map(w => ({ ...w, current: false, start: "2012-01", end: "2018-06", months: 78 }));
  assert.ok(comp(onBreak, "recency").mean >= 0.6 - 1e-9, `a long break costs at most 40% of a small part (got ${comp(onBreak, "recency").mean})`);
});
await check("Name, gender, age, religion, caste, marital status and photo cannot change a score", () => {
  const base = match.scoreMatch(fakeProfile(), REQ(), PARAMS);
  const other = fakeProfile({ contact: { name: "Mohammad Imran Sheikh", email: "imran@example.com", phone: "+91 90000 11111", location: "Durgapur", links: [] }, excludedPersonalFields: ["gender", "religion", "date of birth", "caste or category", "marital status"] });
  const r = match.scoreMatch(other, REQ(), PARAMS);
  assert.equal(r.score, base.score); assert.equal(r.lowerBound, base.lowerBound);
});
await check("Order of skills and work entries does not change the score", () => {
  const p = fakeProfile(); const q = fakeProfile({ skills: [...fakeProfile().skills].reverse() });
  assert.equal(match.scoreMatch(p, REQ(), PARAMS).score, match.scoreMatch(q, REQ(), PARAMS).score);
});
await check("Missing assessments: non-takers stay validly ranked; verified takers win ties; scores move monotonically", () => {
  const req = REQ();
  const p = fakeProfile({ skills: [...fakeProfile().skills, { id: "tds", name: "TDS", family: "direct-tax", evidence: "work", months: 40, lastUsedYear: 2026, snippet: "" }, { id: "excel", name: "MS Excel", family: "office", evidence: "work", months: 40, lastUsedYear: 2026, snippet: "" }] });
  const none = match.scoreMatch(p, req, PARAMS);
  const good = match.scoreMatch(p, req, PARAMS, { skillScores: { tally: { y: 1, e: 0.08, label: "Tally test" }, gst: { y: 1, e: 0.08, label: "GST test" } } });
  const bad = match.scoreMatch(p, req, PARAMS, { skillScores: { tally: { y: 0.3, e: 0.08, label: "Tally test" }, gst: { y: 0.3, e: 0.08, label: "GST test" } } });
  assert.ok(none.score > 60, `non-taker still scores ${none.score}`);
  assert.ok(good.sd < none.sd, "tests narrow the range");
  assert.ok(good.lowerBound > none.lowerBound, "a verified taker beats an equal non-taker on the lower bound");
  assert.ok(bad.score < none.score, "a poor test result lowers the score");
  let prev = -1;
  for (const y of [0, 0.25, 0.5, 0.75, 1]) { const s = match.scoreMatch(p, req, PARAMS, { skillScores: { tally: { y, e: 0.08, label: "t" } } }).score; assert.ok(s >= prev, "monotonic in the test score"); prev = s; }
  const near = match.scoreMatch(p, req, { ...PARAMS, minScore: Math.round(none.score - 1) });
  assert.equal(near.nearThreshold, none.lowerBound < Math.round(none.score - 1));
});
await check("Keyword stuffing and listed-only skills are capped", () => {
  const listed = fakeProfile({ skills: ["tally", "gst", "tds", "excel"].map(id => ({ id, name: id.toUpperCase(), family: "accounting-software", evidence: "listed", months: 0, lastUsedYear: null, snippet: "" })), work: [{ title: "Customer Support Associate", employer: "Example BPO", location: "Kolkata", start: "2022-01", end: null, current: true, months: 58, highlights: ["Inbound calls"] }] });
  const stuffed = fakeProfile({ skills: [...listed.skills, ...Array.from({ length: 60 }, (_, i) => ({ id: `term:skill ${i}`, name: `Skill ${i}`, family: "term", evidence: "listed", months: 0, lastUsedYear: null, snippet: "" }))], work: listed.work });
  const genuine = match.scoreMatch(fakeProfile(), REQ(), PARAMS).score;
  const l = match.scoreMatch(listed, REQ(), PARAMS).score, st = match.scoreMatch(stuffed, REQ(), PARAMS).score;
  assert.ok(l < genuine - 20, `listed-only ${l} vs genuine ${genuine}`);
  assert.ok(st <= l, `stuffing more keywords never helps (${st} vs ${l})`);
});
await check("The same candidate ranks differently for different JDs", () => {
  const sales = jdMod.parsePortalJd({ title: "Inside Sales Executive", location: "Durgapur", text: "Must have inside sales, lead generation, cold calling and CRM. 1-3 years. CTC 2.4-3.6 LPA." });
  const a = match.scoreMatch(fakeProfile(), REQ(), PARAMS).score, b = match.scoreMatch(fakeProfile(), sales, null).score;
  assert.ok(a - b > 30, `accounts ${a} vs sales ${b}`);
});
await check("Overlapping job dates add no experience", () => {
  const twice = fakeProfile({ work: [fakeProfile().work[0], { ...fakeProfile().work[0], title: "Accountant", employer: "Second Example Ltd" }] });
  const one = match.scoreMatch(fakeProfile(), REQ(), PARAMS).components.find(c => c.key === "experience").detail;
  const two = match.scoreMatch(twice, REQ(), PARAMS).components.find(c => c.key === "experience").detail;
  assert.equal(one.split(" relevant")[0], two.split(" relevant")[0]);
});
await check("Explanations never contain employer names, institutions or contacts", () => {
  const r = match.scoreMatch(fakeProfile(), REQ(), PARAMS);
  const text = JSON.stringify(r.explanation);
  for (const leak of ["Example Steel", "Example University", "riya", "98300"]) assert.ok(!text.includes(leak), `${leak} in ${text}`);
});

// ---------- Assessments ----------
await check("Queue scores every live JD and shows nothing to the client by itself", async () => {
  const db = await setup();
  const comp = await makeCompany(db);
  const jd = await liveJd(db, comp);
  const good = await makeCandidate(db, "Good Match", { profile: fakeProfile({ skills: [...fakeProfile().skills, { id: "tds", name: "TDS", family: "direct-tax", evidence: "work", months: 40, lastUsedYear: 2026, snippet: "" }, { id: "excel", name: "MS Excel", family: "office", evidence: "work", months: 40, lastUsedYear: 2026, snippet: "" }, { id: "lang-bengali", name: "Bengali", family: "language", evidence: "listed", months: 0, lastUsedYear: null, snippet: "" }, { id: "lang-english", name: "English", family: "language", evidence: "listed", months: 0, lastUsedYear: null, snippet: "" }] }) });
  const poor = await makeCandidate(db, "Poor Match", { profile: fakeProfile({ skills: [{ id: "cold-calling", name: "Cold calling", family: "sales", evidence: "work", months: 30, lastUsedYear: 2026, snippet: "" }], india: { ...fakeProfile().india, roleFamily: "sales-bd" } }) });
  let out; do { out = await queue.drainQueue(db, SECRET); } while (out.remaining > 0);
  const rows = (await db.prepare("SELECT candidate_id, score, lower_bound, hard_pass, explanation FROM matches WHERE jd_id = ?").bind(jd).all()).results;
  assert.equal(rows.length, 2);
  for (const r of rows) assert.ok(JSON.parse(r.explanation).summary, "every score has an explanation");
  const by = Object.fromEntries(rows.map(r => [r.candidate_id, r]));
  assert.ok(by[good].lower_bound > by[poor].lower_bound && by[good].hard_pass === 1, JSON.stringify(rows.map(r => [r.candidate_id === good ? "good" : "poor", r.score, r.lower_bound, r.hard_pass])));
  // Scoring alone releases nobody: a recruiter submits.
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM releases").first()).n, 0);
});


// ---------- Future services data model ----------

// ---------- client workspace ----------
const INVITE = { displayName: "Example Infotech", legalName: "Example Infotech Pvt Ltd", city: "Kolkata", ownerEmail: "owner@example-infotech.test", ownerName: "Owner", guaranteeDays: 90, nonSolicitMonths: 12, feeTerms: "8.33% of fixed CTC", params: PARAMS, plan: "free" };


await check("Team: owner adds and removes colleagues; the owner cannot be removed", async () => {
  const db = await setup();
  const out = await client.inviteClient(db, INVITE, "admin");
  const m = await client.inviteMember(db, out.companyId, out.accountId, "dev.lead@example-infotech.test", "Dev Lead");
  await accounts.redeemToken(db, m.token, "invite", "silver harbour 2231 kettle");
  const acc = await accounts.accountFromToken(db, await accounts.signIn(db, "dev.lead@example-infotech.test", "silver harbour 2231 kettle", "t"));
  assert.deepEqual([acc.companyId, acc.companyRole], [out.companyId, "recruiter"]);
  assert.equal((await client.teamList(db, out.companyId)).length, 2);
  await rejects(client.removeMember(db, out.companyId, m.accountId, out.accountId), "OWNER");
  await rejects(client.removeMember(db, out.companyId, out.accountId, out.accountId), "SELF");
  await client.removeMember(db, out.companyId, out.accountId, m.accountId);
  await rejects(accounts.signIn(db, "dev.lead@example-infotech.test", "silver harbour 2231 kettle", "t"), "BAD_CREDENTIALS");
  assert.equal((await client.teamList(db, out.companyId)).length, 1);
  const other = await client.inviteClient(db, { ...INVITE, ownerEmail: "o2@example.test" }, "admin");
  await rejects(client.removeMember(db, other.companyId, other.accountId, out.accountId), "NOT_FOUND");
});







// ---------- one candidate list (website + portal) ----------
const { buildFixtures } = await import("./ats-fixtures.mjs");
const { accountantPdf } = await buildFixtures();
const WEB = (over = {}) => ({ id: `app-${Math.random().toString(36).slice(2, 9)}`, jobId: null, fullName: "Riya Sen", email: "riya.sen@example.com", phone: "+91 98300 12345", location: "Durgapur", shareConsent: true, futureConsent: true, privacyVersion: "2026-11-09", resumeName: "riya-sen.pdf", ...over });
const consentRows = (db, id) => db.prepare("SELECT purpose, action, channel, notice_version FROM candidate_consents WHERE candidate_id = ? ORDER BY rowid").bind(id).all().then(r => r.results);

await check("Website registration with both ticks joins the candidate list: CV read, matched, submittable by a recruiter, never auto-released", async () => {
  const db = await setup();
  const comp = await makeCompany(db); const jd = await liveJd(db, comp);
  await client.setJdOpenings(db, comp.id, jd, 1, comp.userId);
  const out = await website.linkWebsiteApplication(db, null, WEB(), accountantPdf);
  assert.deepEqual([out.created, out.cv, out.matching, out.recruiterSharing], [true, "parsed", true, true]);
  const rows = await consentRows(db, out.candidateId);
  assert.deepEqual(rows.map(r => [r.purpose, r.action, r.channel, r.notice_version]), [["profile_processing", "granted", "website", "website-2026-11-09"], ["recruiter_sharing", "granted", "website", "website-2026-11-09"]], "recorded against the website wording");
  await queue.drainQueue(db, SECRET);
  const m = await db.prepare("SELECT score, hard_pass FROM matches WHERE jd_id = ? AND candidate_id = ?").bind(jd, out.candidateId).first();
  assert.ok(m && m.score > 50, `website applicant matched (${m?.score})`);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM releases WHERE candidate_id = ?").bind(out.candidateId).first()).n, 0, "no automatic anonymous release without portal sharing consent");
  const sub = await client.submitByRecruiter(db, SECRET, { companyId: comp.id, jdId: jd, candidateId: out.candidateId, note: "Website applicant; Tally and GST" }, "admin");
  assert.ok(sub.ref.startsWith("c_"));
  const list = await client.submissionCandidates(db, jd);
  assert.deepEqual([list[0].source, Number(list[0].can_share)], ["website", 1]);
});

await check("Job-specific website application: in the list, but not matched or shared beyond that role", async () => {
  const db = await setup();
  const comp = await makeCompany(db); const jd = await liveJd(db, comp);
  await client.setJdOpenings(db, comp.id, jd, 1, comp.userId);
  const out = await website.linkWebsiteApplication(db, null, WEB({ jobId: "legacy-role-1", futureConsent: false, shareConsent: true }), accountantPdf);
  assert.deepEqual([out.cv, out.matching, out.recruiterSharing], ["parsed", false, false], "the role-specific sharing tick is not general sharing");
  await queue.drainQueue(db, SECRET);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM matches WHERE candidate_id = ?").bind(out.candidateId).first()).n, 0, "not matched to other jobs");
  await rejects(client.submitByRecruiter(db, SECRET, { companyId: comp.id, jdId: jd, candidateId: out.candidateId, note: "x" }, "admin"), "NO_CONSENT");
  assert.equal((await db.prepare("SELECT status FROM candidates WHERE id = ?").bind(out.candidateId).first()).status, "active", "still one record in the list");
});

await check("The same person applying twice is one record; a portal account with that email is never taken over", async () => {
  const db = await setup();
  const a = await website.linkWebsiteApplication(db, null, WEB({ email: "same.person@example.com" }), null);
  const b = await website.linkWebsiteApplication(db, null, WEB({ email: "Same.Person@example.com", futureConsent: false }), null);
  assert.deepEqual([b.candidateId, b.created], [a.candidateId, false]);
  assert.equal(b.matching, true, "an unticked box later is not a withdrawal");
  assert.equal((await website.linkWebsiteApplication(db, null, WEB({ id: "fixed-id", email: "same.person@example.com" }), null)).candidateId, a.candidateId);
  assert.equal((await website.linkWebsiteApplication(db, null, WEB({ id: "fixed-id", email: "same.person@example.com" }), null)).created, false, "linking the same application again is a no-op");
  const acc = await accounts.createAccount(db, "candidate", "owner.of.account@example.com", "harbour lantern 4471 quiet");
  const portalId = await candidate.createCandidate(db, { accountId: acc, displayName: "Account Holder", email: "owner.of.account@example.com", phone: "" });
  const w = await website.linkWebsiteApplication(db, null, WEB({ email: "owner.of.account@example.com" }), null);
  assert.notEqual(w.candidateId, portalId, "website data never lands in someone's portal account");
  const flag = await db.prepare("SELECT signal FROM duplicate_flags WHERE (a_id = ? AND b_id = ?) OR (a_id = ? AND b_id = ?)").bind(portalId, w.candidateId, w.candidateId, portalId).first();
  assert.equal(flag?.signal, "same_email", "flagged for the admin to merge");
});

await check("Console withdrawal and deletion of a website application reach the candidate list", async () => {
  const db = await setup();
  const app = WEB({ email: "withdraw.me@example.com" });
  const out = await website.linkWebsiteApplication(db, null, app, accountantPdf);
  await website.withdrawWebsiteConsents(db, app.id, "admin");
  assert.deepEqual([await consent.consentActive(db, out.candidateId, "profile_processing"), await consent.consentActive(db, out.candidateId, "recruiter_sharing")], [false, false]);
  const second = WEB({ email: "withdraw.me@example.com" });
  await website.linkWebsiteApplication(db, null, second, null);
  assert.deepEqual((await website.unlinkWebsiteApplication(db, app.id, "admin")).r2Keys, [], "another application still links the person");
  assert.equal((await db.prepare("SELECT status FROM candidates WHERE id = ?").bind(out.candidateId).first()).status, "active");
  const gone = await website.unlinkWebsiteApplication(db, second.id, "admin");
  assert.equal(gone.r2Keys.length, 1, "the CV copy is returned for deletion");
  const stub = await db.prepare("SELECT status, display_name FROM candidates WHERE id = ?").bind(out.candidateId).first();
  assert.deepEqual([stub.status, stub.display_name], ["deleted", ""], "last link gone: candidate record erased");
});

await check("Earlier website applications can be added to the list in batches", async () => {
  const db = await setup();
  for (const [i, future] of [[1, 1], [2, 0]]) await db.prepare("INSERT INTO applications (id, job_id, full_name, email, phone, location, experience, consent, share_consent, future_consent, privacy_version) VALUES (?, NULL, ?, ?, '+91 90000 0000' || ?, 'Kolkata', '3 years', 1, 1, ?, '2026-11-09')")
    .bind(`old-${i}`, `Old Applicant ${i}`, `old${i}@example.com`, i, future).run();
  assert.equal(await website.countUnlinkedWebsiteApplications(db), 2);
  for (const { app } of await website.unlinkedWebsiteApplications(db)) await website.linkWebsiteApplication(db, null, app, null, "admin");
  assert.equal(await website.countUnlinkedWebsiteApplications(db), 0);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM candidate_sources").first()).n, 2);
});

// ---------- Jobboard300 staff roles and assignment ----------
async function staffSetup() {
  const db = await setup();
  const user = async (id, role = "member") => { await db.prepare("INSERT INTO platform_users (id, email, name, role, status) VALUES (?, ?, ?, ?, 'active')").bind(id, `${id}@jobboard300.test`, id, role).run(); return { id, admin: role === "admin" }; };
  const team = async (id, members) => { await db.prepare("INSERT INTO platform_teams (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").bind(id, id, clock.toISOString(), clock.toISOString()).run(); for (const m of members) await db.prepare("INSERT INTO platform_team_members (team_id, user_id) VALUES (?, ?)").bind(id, m.id).run(); };
  const admin = await user("admin1", "admin"), mgrK = await user("mgr-kolkata"), recA = await user("rec-a"), recB = await user("rec-b"), mgrF = await user("mgr-franchise"), recF = await user("rec-f");
  await team("kolkata", [mgrK, recA, recB]); await team("franchise", [mgrF, recF]);
  await staffMod.setTeamManager(db, admin, "kolkata", mgrK.id, true); await staffMod.setTeamManager(db, admin, "franchise", mgrF.id, true);
  const compK = await makeCompany(db, "Kolkata Client"); const jdK = await liveJd(db, compK);
  const compF = await makeCompany(db, "Franchise Client"); const jdF = await liveJd(db, compF);
  await staffMod.assignClientTeam(db, admin, compK.id, "kolkata"); await staffMod.assignClientTeam(db, admin, compF.id, "franchise");
  return { db, admin, mgrK, recA, recB, mgrF, recF, compK, jdK, compF, jdF };
}
const ids = rows => rows.map(r => r.id).sort();
const rank = (db, jdId, candidateId, score = 80) => db.prepare("INSERT OR REPLACE INTO matches (jd_id, candidate_id, cv_id, profile_version, score, lower_bound, hard_pass, explanation, engine_version, scored_at) VALUES (?, ?, 'cv', 1, ?, ?, 1, ?, 'test', ?)").bind(jdId, candidateId, score, score - 5, JSON.stringify({ summary: "Fits the role" }), clock.toISOString()).run();
// Recruiters can submit only a candidate currently on their shortlist, so tests rank the candidate at the top first.
const rankedSubmit = async (t, staff, input) => { await rank(t.db, input.jdId, input.candidateId, 99); return staffMod.staffSubmit(t.db, SECRET, staff, input); };

await check("Staff see only their team's clients and jobs; admin sees all", async () => {
  const t = await staffSetup();
  const a = await staffMod.staffWork(t.db, t.admin);
  assert.deepEqual([a.role, a.clients.length, a.jobs.length], ["admin", 2, 2]);
  const m = await staffMod.staffWork(t.db, t.mgrK);
  assert.deepEqual([m.role, ids(m.clients), ids(m.jobs)], ["manager", [t.compK.id], [t.jdK]]);
  assert.ok(m.members.every(x => x.team_id === "kolkata"), "a manager sees only their own team's members");
  const r = await staffMod.staffWork(t.db, t.recF);
  assert.deepEqual([r.role, ids(r.clients), ids(r.jobs), r.members.length], ["recruiter", [t.compF.id], [t.jdF], 0]);
  await rejects(staffMod.jobForStaff(t.db, t.recF, t.jdK), "NOT_FOUND");
  await rejects(staffMod.staffCandidates(t.db, t.recA, t.jdF), "NOT_FOUND");
  await rejects(staffMod.staffPipeline(t.db, t.mgrF, t.jdK), "NOT_FOUND");
  const nobody = { id: "no-team", admin: false };
  assert.deepEqual([(await staffMod.staffWork(t.db, nobody)).clients.length, (await staffMod.staffWork(t.db, nobody)).jobs.length], [0, 0], "no team, nothing visible");
});

await check("Assignment: admin assigns clients; a manager assigns jobs only within their own team", async () => {
  const t = await staffSetup();
  await rejects(staffMod.assignClientTeam(t.db, t.mgrK, t.compF.id, "kolkata"), "ADMIN_ONLY");
  await rejects(staffMod.setTeamManager(t.db, t.mgrK, "kolkata", t.recA.id, true), "ADMIN_ONLY");
  await staffMod.assignJobRecruiter(t.db, t.mgrK, t.jdK, t.recA.id);
  await rejects(staffMod.assignJobRecruiter(t.db, t.mgrK, t.jdK, t.recF.id), "NOT_IN_TEAM");
  await rejects(staffMod.assignJobRecruiter(t.db, t.mgrK, t.jdF, t.recA.id), "NOT_FOUND");
  await rejects(staffMod.assignJobRecruiter(t.db, t.recA, t.jdK, t.recA.id), "MANAGER_ONLY");
  assert.deepEqual(ids((await staffMod.staffWork(t.db, t.recA)).jobs), [t.jdK], "the assigned recruiter sees the job");
  assert.deepEqual(ids((await staffMod.staffWork(t.db, t.recB)).jobs), [], "a teammate does not see a job assigned to someone else");
  assert.deepEqual(ids((await staffMod.staffWork(t.db, t.recB)).clients), [t.compK.id], "but still sees the team's client");
  await rejects(staffMod.staffPipeline(t.db, t.recB, t.jdK), "NOT_FOUND");
  await staffMod.assignClientTeam(t.db, t.admin, t.compK.id, "franchise");
  assert.equal((await t.db.prepare("SELECT recruiter_id FROM jds WHERE id = ?").bind(t.jdK).first()).recruiter_id, null, "moving a client to another team clears outside assignments");
  assert.deepEqual(ids((await staffMod.staffWork(t.db, t.mgrK)).clients), [], "the old team no longer sees the client");
});

await check("A recruiter can submit, update stages and schedule interviews only for work in scope", async () => {
  const t = await staffSetup();
  await client.setJdOpenings(t.db, t.compK.id, t.jdK, 1, t.compK.userId);
  const cand = await makeCandidate(t.db, "Scoped Candidate");
  await rejects(staffMod.staffSubmit(t.db, SECRET, t.recF, { jdId: t.jdK, candidateId: cand, note: "x" }), "NOT_FOUND");
  const sub = await rankedSubmit(t, t.recA, { jdId: t.jdK, candidateId: cand, note: "Good Tally and GST" });
  await rejects(staffMod.staffMoveStage(t.db, t.recF, sub.id, { stage: "shortlisted" }), "NOT_FOUND");
  await rejects(staffMod.staffScheduleInterview(t.db, t.mgrF, sub.id, { round: "HR", scheduledAt: "2026-11-20T05:30:00Z", mode: "phone" }), "NOT_FOUND");
  await staffMod.staffMoveStage(t.db, t.recA, sub.id, { stage: "shortlisted", note: "Client asked to proceed" });
  await staffMod.staffScheduleInterview(t.db, t.recA, sub.id, { round: "Technical 1", scheduledAt: "2026-11-20T05:30:00Z", mode: "video" });
  const row = (await staffMod.staffPipeline(t.db, t.mgrK, t.jdK))[0];
  assert.deepEqual([row.stage, row.interviews.length], ["interview", 1]);
  const actors = (await t.db.prepare("SELECT actor FROM pipeline_events WHERE pipeline_id = ? ORDER BY rowid").bind(sub.id).all()).results.map(r => r.actor);
  assert.ok(actors.includes(`staff:${t.recA.id}`), "history records which staff member acted");
  assert.equal((await client.pipelineView(t.db, t.compK.id))[0].stage, "interview", "the client sees the same pipeline");
});

// ---------- notifications ----------
const kinds = async (db, id) => (await notify.candidateInbox(db, id)).map(m => m.kind).reverse();

await check("Each hiring event writes exactly one inbox message for the right candidate, with the outcome only", async () => {
  const t = await staffSetup();
  await client.setJdOpenings(t.db, t.compK.id, t.jdK, 1, t.compK.userId);
  const cand = await makeCandidate(t.db, "Inbox Candidate"), other = await makeCandidate(t.db, "Other Candidate");
  const sub = await rankedSubmit(t, t.recA, { jdId: t.jdK, candidateId: cand, note: "Private recruiter note: salary flexible" });
  await staffMod.staffMoveStage(t.db, t.recA, sub.id, { stage: "shortlisted" });
  const iv = await staffMod.staffScheduleInterview(t.db, t.recA, sub.id, { round: "Technical 1", scheduledAt: "2026-11-20T05:30:00Z", mode: "video", location: "https://meet.example/x" });
  await client.recordInterview(t.db, t.compK.id, t.compK.userId, iv.id, { status: "completed", outcome: "reject", rating: 2, feedback: "Weak on reconciliation" });
  await client.moveStage(t.db, t.compK.id, t.compK.userId, sub.id, { stage: "rejected", reason: "skills_gap", note: "Internal: not strong enough" });
  assert.deepEqual(await kinds(t.db, cand), ["stage.submitted", "stage.shortlisted", "interview.scheduled", "stage.rejected"]);
  assert.equal((await notify.candidateInbox(t.db, other)).length, 0, "nobody else is told");
  const text = JSON.stringify(await notify.candidateInbox(t.db, cand));
  for (const secret of ["Private recruiter note", "Weak on reconciliation", "Internal: not strong", "skills_gap", "rating"]) assert.ok(!text.includes(secret), `inbox never carries ${secret}`);
  assert.ok(text.includes("11:00") && text.includes("https://meet.example/x"), "the interview message gives India time and the link");
  const notices = (await notify.companyNotices(t.db, t.compK.id)).map(n => n.kind).reverse();
  assert.deepEqual([...notices].sort(), ["interview.scheduled", "job.approved", "stage.shortlisted", "submission"], "the client is told about staff updates, not about its own");
  assert.equal((await notify.companyNotices(t.db, t.compF.id)).filter(n => n.kind !== "job.approved").length, 0);
  await notify.markInboxRead(t.db, cand);
  assert.ok((await notify.candidateInbox(t.db, cand)).every(m => m.read_at));
});

await check("CV intake and applications message the candidate, naming what is missing", async () => {
  const db = await setup();
  const cand = await candidate.createCandidate(db, { accountId: null, displayName: "Riya Sen", email: "riya.inbox@example.com", phone: "" });
  const ingest = await mod("ingest.ts");
  await ingest.ingestCv(db, null, cand, { bytes: accountantPdf, fileName: "riya-sen.pdf" });
  const first = (await notify.candidateInbox(db, cand))[0];
  assert.ok(["cv.received", "cv.incomplete"].includes(first.kind));
  if (first.kind === "cv.incomplete") assert.match(first.body, /expected CTC|notice period|current city/);
  const comp = await makeCompany(db); const jd = await liveJd(db, comp);
  await consent.recordConsent(db, cand, "share_with_companies", "granted");
  await candidate.applyToJd(db, cand, jd);
  assert.equal((await kinds(db, cand)).at(-1), "application.received");
});

await check("WhatsApp sender: the client's team number first, admin as fallback, admin override wins; nothing is queued without the candidate's consent or sent without a provider", async () => {
  const t = await staffSetup();
  const cand = await makeCandidate(t.db, "Queue Candidate");
  const last = async () => t.db.prepare("SELECT sender_scope, status, status_detail FROM messages WHERE channel = 'whatsapp' ORDER BY rowid DESC LIMIT 1").first();
  await notify.notifyCandidate(t.db, cand, "test", "T", "B", t.compK.id);
  assert.deepEqual([(await last()).status, (await last()).sender_scope], ["skipped", ""], "no number configured: recorded, not sent");
  await rejects(staffMod.setStaffMessaging(t.db, t.mgrK, "admin", { number: "+919830012345", enabled: true }), "ADMIN_ONLY");
  await rejects(staffMod.setStaffMessaging(t.db, t.mgrK, "team:franchise", { number: "+919830012345", enabled: true }), "NOT_FOUND");
  await rejects(staffMod.setStaffMessaging(t.db, t.recA, "team:kolkata", { number: "+919830012345", enabled: true }), "NOT_FOUND");
  await rejects(staffMod.setStaffMessaging(t.db, t.mgrK, "team:kolkata", { number: "12", enabled: true }), "NUMBER");
  await staffMod.setStaffMessaging(t.db, t.admin, "admin", { number: "+91 90000 00001", enabled: true });
  assert.equal((await notify.resolveSender(t.db, t.compK.id)).scope, "admin", "admin number is the fallback");
  await staffMod.setStaffMessaging(t.db, t.mgrK, "team:kolkata", { number: "+91 98300 12345", enabled: true });
  assert.deepEqual(await notify.resolveSender(t.db, t.compK.id), { scope: "team:kolkata", number: "+919830012345" }, "the team's own number takes priority");
  assert.equal((await notify.resolveSender(t.db, t.compF.id)).scope, "admin", "another team falls back to admin");
  await notify.notifyCandidate(t.db, cand, "test", "T", "B", t.compK.id);
  assert.deepEqual([(await last()).status, (await last()).status_detail], ["skipped", "no WhatsApp consent from the candidate"], "without the candidate's WhatsApp consent nothing is queued, even with a number set up");
  await notify.setWhatsappConsent(t.db, cand, true, "test");
  await notify.notifyCandidate(t.db, cand, "test", "T", "B", t.compK.id);
  assert.deepEqual([(await last()).status, (await last()).sender_scope], ["queued", "team:kolkata"]);
  await staffMod.setStaffMessaging(t.db, t.admin, "admin", { number: "+91 90000 00001", enabled: true, override: true });
  assert.equal((await notify.resolveSender(t.db, t.compK.id)).scope, "admin", "admin override wins");
  assert.equal((await t.db.prepare("SELECT COUNT(*) AS n FROM messages WHERE status = 'sent'").first()).n, 0);
  const seen = await staffMod.staffMessaging(t.db, t.mgrK);
  assert.deepEqual(seen.scopes.map(x => x.scope), ["team:kolkata"], "a manager sees only their own team's set-up");
});

await check("A manager manages only their own team's members; deleting a candidate removes their messages", async () => {
  const t = await staffSetup();
  assert.equal(await staffMod.canManageTeam(t.db, t.mgrK, "kolkata"), true);
  assert.equal(await staffMod.canManageTeam(t.db, t.mgrK, "franchise"), false);
  assert.equal(await staffMod.canManageTeam(t.db, t.recA, "kolkata"), false);
  await staffMod.assignJobRecruiter(t.db, t.mgrK, t.jdK, t.recA.id);
  await rejects(staffMod.removeTeamMember(t.db, t.mgrK, "franchise", t.recF.id), "NOT_FOUND");
  await rejects(staffMod.removeTeamMember(t.db, t.mgrK, "kolkata", t.mgrK.id), "SELF");
  await staffMod.removeTeamMember(t.db, t.mgrK, "kolkata", t.recA.id);
  assert.equal((await t.db.prepare("SELECT recruiter_id FROM jds WHERE id = ?").bind(t.jdK).first()).recruiter_id, null, "their job assignment is cleared");
  assert.equal((await staffMod.staffWork(t.db, t.recA)).clients.length, 0, "a removed member sees nothing");
  const cand = await makeCandidate(t.db, "Erase Me");
  await notify.notifyCandidate(t.db, cand, "test", "T", "B");
  await candidate.deleteCandidateData(t.db, cand, "candidate");
  assert.equal((await t.db.prepare("SELECT (SELECT COUNT(*) FROM messages WHERE recipient_kind = 'candidate' AND recipient_id = ?) + (SELECT COUNT(*) FROM messages WHERE recipient_id = ?) AS n").bind(cand, cand).first()).n, 0);
});

// ---------- Placement-fee model and client access lock-down ----------

await check("A client sees a candidate only while their hiring process is open, and contact details only from offer", async () => {
  const t = await staffSetup();
  await client.setJdOpenings(t.db, t.compK.id, t.jdK, 1, t.compK.userId);
  const cand = await makeCandidate(t.db, "Temporary Access"), second = await makeCandidate(t.db, "Second Person");
  const sub = await rankedSubmit(t, t.recA, { jdId: t.jdK, candidateId: cand, note: "Strong fit" });
  const early = await views.unlockedCandidate(t.db, t.compK.id, sub.ref, true);
  assert.ok(early.contactsHidden && early.profile.contact.name && !early.profile.contact.email && !early.profile.contact.phone && early.profile.contact.links.length === 0, "no contact details before offer");
  await rejects(views.unlockedCandidate(t.db, t.compF.id, sub.ref, true), "NOT_UNLOCKED");
  await client.moveStage(t.db, t.compK.id, t.compK.userId, sub.id, { stage: "shortlisted" });
  await client.moveStage(t.db, t.compK.id, t.compK.userId, sub.id, { stage: "interview" });
  await client.moveStage(t.db, t.compK.id, t.compK.userId, sub.id, { stage: "offered", offerCtcInr: 1_200_000 });
  const atOffer = await views.unlockedCandidate(t.db, t.compK.id, sub.ref, true);
  assert.ok(!atOffer.contactsHidden && atOffer.profile.contact.email, "contact details arrive with the offer");
  await client.moveStage(t.db, t.compK.id, t.compK.userId, sub.id, { stage: "offer_declined", reason: Object.values(client.REASONS.offer_declined ?? ["other"])[0] });
  await rejects(views.unlockedCandidate(t.db, t.compK.id, sub.ref, true), "ACCESS_ENDED");
  const row = (await client.pipelineView(t.db, t.compK.id, undefined, true)).find(r => r.id === sub.id);
  assert.ok(!row.name.includes("Temporary") && row.recruiterNote === "" && row.available === false, "a closed-out candidate goes back to a reference");
  const sub2 = await rankedSubmit(t, t.recA, { jdId: t.jdK, candidateId: second, note: "Next" });
  assert.ok(await views.unlockedCandidate(t.db, t.compK.id, sub2.ref, true));
  await t.db.prepare("UPDATE jds SET status = 'closed' WHERE id = ?").bind(t.jdK).run();
  await rejects(views.unlockedCandidate(t.db, t.compK.id, sub2.ref, true), "ACCESS_ENDED");
});

await check("Contact details are stripped from CV text; the placement fee is 7.5% to 8.33% with a 60-day replacement", async () => {
  const text = policy.redactContacts("Asha Rao | asha.rao@example.com | +91 98300 12345 | linkedin.com/in/asharao | https://github.com/asha\n8 years in Java, 2019-2024, CTC 1200000");
  assert.ok(!/example\.com|98300|linkedin|github/.test(text) && text.includes("8 years in Java, 2019-2024") && text.includes("1200000"), text);
  assert.equal(policy.feePercent(undefined), 8.33); assert.equal(policy.feePercent(7.5), 7.5);
  assert.throws(() => policy.feePercent(7)); assert.throws(() => policy.feePercent(10));
  assert.equal(policy.placementFee(1_200_000, 8.33), 99_960); assert.equal(policy.placementFee(null, 8.33), null);
  const t = await staffSetup();
  await client.setJdOpenings(t.db, t.compK.id, t.jdK, 1, t.compK.userId);
  await rejects(client.updateClientTerms(t.db, t.compK.id, 60, "", "admin", 12, 12), "FEE");
  await client.updateClientTerms(t.db, t.compK.id, 60, "", "admin", 12, 7.5);
  const cand = await makeCandidate(t.db, "Joiner");
  const sub = await rankedSubmit(t, t.recA, { jdId: t.jdK, candidateId: cand, note: "Fit" });
  for (const stage of ["shortlisted", "interview"]) await client.moveStage(t.db, t.compK.id, t.compK.userId, sub.id, { stage });
  await client.moveStage(t.db, t.compK.id, t.compK.userId, sub.id, { stage: "offered", offerCtcInr: 1_000_000 });
  await client.moveStage(t.db, t.compK.id, t.compK.userId, sub.id, { stage: "offer_accepted", joiningDate: "2026-12-01" });
  clock = new Date("2026-12-01T06:00:00Z");
  await client.moveStage(t.db, t.compK.id, t.compK.userId, sub.id, { stage: "joined", joiningDate: "2026-12-01" });
  const pl = await t.db.prepare("SELECT fee_percent, fee_inr, guarantee_ends_on FROM placements WHERE pipeline_id = ?").bind(sub.id).first();
  assert.deepEqual([pl.fee_percent, pl.fee_inr], [7.5, 75_000]);
  await rejects(views.unlockedCandidate(t.db, t.compK.id, sub.ref, true), "ACCESS_ENDED");
  clock = new Date("2026-11-09T06:00:00Z");
});

await check("A live job's requirements can change only three times in 30 days; hiding from an employer works by typed name", async () => {
  const t = await staffSetup();
  const relive = async () => { await company.decideJd(t.db, t.jdK, true, "admin"); };
  const req = JSON.parse((await t.db.prepare("SELECT requirements FROM jds WHERE id = ?").bind(t.jdK).first()).requirements);
  for (let i = 0; i < 3; i++) { await company.updateJdRequirements(t.db, t.compK.id, t.jdK, { ...req, maxYears: 10 + i }, t.compK.userId); await relive(); }
  await rejects(company.updateJdRequirements(t.db, t.compK.id, t.jdK, { ...req, maxYears: 20 }, t.compK.userId), "EDIT_LIMIT");
  await client.setJdOpenings(t.db, t.compK.id, t.jdK, 1, t.compK.userId);
  const cand = await makeCandidate(t.db, "Hidden Person");
  await t.db.prepare("UPDATE candidates SET hidden_company_names = ? WHERE id = ?").bind(JSON.stringify(["kolkata client pvt. ltd."]), cand).run();
  await rejects(rankedSubmit(t, t.recA, { jdId: t.jdK, candidateId: cand, note: "x" }), "HIDDEN");
  assert.equal(policy.nameKey("Kolkata Client Private Limited"), policy.nameKey("KOLKATA CLIENT"));
});

await check("Recruiters see the three best candidates at a time, without scores; passing with a reason brings up the next", async () => {
  const t = await staffSetup();
  await client.setJdOpenings(t.db, t.compK.id, t.jdK, 1, t.compK.userId);
  const c = []; for (let i = 0; i < 6; i++) { c.push(await makeCandidate(t.db, `Ranked ${i}`)); await rank(t.db, t.jdK, c[i], 90 - i); }
  const first = await staffMod.staffCandidates(t.db, t.recA, t.jdK);
  assert.deepEqual(first.map(x => x.candidate_id), c.slice(0, 3));
  assert.ok(first.every(x => !("score" in x) && !("lower_bound" in x)), "no scores for recruiters");
  assert.deepEqual((await staffMod.staffCandidates(t.db, t.mgrK, t.jdK)).length, 3, "team managers get the same three");
  const adminView = await staffMod.staffCandidates(t.db, t.admin, t.jdK);
  assert.ok(adminView.length === 6 && adminView[0].score === 90, "the admin sees the full ranked list with scores");
  await rejects(staffMod.staffSubmit(t.db, SECRET, t.recA, { jdId: t.jdK, candidateId: c[4], note: "not shown to me" }), "NOT_FOUND");
  await rejects(staffMod.staffPass(t.db, t.recA, { jdId: t.jdK, candidateId: c[5], reason: "skills_mismatch" }), "NOT_FOUND");
  await rejects(staffMod.staffPass(t.db, t.recA, { jdId: t.jdK, candidateId: c[0], reason: "" }), "REASON");
  await rejects(staffMod.staffPass(t.db, t.recF, { jdId: t.jdK, candidateId: c[0], reason: "other" }), "NOT_FOUND");
  await staffMod.staffPass(t.db, t.recA, { jdId: t.jdK, candidateId: c[0], reason: "skills_mismatch" });
  await staffMod.staffSubmit(t.db, SECRET, t.recA, { jdId: t.jdK, candidateId: c[1], note: "Good fit" });
  assert.deepEqual((await staffMod.staffCandidates(t.db, t.recA, t.jdK)).map(x => x.candidate_id), [c[2], c[3], c[4]]);
  assert.equal((await staffMod.staffCandidates(t.db, t.admin, t.jdK)).find(x => x.candidate_id === c[0]).passed, "skills_mismatch", "the admin sees why a candidate was passed over");
  const sub = (await client.pipelineView(t.db, t.compK.id)).find(r => r.stage === "submitted");
  for (const stage of ["shortlisted", "interview"]) await client.moveStage(t.db, t.compK.id, t.compK.userId, sub.id, { stage });
  await client.moveStage(t.db, t.compK.id, t.compK.userId, sub.id, { stage: "offered", offerCtcInr: 900_000 });
  await client.moveStage(t.db, t.compK.id, t.compK.userId, sub.id, { stage: "offer_accepted", joiningDate: "2026-12-01" });
  clock = new Date("2026-12-01T06:00:00Z");
  await client.moveStage(t.db, t.compK.id, t.compK.userId, sub.id, { stage: "joined", joiningDate: "2026-12-01" });
  const pl = await t.db.prepare("SELECT id, guarantee_ends_on FROM placements WHERE pipeline_id = ?").bind(sub.id).first();
  assert.equal(pl.guarantee_ends_on, "2027-01-30", "the replacement guarantee runs 60 days from joining");
  clock = new Date("2026-12-20T06:00:00Z");
  assert.equal((await client.reportPlacementExit(t.db, t.compK.id, t.compK.userId, pl.id, "2026-12-19", "Left")).inGuarantee, true);
  assert.equal((await staffMod.staffCandidates(t.db, t.admin, t.jdK)).find(x => x.candidate_id === c[1]).early_exits, 1, "a candidate who left inside the guarantee is marked for staff");
  clock = new Date("2026-11-09T06:00:00Z");
});

// ---------- Question banks, adaptive tests, Fast Track, commitment ----------

await check("Question banks: every question is checked, uploads report bad rows, and a bank needs a full sitting before going live", async () => {
  const db = await setup();
  const ok = { level: 5, topic: "T", stem: "What is two plus two?", options: ["4", "5", "6", "7"], answerIndex: 0 };
  assert.equal(adaptive.questionProblem(ok), null);
  for (const bad of [{ ...ok, level: 11 }, { ...ok, options: ["4", "4", "6"] }, { ...ok, options: ["4", "5", "All of the above"] }, { ...ok, answerIndex: 4 }, { ...ok, stem: "Short" }, { ...ok, options: ["4", "5"] }]) assert.ok(adaptive.questionProblem(bad), JSON.stringify(bad));
  const parsed = adaptive.parseQuestionRows('level,topic,question,option 1,option 2,option 3,option 4,answer,explanation\n3,Maths,"What is 10, divided by 2?",5,2,8,20,A,Ten over two\n4,Maths,What is three times three?,6,9,12,3,9,\n4,Maths,No answer given here at all,1,2,3,4,zzz,');
  assert.deepEqual([parsed.questions.length, parsed.errors.length, parsed.questions[0].stem, parsed.questions[0].answerIndex, parsed.questions[1].answerIndex], [2, 1, "What is 10, divided by 2?", 0, 1]);
  const bank = await adaptive.createBank(db, { kind: "technical", title: "Java", skillId: "java" }, "inv1");
  await rejects(adaptive.createBank(db, { kind: "client", title: "Client test" }, "inv1"), "COMPANY");
  const r = await adaptive.addQuestions(db, bank, [...parsed.questions, parsed.questions[0], { ...ok, options: ["4", "4", "5"] }], "inv1");
  assert.deepEqual([r.added, r.errors.length], [2, 2], "duplicates and invalid rows are refused and reported");
  await rejects(adaptive.setBankStatus(db, bank, "active", "inv1"), "TOO_FEW");
  const ids = await adaptive.loadSampleBanks(db, "admin");
  const sum = await adaptive.bankSummary(db);
  assert.ok(ids.length === 2 && sum.filter(b => b.is_sample).every(b => b.status === "active" && b.questions === 120 && b.levels === 10));
  await rejects(adaptive.loadSampleBanks(db, "admin"), "EXISTS");
});

// Sit a test as someone who answers correctly whenever the question is at or below their true level.
async function sit(db, testId, cand, ability) {
  let step = await adaptive.testStep(db, testId, cand, { start: true }), seen = new Set(), orders = new Set(), n = 0;
  while (step.state === "question") {
    const t = await db.prepare("SELECT current_question_id, current_order FROM adaptive_tests WHERE id = ?").bind(testId).first();
    const q = await db.prepare("SELECT level, answer_index, options FROM bank_questions WHERE id = ?").bind(t.current_question_id).first();
    assert.ok(!seen.has(t.current_question_id), "no question repeats in one sitting"); seen.add(t.current_question_id);
    const order = JSON.parse(t.current_order); orders.add(order.join(""));
    assert.deepEqual(step.question.options, order.map(i => JSON.parse(q.options)[i]), "options are shown in the shuffled order");
    assert.ok(!("answer_index" in step.question) && !JSON.stringify(step).includes("Computed answer"), "the answer is never sent");
    step = await adaptive.answerTest(db, testId, cand, q.level <= ability ? order.indexOf(q.answer_index) : (order.indexOf(q.answer_index) + 1) % order.length);
    n++;
  }
  return { step, n, orders };
}

await check("Fast Track: payment confirmation marks the candidate; technical tests need it; the adaptive test finds the candidate's level", async () => {
  const db = await setup();
  const [tech] = await adaptive.loadSampleBanks(db, "admin");
  const cand = await makeCandidate(db, "Test Taker");
  await rejects(adaptive.startTechnicalTest(db, cand, tech), "FAST_TRACK");
  // Not offered during the pilot; the machinery below is kept working for when it is.
  await rejects(adaptive.requestFastTrack(db, cand), "NOT_OFFERED");
  policy.PILOT_RULES.fastTrack = true; policy.PILOT_RULES.paidResultsAffectSelection = true;
  await rejects(adaptive.requestFastTrack(db, cand), "NOT_OPEN");
  await rejects(adaptive.saveFastTrackSettings(db, 0, "Pay by UPI to jobboard300@upi", "admin"), "PRICE");
  await adaptive.saveFastTrackSettings(db, 1499, "Pay by UPI to jobboard300@upi and quote your reference.", "admin");
  const order = await adaptive.requestFastTrack(db, cand);
  assert.ok(/^FT-[A-Z0-9]{8}$/.test(order.reference) && order.amount_inr === 1499 && (await adaptive.requestFastTrack(db, cand)).reference === order.reference, "one open order per candidate");
  assert.equal(await adaptive.isFastTrack(db, cand), false, "asking is not paying");
  await rejects(adaptive.decideFastTrackOrder(db, order.id, true, "", "admin"), "NOTE");
  await adaptive.decideFastTrackOrder(db, order.id, true, "UPI ref 12345", "admin");
  assert.equal(await adaptive.isFastTrack(db, cand), true);
  assert.ok((await kinds(db, cand)).includes("fast_track.active"));
  await rejects(adaptive.decideFastTrackOrder(db, order.id, true, "again", "admin"), "DECIDED");
  const view = await adaptive.candidateTests(db, cand, ["sample"]);
  assert.ok(view.fastTrack && view.technical[0].suggested === true, "tests matching the candidate's skills are suggested first");
  const { id } = await adaptive.startTechnicalTest(db, cand, tech);
  assert.equal((await adaptive.startTechnicalTest(db, cand, tech)).id, id, "an unfinished test is resumed, not restarted");
  const out = await sit(db, id, cand, 7);
  assert.deepEqual([out.n, out.step.state, out.step.band], [20, "done", "intermediate"]);
  assert.ok(Math.abs(out.step.level - 7) <= 1 && out.orders.size > 3, `level ${out.step.level} for a true level of 7; options shuffled`);
  assert.ok(Array.isArray(out.step.weakTopics), "Fast Track candidates see weak topics");
  await rejects(adaptive.startTechnicalTest(db, cand, tech), "COOLDOWN");
  await rejects(adaptive.answerTest(db, id, cand, 0), "NO_QUESTION");
  for (const [ability, band] of [[10, "expert"], [0, "beginner"]]) {
    const c = await makeCandidate(db, `Level ${ability}`); await db.prepare("UPDATE candidates SET fast_track_at = ? WHERE id = ?").bind(clock.toISOString(), c).run();
    const t = await adaptive.startTechnicalTest(db, c, tech); const res = await sit(db, t.id, c, ability);
    assert.equal(res.step.band, band); assert.ok(ability ? res.step.level >= 9 : res.step.level <= 2, `level ${res.step.level}`);
    await rejects(adaptive.testStep(db, t.id, cand), "NOT_FOUND");
  }
  assert.deepEqual(await adaptive.adaptiveEvidence(db, cand), {}, "sample banks never count towards ranking");
  policy.PILOT_RULES.fastTrack = false; policy.PILOT_RULES.paidResultsAffectSelection = false;
});

await check("Aptitude and client tests go only to invited candidates; the offer commitment and early-leaver priority work", async () => {
  const t = await staffSetup();
  await client.setJdOpenings(t.db, t.compK.id, t.jdK, 1, t.compK.userId);
  const [, apt] = await adaptive.loadSampleBanks(t.db, "admin");
  const cand = await makeCandidate(t.db, "Invited Person"), other = await makeCandidate(t.db, "Steady Person");
  const args = { bankId: apt, candidateId: cand, jdId: t.jdK, companyId: t.compK.id };
  await rejects(adaptive.inviteToTest(t.db, args, t.recA.id), "NOT_OPTED");
  await t.db.prepare("UPDATE jds SET aptitude_test = 1 WHERE id = ?").bind(t.jdK).run();
  const inv = await adaptive.inviteToTest(t.db, args, t.recA.id);
  await rejects(adaptive.inviteToTest(t.db, args, t.recA.id), "ALREADY");
  const token = new URL(inv.link, "https://x.test").searchParams.get("token");
  await rejects(adaptive.testByToken(t.db, "0".repeat(64)), "NOT_FOUND");
  const found = await adaptive.testByToken(t.db, token);
  assert.equal(found.candidate_id, cand);
  assert.equal((await adaptive.testStep(t.db, found.id, cand)).state, "ready", "opening the link does not start the clock");
  const res = await sit(t.db, found.id, cand, 3);
  assert.ok(res.step.band === "beginner" && res.step.weakTopics === null, "a candidate who has not paid sees the level but not the weak topics");
  const clientBank = await adaptive.createBank(t.db, { kind: "client", title: "Kolkata Client test", companyId: t.compK.id }, "admin");
  await adaptive.addQuestions(t.db, clientBank, Array.from({ length: 20 }, (_, i) => ({ level: 1 + (i % 10), topic: "Client", stem: `Client question number ${i + 1}?`, options: ["Right", "Wrong one", "Wrong two"], answerIndex: 0 })), "admin");
  await adaptive.setBankStatus(t.db, clientBank, "active", "admin");
  await rejects(adaptive.inviteToTest(t.db, { bankId: clientBank, candidateId: cand, jdId: t.jdF, companyId: t.compF.id }, t.recF.id), "NOT_FOUND");
  assert.ok((await adaptive.inviteToTest(t.db, { ...args, bankId: clientBank }, t.recA.id)).link.startsWith("/test?token="));
  assert.ok(!JSON.stringify(await client.pipelineView(t.db, t.compK.id, undefined, true)).match(/final_level|band|beginner/), "the client never sees test levels");

  // Offer-stage commitment
  const sub = await rankedSubmit(t, t.recA, { jdId: t.jdK, candidateId: cand, note: "Fit" });
  for (const stage of ["shortlisted", "interview"]) await client.moveStage(t.db, t.compK.id, t.compK.userId, sub.id, { stage });
  await rejects(commitment.reissueCommitmentLink(t.db, sub.id, "staff"), "NOT_FOUND");
  await client.moveStage(t.db, t.compK.id, t.compK.userId, sub.id, { stage: "offered", offerCtcInr: 800_000 });
  assert.ok((await kinds(t.db, cand)).includes("commitment.requested"));
  const link = await commitment.reissueCommitmentLink(t.db, sub.id, "staff"), ctoken = new URL(link, "https://x.test").searchParams.get("token");
  const read = await commitment.readCommitment(t.db, ctoken);
  assert.ok(read.body.includes("60 days") && read.body.includes("does not charge") && read.acceptedAt === null);
  const acc = await commitment.acceptCommitment(t.db, ctoken, "iphash");
  assert.equal((await commitment.acceptCommitment(t.db, ctoken, "x")).acceptedAt, acc.acceptedAt, "accepting twice keeps the first record");
  await rejects(commitment.reissueCommitmentLink(t.db, sub.id, "staff"), "ACCEPTED");

  // Early leaver ranks last for 12 months, then normally again
  await client.moveStage(t.db, t.compK.id, t.compK.userId, sub.id, { stage: "offer_accepted", joiningDate: "2026-12-01" });
  clock = new Date("2026-12-01T06:00:00Z");
  await client.moveStage(t.db, t.compK.id, t.compK.userId, sub.id, { stage: "joined", joiningDate: "2026-12-01" });
  const pl = await t.db.prepare("SELECT id FROM placements WHERE pipeline_id = ?").bind(sub.id).first();
  clock = new Date("2026-12-21T06:00:00Z");
  await client.reportPlacementExit(t.db, t.compK.id, t.compK.userId, pl.id, "2026-12-20", "Left");
  await rank(t.db, t.jdF, cand, 95); await rank(t.db, t.jdF, other, 60);
  // During the pilot an early leaver is not pushed down automatically; the recruiter sees the exit and asks.
  assert.deepEqual((await client.submissionCandidates(t.db, t.jdF)).map(c => c.candidate_id), [cand, other], "the rule is off during the pilot");
  assert.equal((await client.submissionCandidates(t.db, t.jdF)).find(c => c.candidate_id === cand).early_exits, 1, "the recruiter still sees the early exit");
  policy.PILOT_RULES.earlyLeaverLowerPriority = true;
  assert.deepEqual((await client.submissionCandidates(t.db, t.jdF)).map(c => c.candidate_id), [other, cand], "with the rule on, a recent early leaver ranks after everyone else");
  clock = new Date("2028-01-05T06:00:00Z");
  assert.deepEqual((await client.submissionCandidates(t.db, t.jdF)).map(c => c.candidate_id), [cand, other], "after 12 months the ranking is by fit again");
  policy.PILOT_RULES.earlyLeaverLowerPriority = false;
  clock = new Date("2026-11-09T06:00:00Z");
});

// ---------- Open audit items (11 Nov 2026): interviews, filling and closing a job, salary and replacement, consent ----------
const toStage = async (t, id, stages, extra = {}) => { for (const stage of stages) await client.moveStage(t.db, t.compK.id, t.compK.userId, id, { stage, ...(extra[stage] ?? {}) }); };
const inbox = async (t, cand) => (await notify.candidateInbox(t.db, cand)).map(m => m.kind);
const staffFeed = async (t, staff = t.admin) => (await staffMod.staffWork(t.db, staff)).changes.items.map(i => i.kind);

await check("Interviews: none in the past; reschedule and cancel tell the candidate; staff can record a result for the client; 'do not proceed' closes the candidate", async () => {
  const t = await staffSetup();
  await client.setJdOpenings(t.db, t.compK.id, t.jdK, 3, t.compK.userId);
  const cand = await makeCandidate(t.db, "Interview Person");
  const sub = await rankedSubmit(t, t.recA, { jdId: t.jdK, candidateId: cand, note: "Good" });
  await toStage(t, sub.id, ["shortlisted"]);
  await rejects(client.scheduleInterview(t.db, t.compK.id, t.compK.userId, sub.id, { round: "HR", scheduledAt: "2020-01-01T10:00:00Z", mode: "video" }), "WHEN_PAST");
  const { id: ivId } = await client.scheduleInterview(t.db, t.compK.id, t.compK.userId, sub.id, { round: "Technical 1", scheduledAt: "2026-11-12T10:00:00Z", mode: "video", location: "https://meet.example/x" });
  assert.ok((await staffFeed(t)).includes("interview.scheduled"), "recruiters see that the client scheduled an interview");
  await rejects(client.rescheduleInterview(t.db, t.compK.id, t.compK.userId, ivId, { scheduledAt: "2026-11-12T10:00:00Z" }), "NO_CHANGE");
  await rejects(client.rescheduleInterview(t.db, t.compK.id, t.compK.userId, ivId, { scheduledAt: "2020-01-01T10:00:00Z" }), "WHEN_PAST");
  await client.rescheduleInterview(t.db, t.compK.id, t.compK.userId, ivId, { scheduledAt: "2026-11-13T05:30:00Z" });
  const msg = (await notify.candidateInbox(t.db, cand)).find(m => m.kind === "interview.rescheduled");
  assert.ok(msg && msg.body.includes("11:00") && msg.body.includes("https://meet.example/x"), "the candidate gets one message with the new India time and the old link");
  assert.ok((await staffFeed(t)).includes("interview.rescheduled"));
  // A recruiter records the result on the client's behalf; the client is told it was Jobboard300.
  await rejects(staffMod.staffRecordInterview(t.db, t.recF, ivId, { status: "completed", outcome: "advance" }), "NOT_FOUND");
  const adv = await staffMod.staffRecordInterview(t.db, t.recA, ivId, { status: "completed", outcome: "advance", rating: 4, feedback: "Strong on GST" });
  assert.deepEqual([adv.suggest, adv.moved], ["next", null]);
  assert.equal((await t.db.prepare("SELECT recorded_by, outcome FROM interviews WHERE id = ?").bind(ivId).first()).recorded_by, "Jobboard300");
  assert.ok((await notify.companyNotices(t.db, t.compK.id)).some(n => n.kind === "interview.recorded"));
  // Cancelling tells the candidate.
  const second = await client.scheduleInterview(t.db, t.compK.id, t.compK.userId, sub.id, { round: "HR", scheduledAt: "2026-11-14T10:00:00Z", mode: "phone" });
  await client.recordInterview(t.db, t.compK.id, t.compK.userId, second.id, { status: "cancelled" });
  assert.ok((await inbox(t, cand)).includes("interview.cancelled"), "the candidate is told when an interview is cancelled");
  // 'Do not proceed' without a reason only suggests; with a reason it closes the candidate in the same step.
  const third = await client.scheduleInterview(t.db, t.compK.id, t.compK.userId, sub.id, { round: "Final", scheduledAt: "2026-11-15T10:00:00Z", mode: "video" });
  const hint = await client.recordInterview(t.db, t.compK.id, t.compK.userId, third.id, { status: "completed", outcome: "reject", feedback: "No" });
  assert.deepEqual([hint.suggest, hint.moved], ["rejected", null]);
  const fourth = await client.scheduleInterview(t.db, t.compK.id, t.compK.userId, sub.id, { round: "Final 2", scheduledAt: "2026-11-16T10:00:00Z", mode: "video" });
  await rejects(client.recordInterview(t.db, t.compK.id, t.compK.userId, fourth.id, { status: "completed", outcome: "reject", rejectReason: "nonsense" }), "REASON");
  const done = await client.recordInterview(t.db, t.compK.id, t.compK.userId, fourth.id, { status: "completed", outcome: "reject", rejectReason: "skills_gap" });
  assert.equal(done.moved, "rejected");
  assert.equal((await t.db.prepare("SELECT stage, stage_reason FROM pipeline WHERE id = ?").bind(sub.id).first()).stage, "rejected");
  assert.ok((await inbox(t, cand)).includes("stage.rejected"));
});

await check("A hire needs a salary; the last hire fills the job; the rest are closed out as 'position filled'; a hire who leaves inside the guarantee is replaced at no fee", async () => {
  const t = await staffSetup();
  await client.setJdOpenings(t.db, t.compK.id, t.jdK, 1, t.compK.userId);
  const [a, b, c] = [await makeCandidate(t.db, "Hire One"), await makeCandidate(t.db, "Waiting Two"), await makeCandidate(t.db, "Waiting Three")];
  const subA = await rankedSubmit(t, t.recA, { jdId: t.jdK, candidateId: a, note: "x" });
  const subB = await rankedSubmit(t, t.recA, { jdId: t.jdK, candidateId: b, note: "x" });
  const subC = await rankedSubmit(t, t.recA, { jdId: t.jdK, candidateId: c, note: "x" });
  await toStage(t, subB.id, ["shortlisted"]);
  // A candidate who has just been submitted can be withdrawn.
  await client.moveStage(t.db, t.compK.id, t.compK.userId, subC.id, { stage: "withdrawn", reason: "candidate_withdrew" });
  // An offer without a salary cannot become a hire until the salary is given.
  await toStage(t, subA.id, ["shortlisted", "interview", "offered", "offer_accepted"], { offered: {}, offer_accepted: { joiningDate: "2026-12-01" } });
  clock = new Date("2026-12-01T06:00:00Z");
  await rejects(client.moveStage(t.db, t.compK.id, t.compK.userId, subA.id, { stage: "joined", joiningDate: "2026-12-01" }), "CTC_REQUIRED");
  await rejects(client.moveStage(t.db, t.compK.id, t.compK.userId, subA.id, { stage: "joined", joiningDate: "2026-12-01", offerCtcInr: 12 }), "CTC");
  const hired = await client.moveStage(t.db, t.compK.id, t.compK.userId, subA.id, { stage: "joined", joiningDate: "2026-12-01", offerCtcInr: 1_000_000 });
  assert.deepEqual(hired.filled, { jdId: t.jdK, remaining: 1 });
  const first = await t.db.prepare("SELECT id, ctc_inr, fee_inr FROM placements WHERE pipeline_id = ?").bind(subA.id).first();
  assert.deepEqual([first.ctc_inr, first.fee_inr], [1_000_000, 83_300]);
  assert.equal((await t.db.prepare("SELECT status FROM jds WHERE id = ?").bind(t.jdK).first()).status, "closed", "the filled job is closed");
  await rejects(staffMod.staffSubmit(t.db, SECRET, t.admin, { jdId: t.jdK, candidateId: await makeCandidate(t.db, "Late Person"), note: "x" }), "JD_CLOSED");
  assert.ok((await staffFeed(t)).includes("job.filled") && (await notify.companyNotices(t.db, t.compK.id)).some(n => n.kind === "job.filled"));
  const closed = await staffMod.staffCloseRemaining(t.db, t.recA, t.jdK);
  assert.equal(closed.closed, 1);
  assert.deepEqual([(await t.db.prepare("SELECT stage, stage_reason FROM pipeline WHERE id = ?").bind(subB.id).first()).stage_reason.split(":")[0], (await inbox(t, b)).includes("stage.rejected")], ["position_filled", true]);
  const view = await staffMod.staffWork(t.db, t.recA);
  assert.ok(view.jobs.some(j => j.id === t.jdK && j.status === "closed"), "a filled job stays visible to recruiters under the Closed filter");
  // Leaving inside the guarantee re-opens the job with one more opening.
  clock = new Date("2026-12-20T06:00:00Z");
  const exit = await client.reportPlacementExit(t.db, t.compK.id, t.compK.userId, first.id, "2026-12-19", "Left");
  assert.equal(exit.inGuarantee, true);
  const jd = await t.db.prepare("SELECT status, openings FROM jds WHERE id = ?").bind(t.jdK).first();
  assert.deepEqual([jd.status, jd.openings], ["live", 2]);
  assert.ok((await staffFeed(t)).includes("placement.replacement"), "recruiters get a replacement task");
  // The replacement hire is linked to the placement it replaces and carries no new fee.
  const d = await makeCandidate(t.db, "Replacement Hire");
  const subD = await rankedSubmit(t, t.recA, { jdId: t.jdK, candidateId: d, note: "Replacement" });
  await toStage(t, subD.id, ["shortlisted", "interview", "offered", "offer_accepted"], { offered: { offerCtcInr: 900_000 }, offer_accepted: { joiningDate: "2027-01-05" } });
  clock = new Date("2027-01-05T06:00:00Z");
  const rep = await client.moveStage(t.db, t.compK.id, t.compK.userId, subD.id, { stage: "joined", joiningDate: "2027-01-05" });
  assert.equal(rep.replacement, true);
  const second = await t.db.prepare("SELECT fee_inr, replaces_placement_id FROM placements WHERE pipeline_id = ?").bind(subD.id).first();
  assert.deepEqual([second.fee_inr, second.replaces_placement_id], [0, first.id]);
  assert.equal((await t.db.prepare("SELECT status FROM placements WHERE id = ?").bind(first.id).first()).status, "replaced");
  clock = new Date("2026-11-09T06:00:00Z");
});

await check("Closing a job closes its candidates with a message and keeps it visible; re-open goes through approval; saving a job with no change does nothing and a real change erases nothing", async () => {
  const t = await staffSetup();
  const cand = await makeCandidate(t.db, "Closing Person");
  const sub = await rankedSubmit(t, t.recA, { jdId: t.jdK, candidateId: cand, note: "x" });
  await toStage(t, sub.id, ["shortlisted"]);
  const before = JSON.parse((await t.db.prepare("SELECT requirements FROM jds WHERE id = ?").bind(t.jdK).first()).requirements);
  // The editor sends only what it shows.
  const shown = { title: before.title, mustHave: before.mustHave.map(x => x.name).join(", "), niceToHave: before.niceToHave.map(x => x.name).join(", "), minYears: before.minYears, maxYears: before.maxYears, educationLevel: before.educationLevel,
    hard: { cities: before.hard.cities.join(", "), remote: before.hard.remote, allowRelocation: before.hard.allowRelocation, mandatorySkills: before.hard.mandatorySkills.map(x => x.name).join(", "), maxNoticeDays: before.hard.maxNoticeDays, ctcMinInr: before.hard.ctcMinInr, ctcMaxInr: before.hard.ctcMaxInr } };
  const same = await company.updateJdRequirements(t.db, t.compK.id, t.jdK, shown, t.compK.userId);
  assert.equal(same.changed, false);
  assert.equal((await t.db.prepare("SELECT status FROM jds WHERE id = ?").bind(t.jdK).first()).status, "live", "pressing Save with no change leaves the job live");
  assert.equal((await t.db.prepare("SELECT COUNT(*) AS n FROM jd_requirement_edits WHERE jd_id = ?").bind(t.jdK).first()).n, 0, "and uses none of the three edits");
  const edit = await company.updateJdRequirements(t.db, t.compK.id, t.jdK, { ...shown, maxYears: 9 }, t.compK.userId);
  assert.deepEqual([edit.changed, edit.status], [true, "pending"], "a real change goes straight to waiting for approval");
  const after = JSON.parse((await t.db.prepare("SELECT requirements FROM jds WHERE id = ?").bind(t.jdK).first()).requirements);
  assert.deepEqual([after.location, after.workMode, after.hard.seniority, after.educationFields, after.roleFamily], [before.location, before.workMode, before.hard.seniority, before.educationFields, before.roleFamily], "details the editor does not show are kept");
  assert.ok((await staffMod.staffWork(t.db, t.recA)).jobs.some(j => j.id === t.jdK), "the job stays visible to its recruiters while it waits for approval");
  assert.ok((await staffFeed(t)).includes("job.edited"));
  await company.decideJd(t.db, t.jdK, true, "admin");
  assert.ok((await notify.companyNotices(t.db, t.compK.id)).some(n => n.kind === "job.approved"), "the client is told when a job is approved");
  // Close it.
  const out = await client.closeJob(t.db, t.compK.id, t.compK.userId, t.jdK);
  assert.equal(out.closed, 1);
  const row = await t.db.prepare("SELECT stage, stage_reason FROM pipeline WHERE id = ?").bind(sub.id).first();
  assert.deepEqual([row.stage, row.stage_reason.split(":")[0]], ["withdrawn", "position_closed"]);
  assert.ok((await inbox(t, cand)).includes("stage.withdrawn"), "the candidate is told");
  assert.ok((await staffMod.staffWork(t.db, t.recA)).jobs.some(j => j.id === t.jdK && j.status === "closed"), "a closed job stays visible to staff");
  await rejects(company.updateJdRequirements(t.db, t.compK.id, t.jdK, { ...shown, maxYears: 11 }, t.compK.userId), "CLOSED");
  await company.submitJd(t.db, t.compK.id, t.jdK, t.compK.userId);
  assert.equal((await t.db.prepare("SELECT status FROM jds WHERE id = ?").bind(t.jdK).first()).status, "pending", "a closed job can be sent for approval again");
});

await check("Consent: hiding from an employer ends its access; withdrawing writes the stage history and tells recruiters; allowing sharing again makes the person submittable", async () => {
  const t = await staffSetup();
  const cand = await makeCandidate(t.db, "Consent Person");
  const sub = await rankedSubmit(t, t.recA, { jdId: t.jdK, candidateId: cand, note: "x" });
  await toStage(t, sub.id, ["shortlisted"]);
  // Hiding from this very employer.
  assert.equal(await consent.withdrawFromCompany(t.db, cand, t.compK.id, `candidate:${cand}`), 1);
  assert.equal((await t.db.prepare("SELECT stage, stage_reason FROM pipeline WHERE id = ?").bind(sub.id).first()).stage, "withdrawn");
  await rejects(views.unlockedCandidate(t.db, t.compK.id, sub.ref, true), "CONSENT_WITHDRAWN");
  assert.ok((await staffFeed(t)).includes("candidate.withdrew"));
  assert.equal(await consent.withdrawFromCompany(t.db, cand, t.compF.id, `candidate:${cand}`), 0, "an employer that never had the profile is unaffected");
  // Withdrawing sharing altogether writes a history row for every entry it closes.
  const other = await makeCandidate(t.db, "Withdrawing Person");
  const sub2 = await rankedSubmit(t, t.recA, { jdId: t.jdK, candidateId: other, note: "x" });
  await consent.withdrawSharing(t.db, other, `candidate:${other}`);
  const history = (await t.db.prepare("SELECT stage, actor FROM pipeline_events WHERE pipeline_id = ? ORDER BY at, rowid").bind(sub2.id).all()).results;
  assert.deepEqual(history.at(-1), { stage: "withdrawn", actor: "candidate" });
  // Withdrew once, then allowed sharing again: submittable again, with the old withdrawal kept in the ledger.
  const again = await makeCandidate(t.db, "Changed Mind");
  await rankedSubmit(t, t.recA, { jdId: t.jdK, candidateId: again, note: "x" });
  await consent.withdrawSharing(t.db, again, `candidate:${again}`);
  const { id: jd2 } = await company.createJd(t.db, t.compK.id, t.compK.userId, ACCOUNTS_JD);
  await company.submitJd(t.db, t.compK.id, jd2, t.compK.userId); await company.decideJd(t.db, jd2, true, "admin");
  await rank(t.db, jd2, again, 99);
  await rejects(staffMod.staffSubmit(t.db, SECRET, t.admin, { jdId: jd2, candidateId: again, note: "Back again" }), "NO_CONSENT");
  clock = new Date("2026-11-09T07:00:00Z");
  await consent.recordConsent(t.db, again, "share_with_companies", "granted");
  const resub = await staffMod.staffSubmit(t.db, SECRET, t.admin, { jdId: jd2, candidateId: again, note: "Back again" });
  assert.ok(resub.id, "allowed sharing again makes the person submittable");
  assert.equal((await t.db.prepare("SELECT access_revoked_at FROM unlocks WHERE company_id = ? AND candidate_id = ?").bind(t.compK.id, again).first()).access_revoked_at, null, "the client's access starts again with this submission");
  assert.equal((await t.db.prepare("SELECT COUNT(*) AS n FROM candidate_consents WHERE candidate_id = ? AND action = 'withdrawn'").bind(again).first()).n >= 1, true, "the withdrawal stays in the ledger");
  clock = new Date("2026-11-09T06:00:00Z");
});

await check("Recruiters: 'What changed', undo a pass, joining list, technical results, profile without contact details, links on any address", async () => {
  const t = await staffSetup();
  const cands = []; for (let i = 0; i < 4; i++) cands.push(await makeCandidate(t.db, `Short Person ${i}`)); for (const [i, c] of cands.entries()) await rank(t.db, t.jdK, c, 90 - i);
  await staffMod.staffPass(t.db, t.recA, { jdId: t.jdK, candidateId: cands[0], reason: "other" });
  assert.deepEqual((await staffMod.staffPassedCandidates(t.db, t.recA, t.jdK)).map(p => p.candidate_id), [cands[0]]);
  await rejects(staffMod.staffUnpass(t.db, t.recB, { jdId: t.jdK, candidateId: cands[0] }), "MANAGER_ONLY");
  await staffMod.staffUnpass(t.db, t.recA, { jdId: t.jdK, candidateId: cands[0] });
  assert.ok((await staffMod.staffCandidates(t.db, t.recA, t.jdK)).some(c => c.candidate_id === cands[0]), "an undone pass puts the candidate back");
  const prof = await staffMod.staffProfile(t.db, t.recA, { jdId: t.jdK, candidateId: cands[0] });
  assert.ok(prof.profile.skills.length > 0 && !prof.profile.contact.email && !prof.profile.contact.phone, "the profile is readable and carries no phone or email");
  await rejects(staffMod.staffProfile(t.db, t.recF, { jdId: t.jdK, candidateId: cands[0] }), "NOT_FOUND");
  assert.ok((await t.db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE kind = 'access' AND action = 'profile_view'").first()).n >= 1, "profile views are logged");
  // A technical result shows on the card.
  const bank = (await t.db.prepare("SELECT id FROM question_banks WHERE kind = 'technical' LIMIT 1").first())?.id;
  if (bank) {
    await t.db.prepare("INSERT INTO adaptive_tests (id, bank_id, candidate_id, status, level, final_level, band, completed_at, created_at) VALUES ('tt1', ?, ?, 'completed', 5, 6, 'Intermediate', ?, ?)").bind(bank, cands[0], clock.toISOString(), clock.toISOString()).run();
    assert.equal((await staffMod.staffCandidates(t.db, t.recA, t.jdK)).find(c => c.candidate_id === cands[0]).technical[0].level, 6);
  }
  // Joining list and links.
  const sub = await rankedSubmit(t, t.recA, { jdId: t.jdK, candidateId: cands[1], note: "x" });
  await toStage(t, sub.id, ["shortlisted", "interview", "offered", "offer_accepted"], { offered: { offerCtcInr: 600_000 }, offer_accepted: { joiningDate: "2026-12-01", lastWorkingDay: "2026-11-28", competingOffers: "One other offer" } });
  const work = await staffMod.staffWork(t.db, t.recA);
  assert.deepEqual([work.joining.length, work.joining[0]?.last_working_day, work.joining[0]?.competing_offers], [1, "2026-11-28", "One other offer"]);
  assert.equal((await staffMod.staffWork(t.db, t.recF)).joining.length, 0, "another team does not see it");
  const pipe = await staffMod.staffPipeline(t.db, t.recA, t.jdK);
  assert.equal(pipe[0].candidateId, cands[1]);
  const link = await commitment.reissueCommitmentLink(t.db, sub.id, "staff");
  assert.ok(link.startsWith("/commit?token="), "a link is a path on this site, so it is right on any address");
  const msgs = (await notify.candidateInbox(t.db, cands[1])).filter(m => m.kind === "commitment.requested");
  assert.equal(msgs.length, 2, "the inbox gets the new link when the old one stops working");
  assert.ok(msgs.every(m => m.link.startsWith("/commit?token=") && !m.body.includes("http")), "the link is its own field, not text in the message");
  // What changed: new items count, and viewing clears them.
  await client.moveStage(t.db, t.compK.id, t.compK.userId, sub.id, { stage: "no_show", reason: "unreachable" });
  const feed = (await staffMod.staffWork(t.db, t.recA)).changes;
  assert.ok(feed.unread >= 1 && feed.items.some(i => i.kind === "stage.no_show" && i.name === "Short Person 1"));
  await staffMod.markChangesSeen(t.db, t.recA);
  assert.equal((await staffMod.staffWork(t.db, t.recA)).changes.unread, 0);
  assert.equal((await staffMod.staffWork(t.db, t.recF)).changes.items.length, 0, "another team does not see it");
});

await check("Pilot evidence: mandates and authorised vacancies gate publishing; invoices, collections, time and costs give cost per hire, contribution and the readiness checklist", async () => {
  const t = await staffSetup();
  clock = new Date("2026-11-20T06:00:00Z");
  assert.match(await pilot.publishProblem(t.db, t.jdK), /mandate/);
  await rejects(pilot.setMandate(t.db, t.compK.id, "2027-01-01", "x.pdf", "admin"), "DATE");
  await rejects(pilot.setMandate(t.db, t.compK.id, "2026-11-10", "", "admin"), "REFERENCE");
  await pilot.setMandate(t.db, t.compK.id, "2026-11-10", "mandate-kolkata-client.pdf", "admin");
  assert.match(await pilot.publishProblem(t.db, t.jdK), /authorised/);
  await rejects(pilot.authoriseVacancy(t.db, t.jdK, "x", "2026-11-12", "admin"), "AUTHORISED_BY");
  await pilot.authoriseVacancy(t.db, t.jdK, "Priya Sharma, HR manager", "2026-11-12", "admin");
  assert.equal(await pilot.publishProblem(t.db, t.jdK), null);
  // A hire, its invoice and the money.
  await client.setJdOpenings(t.db, t.compK.id, t.jdK, 2, t.compK.userId);
  const cand = await makeCandidate(t.db, "Pilot Hire");
  const sub = await rankedSubmit(t, t.recA, { jdId: t.jdK, candidateId: cand, note: "x" });
  await toStage(t, sub.id, ["shortlisted", "interview", "offered", "offer_accepted"], { offered: { offerCtcInr: 480_000 }, offer_accepted: { joiningDate: "2026-11-18" } });
  await client.moveStage(t.db, t.compK.id, t.compK.userId, sub.id, { stage: "joined", joiningDate: "2026-11-18" });
  const pl = await t.db.prepare("SELECT id, fee_inr FROM placements WHERE pipeline_id = ?").bind(sub.id).first();
  await rejects(pilot.recordCollection(t.db, pl.id, { collectedOn: "2026-11-19", amountInr: 39_984 }, "admin"), "NOT_INVOICED");
  await pilot.recordInvoice(t.db, pl.id, { invoiceNumber: "JB300-001", invoicedOn: "2026-11-18" }, "admin");
  await pilot.recordCollection(t.db, pl.id, { collectedOn: "2026-11-19", amountInr: pl.fee_inr }, "admin");
  // Recruiter time and a direct cost on the job.
  await rejects(pilot.logWork(t.db, t.recA.id, { jdId: t.jdK, minutes: 2, activity: "screening" }), "MINUTES");
  await rejects(pilot.logWork(t.db, t.recA.id, { jdId: t.jdK, minutes: 60, activity: "golf" }), "ACTIVITY");
  await pilot.logWork(t.db, t.recA.id, { jdId: t.jdK, minutes: 600, activity: "screening", workedOn: "2026-11-15" });
  await pilot.logCost(t.db, { jdId: t.jdK, kind: "job_ads", amountInr: 2_000, spentOn: "2026-11-14" }, "admin");
  await pilot.setHourlyCost(t.db, 500, "admin");
  const eco = await pilot.unitEconomics(t.db);
  const row = eco.placements.find(p => p.id === pl.id);
  assert.deepEqual([row.hours, row.timeCostInr, row.directCostInr, row.contributionInr], [10, 5_000, 2_000, pl.fee_inr - 7_000]);
  assert.equal(eco.totals.costPerHireInr, 7_000);
  // The weekly funnel puts each event in its week (Monday, India time).
  assert.equal(pilot.weekOf("2026-11-18"), "2026-11-16");
  assert.equal(pilot.weekOf("2026-11-15T20:00:00.000Z"), "2026-11-16", "Sunday 20:00 UTC is Monday in India");
  const week = (await pilot.weeklyFunnel(t.db, 4)).find(w => w.week === "2026-11-16");
  assert.ok(week.joins >= 1 && week.invoicedInr === pl.fee_inr && week.collectedInr === pl.fee_inr, JSON.stringify(week));
  assert.ok((await pilot.funnelCsv(t.db)).startsWith("week_starting,prospects,mandates"));
  // The readiness checklist counts only what the records show.
  const r = Object.fromEntries((await pilot.readiness(t.db)).map(x => [x.key, x.met]));
  assert.deepEqual([r.mandates, r.paid, r.time, r.contribution], [false, false, true, true], JSON.stringify(r));
  // Every update to a candidate or client is queued as email too (the address is read when it is sent).
  assert.ok((await t.db.prepare("SELECT COUNT(*) AS n FROM messages WHERE channel = 'email' AND status = 'queued' AND recipient_id = ?").bind(cand).first()).n > 0);
  clock = new Date("2026-11-09T06:00:00Z");
});

console.log(`\n${passed} portal checks passed.`);
