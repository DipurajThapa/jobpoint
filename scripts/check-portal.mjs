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
const quota = await mod("quota.ts");
const release = await mod("release.ts");
const preview = await mod("preview.ts");
const candidate = await mod("candidate.ts");
const access = await mod("access.ts");
const accounts = await mod("accounts.ts");
const profileMod = await mod("profile.ts");
const match = await mod("match.ts");
const assess = await mod("assessment.ts");
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

const SECRET = "test-secret-test-secret-test-secret-123";
let clock = new Date("2026-11-09T06:00:00Z");
dbm.setClock(() => clock);
const tick = (ms = 1000) => { clock = new Date(clock.getTime() + ms); };

let passed = 0;
export const sections = [];
const check = async (name, fn) => { await fn(); passed++; console.log("PASS", name); };
const rejects = (promise, code) => assert.rejects(promise, e => e.code === code || assert.fail(`expected ${code}, got ${e.code}: ${e.message}`));

// ---------- helpers ----------
const ACCOUNTS_JD = { title: "Accounts Executive", location: "Durgapur, West Bengal", text: "We are hiring an Accounts Executive in Durgapur.\nRequirements: B.Com with 2-5 years of experience. Must have Tally, GST returns and TDS. Good knowledge of MS Excel. SAP is an advantage.\nCTC: 3-4.5 LPA. Notice period: up to 30 days." };
const PARAMS = { minScore: 70, roleFamilies: ["accounts-finance"], seniority: ["junior", "mid"], cities: ["Durgapur", "Asansol"], ctcBands: [{ minInr: 200000, maxInr: 600000 }], maxNoticeDays: 60, maxReleasePerJd: 5, maxLiveJds: 5 };

async function setup() {
  const db = createD1(root);
  await quota.upsertPlans(db, [
    { code: "free", name: "Free allowance", unlockQuota: 3, validityDays: 30, priceInr: 0, isFree: true },
    { code: "starter", name: "Starter", unlockQuota: 100, validityDays: 365, priceInr: null },
  ]);
  return db;
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
async function putMatch(db, jdId, candidateId, score, { hardPass = 1, lower } = {}) {
  await db.prepare("INSERT OR REPLACE INTO matches (jd_id, candidate_id, cv_id, profile_version, score, lower_bound, hard_pass, failed_filters, explanation, engine_version, scored_at) VALUES (?, ?, 'cv', 1, ?, ?, ?, '[]', ?, 't', ?)")
    .bind(jdId, candidateId, score, lower ?? score - 3, hardPass, JSON.stringify({ summary: "fits", meets: ["Tally"], misses: [], why: "test" }), clock.toISOString()).run();
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
await check("JD cannot be submitted before parameters are approved, nor go live without admin approval", async () => {
  const db = await setup();
  const comp = await makeCompany(db);
  await rejects(company.createJd(db, comp.id, comp.userId, ACCOUNTS_JD), "COMPANY_NOT_ACTIVE");
  await company.activateCompany(db, comp.id, PARAMS, "admin");
  const { id } = await company.createJd(db, comp.id, comp.userId, ACCOUNTS_JD);
  assert.equal((await db.prepare("SELECT status FROM jds WHERE id = ?").bind(id).first()).status, "draft");
  await rejects(company.decideJd(db, id, true, "admin"), "NOT_PENDING");
  await company.submitJd(db, comp.id, id, comp.userId);
  await putMatch(db, id, await makeCandidate(db, "Asha Roy"), 90);
  assert.equal((await release.runReleases(db, id, SECRET)).released, 0, "a pending JD releases nothing");
  await company.decideJd(db, id, true, "admin");
  assert.equal((await db.prepare("SELECT status, params_version FROM jds WHERE id = ?").bind(id).first()).status, "live");
});
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
await check("Only CVs within approved parameters are released; no padding below the minimum", async () => {
  const db = await setup();
  const comp = await makeCompany(db);
  const jd = await liveJd(db, comp);
  const strong = await makeCandidate(db, "Strong One"), weak = await makeCandidate(db, "Weak One"), failsFilter = await makeCandidate(db, "Filter Fail"), noConsent = await makeCandidate(db, "No Consent", { consentShare: false });
  await putMatch(db, jd, strong, 88); await putMatch(db, jd, weak, 55); await putMatch(db, jd, failsFilter, 95, { hardPass: 0 }); await putMatch(db, jd, noConsent, 92);
  const out = await release.runReleases(db, jd, SECRET);
  assert.equal(out.active, 1);
  const rel = await db.prepare("SELECT candidate_id FROM releases WHERE jd_id = ? AND revoked_at IS NULL").bind(jd).all();
  assert.deepEqual(rel.results.map(r => r.candidate_id), [strong]);
  // A JD with nothing above the minimum releases nothing.
  await db.prepare("DELETE FROM matches WHERE candidate_id = ?").bind(strong).run();
  await db.prepare("DELETE FROM releases").run();
  assert.equal((await release.runReleases(db, jd, SECRET)).active, 0);
});
await check("Release cap keeps only the highest-ranked candidates", async () => {
  const db = await setup();
  const comp = await makeCompany(db);
  const jd = await liveJd(db, comp);
  const ids = [];
  for (const [n, s] of [["A One", 95], ["B Two", 90], ["C Three", 85], ["D Four", 80], ["E Five", 78], ["F Six", 76]]) { const id = await makeCandidate(db, n); ids.push(id); await putMatch(db, jd, id, s); }
  await release.runReleases(db, jd, SECRET);
  const rel = await db.prepare("SELECT candidate_id FROM releases WHERE jd_id = ? AND revoked_at IS NULL ORDER BY score DESC").bind(jd).all();
  assert.deepEqual(rel.results.map(r => r.candidate_id), ids.slice(0, 5), "cap of 5 keeps the five highest");
  // A stronger newcomer displaces the lowest-ranked release that was not unlocked.
  const late = await makeCandidate(db, "G Seven"); await putMatch(db, jd, late, 99);
  await release.runReleases(db, jd, SECRET);
  const after = await db.prepare("SELECT candidate_id FROM releases WHERE jd_id = ? AND revoked_at IS NULL").bind(jd).all();
  assert.ok(after.results.some(r => r.candidate_id === late) && !after.results.some(r => r.candidate_id === ids[4]) && after.results.length === 5);
});
await check("Candidate references are stable within a company and differ across companies", async () => {
  const a = await dbm.candidateRef(SECRET, "company-a", "cand-1"), b = await dbm.candidateRef(SECRET, "company-b", "cand-1");
  assert.equal(a, await dbm.candidateRef(SECRET, "company-a", "cand-1"));
  assert.notEqual(a, b);
  assert.match(a, /^c_[a-z2-9]{12}$/);
});

// ---------- Unlocks and quota ----------
async function releasedSetup(n = 2) {
  const db = await setup();
  const comp = await makeCompany(db);
  const jd = await liveJd(db, comp);
  const cands = [];
  for (let i = 0; i < n; i++) { const id = await makeCandidate(db, `Cand ${String.fromCharCode(65 + i)}`); cands.push(id); await putMatch(db, jd, id, 90 - i); }
  await release.runReleases(db, jd, SECRET);
  const refs = (await db.prepare("SELECT candidate_id, candidate_ref FROM releases WHERE jd_id = ? AND revoked_at IS NULL").bind(jd).all()).results;
  return { db, comp, jd, cands, refs: Object.fromEntries(refs.map(r => [r.candidate_id, r.candidate_ref])) };
}
await check("Unlock consumes one unit; the same CV across JDs is charged once", async () => {
  const { db, comp, jd, cands, refs } = await releasedSetup(2);
  const before = (await quota.quotaStatus(db, comp.id)).remaining;
  const first = await quota.unlockCandidate(db, { companyId: comp.id, userId: comp.userId, candidateRef: refs[cands[0]], jdId: jd });
  assert.equal(first.charged, true);
  assert.equal(first.remaining, before - 1);
  // Second JD of the same company, same candidate.
  const { id: jd2 } = await company.createJd(db, comp.id, comp.userId, { ...ACCOUNTS_JD, title: "Accounts Executive (GST desk)" });
  await company.submitJd(db, comp.id, jd2, comp.userId); await company.decideJd(db, jd2, true, "admin");
  await putMatch(db, jd2, cands[0], 91); await release.runReleases(db, jd2, SECRET);
  const again = await quota.unlockCandidate(db, { companyId: comp.id, userId: comp.userId, candidateRef: refs[cands[0]], jdId: jd2 });
  assert.equal(again.charged, false);
  assert.equal(again.remaining, before - 1);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM quota_ledger WHERE reason = 'unlock'").first()).n, 1);
});
await check("Parallel unlock attempts of the same CV charge once", async () => {
  const { db, comp, jd, cands, refs } = await releasedSetup(1);
  const results = await Promise.allSettled(Array.from({ length: 5 }, () => quota.unlockCandidate(db, { companyId: comp.id, userId: comp.userId, candidateRef: refs[cands[0]], jdId: jd })));
  assert.equal(results.filter(r => r.status === "fulfilled" && r.value.charged).length, 1);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM unlocks").first()).n, 1);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM quota_ledger WHERE reason = 'unlock'").first()).n, 1);
});
await check("Quota is account-level and blocks unlocks when used up, prompting an upgrade", async () => {
  const { db, comp, jd, cands, refs } = await releasedSetup(3);
  await quota.adjustQuota(db, comp.id, -2, "test: leave one unlock", "admin");
  await quota.unlockCandidate(db, { companyId: comp.id, userId: comp.userId, candidateRef: refs[cands[0]], jdId: jd });
  // A second user of the same company shares the same quota.
  const second = await accounts.createAccount(db, "company_user", "recruiter2@example.com", "harbour lantern 4471 quiet");
  await db.prepare("INSERT INTO company_users (id, company_id, account_id, role, created_at) VALUES ('cu2', ?, ?, 'recruiter', ?)").bind(comp.id, second, clock.toISOString()).run();
  await rejects(quota.unlockCandidate(db, { companyId: comp.id, userId: second, candidateRef: refs[cands[1]], jdId: jd }), "QUOTA_EXHAUSTED");
  await quota.assignPlan(db, comp.id, "starter", "admin");
  assert.equal((await quota.unlockCandidate(db, { companyId: comp.id, userId: second, candidateRef: refs[cands[1]], jdId: jd })).charged, true);
});
await check("Expired plan blocks new unlocks but unlocked CVs stay accessible", async () => {
  const { db, comp, jd, cands, refs } = await releasedSetup(2);
  await quota.unlockCandidate(db, { companyId: comp.id, userId: comp.userId, candidateRef: refs[cands[0]], jdId: jd });
  tick(31 * 86_400_000); // free plan valid 30 days
  await rejects(quota.unlockCandidate(db, { companyId: comp.id, userId: comp.userId, candidateRef: refs[cands[1]], jdId: jd }), "QUOTA_EXHAUSTED");
  const again = await quota.unlockCandidate(db, { companyId: comp.id, userId: comp.userId, candidateRef: refs[cands[0]], jdId: jd });
  assert.equal(again.charged, false, "already-unlocked CV remains available without charge");
  tick(-31 * 86_400_000);
});
await check("Free allowance is granted once per company", async () => {
  const db = await setup();
  const comp = await makeCompany(db);
  await company.activateCompany(db, comp.id, PARAMS, "admin");
  await rejects(quota.assignPlan(db, comp.id, "free", "admin"), "FREE_USED");
});
await check("A company cannot unlock a CV not released to it, or another company's release", async () => {
  const { db, jd, cands, refs } = await releasedSetup(1);
  const other = await makeCompany(db, "Other Company");
  await company.activateCompany(db, other.id, PARAMS, "admin");
  await rejects(quota.unlockCandidate(db, { companyId: other.id, userId: other.userId, candidateRef: refs[cands[0]], jdId: jd }), "NOT_RELEASED");
  const guessed = await dbm.candidateRef(SECRET, other.id, cands[0]);
  await rejects(quota.unlockCandidate(db, { companyId: other.id, userId: other.userId, candidateRef: guessed, jdId: jd }), "NOT_RELEASED");
});

// ---------- Consent withdrawal ----------
await check("Withdrawing consent removes the CV from all lists immediately and revokes unlocked access", async () => {
  const { db, comp, jd, cands, refs } = await releasedSetup(2);
  await quota.unlockCandidate(db, { companyId: comp.id, userId: comp.userId, candidateRef: refs[cands[0]], jdId: jd });
  const { companiesToNotify } = await consent.withdrawSharing(db, cands[0], "candidate");
  assert.deepEqual(companiesToNotify, [comp.id]);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM matches WHERE candidate_id = ?").bind(cands[0]).first()).n, 0);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM releases WHERE candidate_id = ? AND revoked_at IS NULL").bind(cands[0]).first()).n, 0);
  const u = await db.prepare("SELECT access_revoked_at, access_revoke_reason FROM unlocks WHERE candidate_id = ?").bind(cands[0]).first();
  assert.ok(u.access_revoked_at); assert.equal(u.access_revoke_reason, "consent_withdrawn");
  await rejects(quota.unlockCandidate(db, { companyId: comp.id, userId: comp.userId, candidateRef: refs[cands[0]], jdId: jd }), "CONSENT_WITHDRAWN");
  assert.equal(await consent.consentActive(db, cands[0], "share_with_companies"), false);
  const ledger = await db.prepare("SELECT action FROM candidate_consents WHERE candidate_id = ? AND purpose = 'share_with_companies' ORDER BY at, rowid").bind(cands[0]).all();
  assert.deepEqual(ledger.results.map(r => r.action), ["granted", "withdrawn"], "withdrawal is recorded, not overwritten");
  // Even if a stale match row reappears, a withdrawn candidate is never released.
  await putMatch(db, jd, cands[0], 99);
  await release.runReleases(db, jd, SECRET);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM releases WHERE candidate_id = ? AND revoked_at IS NULL").bind(cands[0]).first()).n, 0);
});

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
await check("Unparseable CV goes to manual review and is never released", async () => {
  const db = await setup();
  const comp = await makeCompany(db);
  const jd = await liveJd(db, comp);
  const id = await candidate.createCandidate(db, { accountId: null, displayName: "Scan Only", email: "scan@example.com", phone: "" });
  await consent.recordConsent(db, id, "share_with_companies", "granted");
  await candidate.addCv(db, id, { r2Key: "s", fileName: "scan.pdf", fileType: "pdf", size: 1, sha256: "scan", text: "", profile: fakeProfile(), parseOk: false });
  assert.equal((await db.prepare("SELECT status FROM candidates WHERE id = ?").bind(id).first()).status, "review");
  assert.equal((await db.prepare("SELECT parse_status FROM cvs WHERE candidate_id = ?").bind(id).first()).parse_status, "needs_review");
  await putMatch(db, jd, id, 99);
  await release.runReleases(db, jd, SECRET);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM releases WHERE candidate_id = ?").bind(id).first()).n, 0);
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
  assert.ok(match.hardFilters(noTds, req, PARAMS).some(f => f.includes("Tally")));
  const late = fullProfile(); late.india = { ...late.india, noticeDays: 90 };
  assert.ok(match.hardFilters(late, req, PARAMS).some(f => f.startsWith("Notice")));
  const pricey = fullProfile(); pricey.india = { ...pricey.india, ctcExpectedInr: 900000 };
  assert.ok(match.hardFilters(pricey, req, PARAMS).some(f => f.startsWith("Expected CTC")));
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
await check("Pooled score of record resists retaking until lucky", () => {
  const at = new Date("2026-11-09T00:00:00Z");
  const day = d => new Date(at.getTime() - d * 86_400_000).toISOString();
  const pooled = assess.scoreOfRecord([{ score: 0.5, sem: 0.1, submitted_at: day(60) }, { score: 0.52, sem: 0.1, submitted_at: day(30) }, { score: 0.9, sem: 0.1, submitted_at: day(0) }], at);
  assert.ok(pooled.x < 0.7, `a single lucky attempt is diluted: ${pooled.x}`);
  assert.ok(pooled.e < 0.1, "more attempts narrow the error");
  const improved = assess.scoreOfRecord([{ score: 0.4, sem: 0.1, submitted_at: day(400) }, { score: 0.85, sem: 0.1, submitted_at: day(0) }], at);
  assert.ok(improved.x > 0.7, `genuine improvement over a long gap counts: ${improved.x}`);
  // Monte Carlo: "retake until above the bar" inflates far less under pooling than under best-of.
  let bestInfl = 0, pooledInfl = 0; const N = 2000;
  for (let i = 0; i < N; i++) {
    const tries = []; for (let k = 0; k < 3; k++) { const z = Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random()); tries.push({ score: 0.6 + 0.08 * z, sem: 0.08, submitted_at: day(60 - 30 * k) }); if (tries[k].score >= 0.7) break; }
    bestInfl += Math.max(...tries.map(t => t.score)) - 0.6; pooledInfl += assess.scoreOfRecord(tries, at).x - 0.6;
  }
  assert.ok(pooledInfl / N < 0.5 * bestInfl / N, `pooled ${(pooledInfl / N).toFixed(3)} vs best ${(bestInfl / N).toFixed(3)}`);
});
await check("Assessment attempts: randomised forms, cooldown, yearly cap, rapid guesses, integrity hold", async () => {
  const db = await setup();
  const cand = await makeCandidate(db, "Test Taker");
  const items = Array.from({ length: 30 }, (_, i) => ({ stem: `Q${i}: In Tally, which voucher records a sale ${i}?`, options: ["Sales", "Receipt", "Payment", "Contra"], answerIndex: 0, difficulty: i % 3 === 0 ? 0.8 : i % 3 === 1 ? 0.5 : 0.3 }));
  const aid = await assess.createAssessment(db, { ownerKind: "platform", skillId: "tally", title: "Tally basics", itemsPerForm: 10, timeLimitSec: 600, items }, "admin");
  const { attemptId } = await assess.startAttempt(db, cand, aid);
  const q = await assess.attemptQuestions(db, attemptId, cand);
  assert.equal(q.questions.length, 10);
  assert.ok(!JSON.stringify(q).includes("answer"), "no answers sent to the browser");
  const answers = q.questions.map((qq, i) => ({ itemId: qq.itemId, choice: qq.options.indexOf("Sales"), ms: i < 2 ? 800 : 9000 }));
  const res = await assess.submitAttempt(db, attemptId, cand, answers, { hidden: 0, pastes: 0 });
  assert.equal(Math.round(res.score * 10), 8, "two rapid guesses count as wrong");
  await rejects(assess.startAttempt(db, cand, aid), "COOLDOWN");
  tick(31 * 86_400_000);
  const second = await assess.startAttempt(db, cand, aid);
  const q2 = await assess.attemptQuestions(db, second.attemptId, cand);
  const overlap = q2.questions.filter(x => q.questions.some(y => y.itemId === x.itemId)).length;
  assert.ok(overlap <= 2, `retake reuses few items (${overlap}/10)`);
  const held = await assess.submitAttempt(db, second.attemptId, cand, q2.questions.map(x => ({ itemId: x.itemId, choice: 0, ms: 9000 })), { hidden: 6, pastes: 2 });
  assert.equal(held.onHold, true);
  const ev = await assess.skillEvidence(db, cand);
  assert.ok(ev.tally && ev.tally.label.includes("80%"), "held attempt not used; first attempt is the score of record");
  await assess.decideHeldAttempt(db, second.attemptId, false, "admin");
  assert.ok((await assess.skillEvidence(db, cand)).tally.label.includes("80%"), "voided attempt never counts");
  await rejects(assess.decideHeldAttempt(db, second.attemptId, true, "admin"), "NOT_FOUND");
  tick(31 * 86_400_000);
  await assess.startAttempt(db, cand, aid);
  tick(31 * 86_400_000);
  await rejects(assess.startAttempt(db, cand, aid), "ATTEMPT_LIMIT");
  tick(-93 * 86_400_000);
});
await check("Company assessments need admin approval and cannot ask about protected traits", async () => {
  const db = await setup();
  const bad = [{ stem: "What is your religion and marital status?", options: ["A", "B"], answerIndex: 0 }, ...Array.from({ length: 6 }, (_, i) => ({ stem: `GST rate question ${i}`, options: ["5%", "18%"], answerIndex: 1 }))];
  await rejects(assess.createAssessment(db, { ownerKind: "company", companyId: "c", jdId: "j", skillId: "gst", title: "GST", itemsPerForm: 5, timeLimitSec: 300, items: bad }, "u"), "INVALID_ASSESSMENT");
  const id = await assess.createAssessment(db, { ownerKind: "company", companyId: "c", jdId: "j", skillId: "gst", title: "GST", itemsPerForm: 5, timeLimitSec: 300, items: bad.slice(1) }, "u");
  const cand = await makeCandidate(db, "Some One");
  await rejects(assess.startAttempt(db, cand, id), "NOT_AVAILABLE");
  await assess.decideAssessment(db, id, true, "admin");
  assert.ok((await assess.startAttempt(db, cand, id)).attemptId);
});
await check("Queue scores every live JD and releases automatically within parameters", async () => {
  const db = await setup();
  const comp = await makeCompany(db);
  const jd = await liveJd(db, comp);
  const good = await makeCandidate(db, "Good Match", { profile: fakeProfile({ skills: [...fakeProfile().skills, { id: "tds", name: "TDS", family: "direct-tax", evidence: "work", months: 40, lastUsedYear: 2026, snippet: "" }, { id: "excel", name: "MS Excel", family: "office", evidence: "work", months: 40, lastUsedYear: 2026, snippet: "" }, { id: "lang-bengali", name: "Bengali", family: "language", evidence: "listed", months: 0, lastUsedYear: null, snippet: "" }, { id: "lang-english", name: "English", family: "language", evidence: "listed", months: 0, lastUsedYear: null, snippet: "" }] }) });
  const poor = await makeCandidate(db, "Poor Match", { profile: fakeProfile({ skills: [{ id: "cold-calling", name: "Cold calling", family: "sales", evidence: "work", months: 30, lastUsedYear: 2026, snippet: "" }], india: { ...fakeProfile().india, roleFamily: "sales-bd" } }) });
  let out; do { out = await queue.drainQueue(db, SECRET); } while (out.remaining > 0);
  const rows = (await db.prepare("SELECT candidate_id, score, lower_bound, hard_pass, explanation FROM matches WHERE jd_id = ?").bind(jd).all()).results;
  assert.equal(rows.length, 2);
  for (const r of rows) assert.ok(JSON.parse(r.explanation).summary, "every score has an explanation");
  const rel = (await db.prepare("SELECT candidate_id FROM releases WHERE jd_id = ? AND revoked_at IS NULL").bind(jd).all()).results.map(r => r.candidate_id);
  assert.deepEqual(rel, [good], JSON.stringify(rows.map(r => [r.candidate_id === good ? "good" : "poor", r.score, r.lower_bound, r.hard_pass])));
  assert.ok(!rel.includes(poor));
});


// ---------- Future services data model ----------
await check("Services catalogue, orders and enrolments link to the candidate; payments are a stub", async () => {
  const db = await setup();
  const { seedServices } = await mod("plans.ts");
  await seedServices(db);
  const svc = await db.prepare("SELECT id, active FROM services WHERE code = 'spoken-english'").first();
  assert.equal(svc.active, 0, "seeded inactive: no service screens in Phase 1");
  const cand = await makeCandidate(db, "Service Buyer");
  await db.batch([
    db.prepare("INSERT INTO payment_intents (id, payer_kind, payer_id, purpose, ref_id, amount_inr, created_at) VALUES ('pi1', 'candidate', ?, 'service_order', 'o1', 4999, ?)").bind(cand, clock.toISOString()),
    db.prepare("INSERT INTO service_orders (id, candidate_id, service_id, status, amount_inr, payment_intent_id, created_at, updated_at) VALUES ('o1', ?, ?, 'awaiting_payment', 4999, 'pi1', ?, ?)").bind(cand, svc.id, clock.toISOString(), clock.toISOString()),
    db.prepare("INSERT INTO service_enrolments (id, order_id, candidate_id, batch_code, created_at) VALUES ('e1', 'o1', ?, 'SE-2027-01', ?)").bind(cand, clock.toISOString()),
  ]);
  assert.equal((await db.prepare("SELECT status FROM payment_intents WHERE id = 'pi1'").first()).status, "stub");
  const { r2Keys } = await candidate.deleteCandidateData(db, cand, "candidate");
  assert.ok(r2Keys.length >= 1);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM service_orders WHERE candidate_id = ?").bind(cand).first()).n, 0, "orders and enrolments go with account deletion");
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM service_enrolments").first()).n, 0);
  const stub = await db.prepare("SELECT status, display_name, dedupe_email_hash FROM candidates WHERE id = ?").bind(cand).first();
  assert.deepEqual([stub.status, stub.display_name, stub.dedupe_email_hash], ["deleted", "", ""], "only a content-free stub remains");
});

// ---------- client workspace ----------
const INVITE = { displayName: "Example Infotech", legalName: "Example Infotech Pvt Ltd", city: "Kolkata", ownerEmail: "owner@example-infotech.test", ownerName: "Owner", guaranteeDays: 90, nonSolicitMonths: 12, feeTerms: "8.33% of fixed CTC", params: PARAMS, plan: "free" };

await check("Admin-invited client: owner sets a password from a one-time link; no public registration needed", async () => {
  const db = await setup();
  const out = await client.inviteClient(db, INVITE, "admin");
  const co = await db.prepare("SELECT status, guarantee_days, non_solicit_months FROM companies WHERE id = ?").bind(out.companyId).first();
  assert.deepEqual([co.status, co.guarantee_days, co.non_solicit_months], ["active", 90, 12]);
  assert.ok(await company.currentParams(db, out.companyId), "parameters approved");
  assert.equal((await quota.quotaStatus(db, out.companyId)).remaining, 3, "starting plan assigned");
  await rejects(accounts.signIn(db, INVITE.ownerEmail, "anything at all here", "t"), "BAD_CREDENTIALS");
  await accounts.redeemToken(db, out.token, "invite", "copper meadow 5520 window");
  const token = await accounts.signIn(db, INVITE.ownerEmail, "copper meadow 5520 window", "t");
  const acc = await accounts.accountFromToken(db, token);
  assert.deepEqual([acc.kind, acc.companyId, acc.companyRole], ["company_user", out.companyId, "owner"]);
  await rejects(accounts.redeemToken(db, out.token, "invite", "another long password 99"), "INVALID_LINK");
  await rejects(client.inviteClient(db, INVITE, "admin"), "EMAIL_TAKEN");
  await rejects(client.inviteClient(db, { ...INVITE, ownerEmail: "x@example.test", params: { minScore: 5 } }, "admin"), "INVALID_PARAMS");
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM companies").first()).n, 1, "a failed invite leaves nothing behind");
});

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

await check("Pipeline: unlock first; stage order and reasons enforced; joining creates a placement with guarantee and non-solicit dates", async () => {
  const { db, comp, jd, cands, refs } = await releasedSetup(2);
  await rejects(client.addToPipeline(db, comp.id, comp.userId, refs[cands[0]], jd), "NOT_UNLOCKED");
  await quota.unlockCandidate(db, { companyId: comp.id, userId: comp.userId, candidateRef: refs[cands[0]], jdId: jd });
  const { id } = await client.addToPipeline(db, comp.id, comp.userId, refs[cands[0]], jd);
  assert.equal((await client.addToPipeline(db, comp.id, comp.userId, refs[cands[0]], jd)).created, false);
  await rejects(client.moveStage(db, comp.id, comp.userId, id, { stage: "joined", joiningDate: "2026-11-09" }), "STAGE_ORDER");
  await rejects(client.moveStage(db, comp.id, comp.userId, id, { stage: "rejected" }), "REASON");
  const iv = await client.scheduleInterview(db, comp.id, comp.userId, id, { round: "Technical 1", scheduledAt: "2026-11-12T05:30:00Z", mode: "video", interviewer: "Lead" });
  let view = (await client.pipelineView(db, comp.id))[0];
  assert.equal(view.stage, "interview", "scheduling moves a shortlisted candidate to interviewing");
  let ov = await client.clientOverview(db, comp.id);
  assert.equal(ov.upcoming.length, 1);
  tick(4 * 86_400_000);
  ov = await client.clientOverview(db, comp.id);
  assert.deepEqual([ov.upcoming.length, ov.needsFeedback.length], [0, 1], "a past interview without feedback is flagged");
  await client.recordInterview(db, comp.id, comp.userId, iv.id, { status: "completed", outcome: "advance", rating: 4, feedback: "Strong on SQL" });
  await client.moveStage(db, comp.id, comp.userId, id, { stage: "offered", offerCtcInr: 1_200_000 });
  await rejects(client.moveStage(db, comp.id, comp.userId, id, { stage: "offer_accepted" }), "JOINING_DATE");
  await client.moveStage(db, comp.id, comp.userId, id, { stage: "offer_accepted", joiningDate: "2026-12-14", lastWorkingDay: "2026-12-12", competingOffers: "one other offer" });
  ov = await client.clientOverview(db, comp.id);
  assert.match(ov.joining[0].checkpoint.label, /T-30/, "the next joining check-in is shown");
  assert.equal(client.nextCheckpoint("2026-12-14", "2026-12-08").label, "Check in now (T-7)");
  assert.equal(client.nextCheckpoint("2026-12-14", "2026-12-20").daysLeft < 0, true);
  await rejects(client.moveStage(db, comp.id, comp.userId, id, { stage: "joined", joiningDate: "2026-12-14" }), "JOINING_DATE");
  tick(35 * 86_400_000);
  await client.moveStage(db, comp.id, comp.userId, id, { stage: "joined", joiningDate: "2026-12-14" });
  const pl = await db.prepare("SELECT joined_on, guarantee_ends_on, non_solicit_until, ctc_inr, status FROM placements").first();
  assert.deepEqual([pl.joined_on, pl.guarantee_ends_on, pl.non_solicit_until, pl.ctc_inr, pl.status], ["2026-12-14", "2027-02-12", "2027-12-14", 1_200_000, "active"]);
  ov = await client.clientOverview(db, comp.id);
  assert.deepEqual([ov.funnel.joined, ov.placements[0].inGuarantee, ov.metrics.offerAcceptance], [1, true, 100]);
  const exit = await client.reportPlacementExit(db, comp.id, comp.userId, (await db.prepare("SELECT id FROM placements").first()).id, "2027-02-01", "Resigned");
  assert.equal(exit.inGuarantee, true);
  tick(-39 * 86_400_000);
});

await check("Another company cannot read or change this company's pipeline, interviews or placements", async () => {
  const { db, comp, jd, cands, refs } = await releasedSetup(1);
  await quota.unlockCandidate(db, { companyId: comp.id, userId: comp.userId, candidateRef: refs[cands[0]], jdId: jd });
  const { id } = await client.addToPipeline(db, comp.id, comp.userId, refs[cands[0]], jd);
  const iv = await client.scheduleInterview(db, comp.id, comp.userId, id, { round: "HR", scheduledAt: "2026-11-20T05:30:00Z", mode: "phone" });
  const other = await makeCompany(db, "Other Co");
  await company.activateCompany(db, other.id, PARAMS, "admin");
  assert.equal((await client.pipelineView(db, other.id)).length, 0);
  await rejects(client.moveStage(db, other.id, other.userId, id, { stage: "rejected", reason: "other" }), "NOT_FOUND");
  await rejects(client.scheduleInterview(db, other.id, other.userId, id, { round: "x", scheduledAt: "2026-11-20T05:30:00Z", mode: "video" }), "NOT_FOUND");
  await rejects(client.recordInterview(db, other.id, other.userId, iv.id, { status: "completed" }), "NOT_FOUND");
  await rejects(client.addToPipeline(db, other.id, other.userId, refs[cands[0]], jd), "NOT_FOUND");
  assert.equal((await client.clientOverview(db, other.id)).upcoming.length, 0);
});

await check("Jobboard300 submissions: managed live job, candidate consent and hidden list respected; no unlock quota used", async () => {
  const { db, comp, jd } = await releasedSetup(0);
  const before = (await quota.quotaStatus(db, comp.id)).remaining;
  const cand = await makeCandidate(db, "Managed Candidate");
  await rejects(client.submitByRecruiter(db, SECRET, { companyId: comp.id, jdId: jd, candidateId: cand, note: "Fits" }, "admin"), "NOT_MANAGED");
  await client.setJdService(db, comp.id, jd, "managed", 2, comp.userId);
  await rejects(client.submitByRecruiter(db, SECRET, { companyId: comp.id, jdId: jd, candidateId: cand, note: "" }, "admin"), "NOTE");
  const noConsent = await makeCandidate(db, "No Consent", { consentShare: false });
  await rejects(client.submitByRecruiter(db, SECRET, { companyId: comp.id, jdId: jd, candidateId: noConsent, note: "Fits" }, "admin"), "NO_CONSENT");
  const hider = await makeCandidate(db, "Hider");
  await db.prepare("UPDATE candidates SET hidden_company_ids = ? WHERE id = ?").bind(JSON.stringify([comp.id]), hider).run();
  await rejects(client.submitByRecruiter(db, SECRET, { companyId: comp.id, jdId: jd, candidateId: hider, note: "Fits" }, "admin"), "HIDDEN");
  const out = await client.submitByRecruiter(db, SECRET, { companyId: comp.id, jdId: jd, candidateId: cand, note: "4 yrs Tally and GST; 30 days notice" }, "admin");
  assert.equal(out.ref, await dbm.candidateRef(SECRET, comp.id, cand), "same reference the company would see");
  await rejects(client.submitByRecruiter(db, SECRET, { companyId: comp.id, jdId: jd, candidateId: cand, note: "again" }, "admin"), "ALREADY_SUBMITTED");
  assert.equal((await quota.quotaStatus(db, comp.id)).remaining, before, "no unlock quota used");
  const view = (await client.pipelineView(db, comp.id))[0];
  assert.deepEqual([view.stage, view.source, view.recruiterNote, view.name], ["submitted", "job_point", "4 yrs Tally and GST; 30 days notice", "Managed Candidate"]);
  await quota.unlockCandidate(db, { companyId: comp.id, userId: comp.userId, candidateRef: out.ref, jdId: jd }).then(r => assert.equal(r.charged, false, "already accessible; nothing charged"));
  await client.moveStage(db, comp.id, comp.userId, view.id, { stage: "shortlisted" });
});

await check("Withdrawn consent hides the candidate in the pipeline and cancels interviews; deletion erases pipeline notes, keeps the placement record", async () => {
  const { db, comp, jd, cands, refs } = await releasedSetup(2);
  for (const c of cands) await quota.unlockCandidate(db, { companyId: comp.id, userId: comp.userId, candidateRef: refs[c], jdId: jd });
  const a = await client.addToPipeline(db, comp.id, comp.userId, refs[cands[0]], jd);
  const b = await client.addToPipeline(db, comp.id, comp.userId, refs[cands[1]], jd);
  await client.scheduleInterview(db, comp.id, comp.userId, a.id, { round: "Technical 1", scheduledAt: "2026-11-20T05:30:00Z", mode: "video" });
  await client.moveStage(db, comp.id, comp.userId, b.id, { stage: "offered" });
  await client.moveStage(db, comp.id, comp.userId, b.id, { stage: "offer_accepted", joiningDate: "2026-11-09" });
  await client.moveStage(db, comp.id, comp.userId, b.id, { stage: "joined", joiningDate: "2026-11-09" });
  await consent.withdrawSharing(db, cands[0], "candidate");
  const row = (await client.pipelineView(db, comp.id)).find(r => r.id === a.id);
  assert.deepEqual([row.name, row.available, row.stage, row.interviews.length], ["Candidate withdrew consent", false, "withdrawn", 0]);
  assert.equal((await db.prepare("SELECT status FROM interviews WHERE pipeline_id = ?").bind(a.id).first()).status, "cancelled");
  await rejects(client.moveStage(db, comp.id, comp.userId, a.id, { stage: "shortlisted" }), "CONSENT_WITHDRAWN");
  await candidate.deleteCandidateData(db, cands[1], "candidate");
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM pipeline WHERE candidate_id = ?").bind(cands[1]).first()).n, 0);
  const pl = await db.prepare("SELECT status, title FROM placements WHERE candidate_id = ?").bind(cands[1]).first();
  assert.ok(pl && pl.status === "active", "placement record kept for the consultancy's accounts");
  assert.equal((await client.clientOverview(db, comp.id)).placements[0].name, "Candidate", "no name after deletion");
});

await check("A placed candidate who withdraws consent is no longer named in the company's hires", async () => {
  const { db, comp, jd, cands, refs } = await releasedSetup(1);
  await quota.unlockCandidate(db, { companyId: comp.id, userId: comp.userId, candidateRef: refs[cands[0]], jdId: jd });
  const { id } = await client.addToPipeline(db, comp.id, comp.userId, refs[cands[0]], jd);
  await client.moveStage(db, comp.id, comp.userId, id, { stage: "offered" });
  await client.moveStage(db, comp.id, comp.userId, id, { stage: "offer_accepted", joiningDate: "2026-11-09" });
  await client.moveStage(db, comp.id, comp.userId, id, { stage: "joined", joiningDate: "2026-11-09" });
  assert.equal((await client.clientOverview(db, comp.id)).placements[0].name, "Cand A");
  await consent.withdrawSharing(db, cands[0], "candidate");
  const after = (await client.clientOverview(db, comp.id)).placements;
  assert.deepEqual([after.length, after[0].name, after[0].status], [1, "Candidate", "active"], "business record kept, name hidden");
});

await check("Concurrent stage changes: the losing request changes nothing (application and interviews included)", async () => {
  const { db, comp, jd, cands, refs } = await releasedSetup(1);
  await quota.unlockCandidate(db, { companyId: comp.id, userId: comp.userId, candidateRef: refs[cands[0]], jdId: jd });
  await candidate.applyToJd(db, cands[0], jd);
  const { id } = await client.addToPipeline(db, comp.id, comp.userId, refs[cands[0]], jd);
  await client.scheduleInterview(db, comp.id, comp.userId, id, { round: "Technical 1", scheduledAt: "2026-11-20T05:30:00Z", mode: "video" });
  const out = await Promise.allSettled([
    client.moveStage(db, comp.id, comp.userId, id, { stage: "offered" }),
    client.moveStage(db, comp.id, comp.userId, id, { stage: "rejected", reason: "other" }),
  ]);
  assert.equal(out.filter(r => r.status === "fulfilled").length, 1, "exactly one change wins");
  assert.equal(out.find(r => r.status === "rejected").reason.code, "CONFLICT");
  const stage = (await db.prepare("SELECT stage FROM pipeline WHERE id = ?").bind(id).first()).stage;
  const app = (await db.prepare("SELECT status FROM portal_applications WHERE candidate_id = ? AND jd_id = ?").bind(cands[0], jd).first()).status;
  const iv = (await db.prepare("SELECT status FROM interviews WHERE pipeline_id = ?").bind(id).first()).status;
  const events = (await db.prepare("SELECT COUNT(*) AS n FROM pipeline_events WHERE pipeline_id = ? AND stage IN ('offered','rejected')").bind(id).first()).n;
  assert.deepEqual([app, iv, events], stage === "offered" ? ["offer", "scheduled", 1] : ["rejected", "cancelled", 1], `application, interview and history follow the winner (${stage})`);
});

// ---------- one candidate list (website + portal) ----------
const { buildFixtures } = await import("./ats-fixtures.mjs");
const { accountantPdf } = await buildFixtures();
const WEB = (over = {}) => ({ id: `app-${Math.random().toString(36).slice(2, 9)}`, jobId: null, fullName: "Riya Sen", email: "riya.sen@example.com", phone: "+91 98300 12345", location: "Durgapur", shareConsent: true, futureConsent: true, privacyVersion: "2026-11-09", resumeName: "riya-sen.pdf", ...over });
const consentRows = (db, id) => db.prepare("SELECT purpose, action, channel, notice_version FROM candidate_consents WHERE candidate_id = ? ORDER BY rowid").bind(id).all().then(r => r.results);

await check("Website registration with both ticks joins the candidate list: CV read, matched, submittable by a recruiter, never auto-released", async () => {
  const db = await setup();
  const comp = await makeCompany(db); const jd = await liveJd(db, comp);
  await client.setJdService(db, comp.id, jd, "managed", 1, comp.userId);
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
  await client.setJdService(db, comp.id, jd, "managed", 1, comp.userId);
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
  await client.setJdService(t.db, t.compK.id, t.jdK, "managed", 1, t.compK.userId);
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
  await client.setJdService(t.db, t.compK.id, t.jdK, "managed", 1, t.compK.userId);
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
  assert.deepEqual(notices, ["submission", "stage.shortlisted", "interview.scheduled"], "the client is told about staff updates, not about its own");
  assert.equal((await notify.companyNotices(t.db, t.compF.id)).length, 0);
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

await check("WhatsApp sender: the client's team number first, admin as fallback, admin override wins; nothing is sent without a provider", async () => {
  const t = await staffSetup();
  const cand = await makeCandidate(t.db, "Queue Candidate");
  const last = async () => t.db.prepare("SELECT sender_scope, status, status_detail FROM messages WHERE channel != 'inbox' ORDER BY rowid DESC LIMIT 1").first();
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
  await client.setJdService(t.db, t.compK.id, t.jdK, "managed", 1, t.compK.userId);
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
  assert.equal(policy.selfService(undefined), false);
  const t = await staffSetup();
  await client.setJdService(t.db, t.compK.id, t.jdK, "managed", 1, t.compK.userId);
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
  const relive = async () => { await company.submitJd(t.db, t.compK.id, t.jdK, t.compK.userId); await company.decideJd(t.db, t.jdK, true, "admin"); };
  const req = JSON.parse((await t.db.prepare("SELECT requirements FROM jds WHERE id = ?").bind(t.jdK).first()).requirements);
  for (let i = 0; i < 3; i++) { await company.updateJdRequirements(t.db, t.compK.id, t.jdK, req, t.compK.userId); await relive(); }
  await rejects(company.updateJdRequirements(t.db, t.compK.id, t.jdK, req, t.compK.userId), "EDIT_LIMIT");
  await client.setJdService(t.db, t.compK.id, t.jdK, "managed", 1, t.compK.userId);
  const cand = await makeCandidate(t.db, "Hidden Person");
  await t.db.prepare("UPDATE candidates SET hidden_company_names = ? WHERE id = ?").bind(JSON.stringify(["kolkata client pvt. ltd."]), cand).run();
  await rejects(rankedSubmit(t, t.recA, { jdId: t.jdK, candidateId: cand, note: "x" }), "HIDDEN");
  assert.equal(policy.nameKey("Kolkata Client Private Limited"), policy.nameKey("KOLKATA CLIENT"));
});

await check("Recruiters see the three best candidates at a time, without scores; passing with a reason brings up the next", async () => {
  const t = await staffSetup();
  await client.setJdService(t.db, t.compK.id, t.jdK, "managed", 1, t.compK.userId);
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
});

await check("Aptitude and client tests go only to invited candidates; the offer commitment and early-leaver priority work", async () => {
  const t = await staffSetup();
  await client.setJdService(t.db, t.compK.id, t.jdK, "managed", 1, t.compK.userId);
  const [, apt] = await adaptive.loadSampleBanks(t.db, "admin");
  const cand = await makeCandidate(t.db, "Invited Person"), other = await makeCandidate(t.db, "Steady Person");
  const args = { bankId: apt, candidateId: cand, jdId: t.jdK, companyId: t.compK.id };
  await rejects(adaptive.inviteToTest(t.db, args, t.recA.id), "NOT_OPTED");
  await t.db.prepare("UPDATE jds SET aptitude_test = 1 WHERE id = ?").bind(t.jdK).run();
  const inv = await adaptive.inviteToTest(t.db, args, t.recA.id);
  await rejects(adaptive.inviteToTest(t.db, args, t.recA.id), "ALREADY");
  const token = new URL(inv.link).searchParams.get("token");
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
  assert.ok((await adaptive.inviteToTest(t.db, { ...args, bankId: clientBank }, t.recA.id)).link.includes("/test?token="));
  assert.ok(!JSON.stringify(await client.pipelineView(t.db, t.compK.id, undefined, true)).match(/final_level|band|beginner/), "the client never sees test levels");

  // Offer-stage commitment
  const sub = await rankedSubmit(t, t.recA, { jdId: t.jdK, candidateId: cand, note: "Fit" });
  for (const stage of ["shortlisted", "interview"]) await client.moveStage(t.db, t.compK.id, t.compK.userId, sub.id, { stage });
  await rejects(commitment.reissueCommitmentLink(t.db, sub.id, "staff"), "NOT_FOUND");
  await client.moveStage(t.db, t.compK.id, t.compK.userId, sub.id, { stage: "offered", offerCtcInr: 800_000 });
  assert.ok((await kinds(t.db, cand)).includes("commitment.requested"));
  const link = await commitment.reissueCommitmentLink(t.db, sub.id, "staff"), ctoken = new URL(link).searchParams.get("token");
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
  assert.deepEqual((await client.submissionCandidates(t.db, t.jdF)).map(c => c.candidate_id), [other, cand], "a recent early leaver ranks after everyone else");
  clock = new Date("2028-01-05T06:00:00Z");
  assert.deepEqual((await client.submissionCandidates(t.db, t.jdF)).map(c => c.candidate_id), [cand, other], "after 12 months the ranking is by fit again");
  clock = new Date("2026-11-09T06:00:00Z");
});

console.log(`\n${passed} portal checks passed.`);
