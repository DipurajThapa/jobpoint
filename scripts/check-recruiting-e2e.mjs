// End-to-end check of the Recruiting tool (Jobboard300 staff roles and assignment)
// against the local dev server. Run it after check-platform.mjs and
// check-portal-e2e.mjs on the same local database: it uses their fictional
// administrator account and client companies, and invites two fresh recruiters.
//   node scripts/check-recruiting-e2e.mjs [screenshot-dir]
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const BASE = process.env.PORTAL_URL ?? "http://127.0.0.1:5173";
const OUT = resolve(process.argv[2] ?? "test-results/recruiting");
mkdirSync(OUT, { recursive: true });
let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; console.log("PASS", msg); };

const browser = await chromium.launch();
async function signedIn(email, password) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2 });
  await ctx.route(u => !u.toString().startsWith(BASE) && !/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u.toString()), r => r.abort());
  const r = await ctx.request.post(`${BASE}/api/platform/auth/sign-in`, { data: { email, password }, headers: { origin: BASE } });
  assert.ok(r.ok(), `${email} signs in: ${r.status()}`);
  const call = (method, path, data) => ctx.request.fetch(`${BASE}${path}`, { method, data, headers: { origin: BASE } });
  return { ctx, get: p => call("GET", p), post: (p, d) => call("POST", p, d) };
}
const admin = await signedIn("admin@example.test", "blue lantern harbour 61");
// Two fresh recruiters, invited by the admin with the Recruiting tool only.
const PASSWORD = "harbour meadow lantern 58", stamp = Date.now().toString(36);
async function invite(name) {
  const email = `${name.toLowerCase()}.${stamp}@example.test`;
  const r = await (await admin.post("/api/platform/admin/users", { email, name, access: { recruiting: "edit" } })).json();
  assert.ok(r.link, JSON.stringify(r));
  const accept = await (await browser.newContext()).request.post(`${BASE}/api/platform/auth/accept`, { data: { token: new URL(r.link).searchParams.get("token"), name, password: PASSWORD }, headers: { origin: BASE } });
  assert.ok(accept.ok(), `accept ${accept.status()}`);
  return { id: r.id, email };
}
const noorU = await invite("Noor"), rinaU = await invite("Rina");
const noorId = noorU.id, rinaId = rinaU.id;
const team = async name => (await (await admin.post("/api/platform/admin/operations", { action: "team.create", name })).json()).id;
const kolkata = await team(`Kolkata desk ${stamp}`), franchise = await team(`Franchise East ${stamp}`);
await admin.post("/api/platform/admin/operations", { action: "team.assign", id: kolkata, userId: noorId });
await admin.post("/api/platform/admin/operations", { action: "team.assign", id: franchise, userId: rinaId });

const all = await (await admin.get("/api/platform/recruiting/work")).json();
ok(all.role === "admin" && all.clients.length >= 2 && all.jobs.length >= 2, `the admin sees every client and job (${all.clients.length} clients, ${all.jobs.length} jobs)`);
const ferro = all.clients.find(c => c.display_name === "Demo Ferro Alloys"), other = all.clients.find(c => c.id !== ferro.id);
ok((await admin.post("/api/platform/recruiting/assign-team", { companyId: ferro.id, teamId: kolkata })).ok() && (await admin.post("/api/platform/recruiting/assign-team", { companyId: other.id, teamId: franchise })).ok(), "the admin assigns each client to a team");

const noor = await signedIn(noorU.email, PASSWORD);
const rina = await signedIn(rinaU.email, PASSWORD);
const nw = await (await noor.get("/api/platform/recruiting/work")).json(), rw = await (await rina.get("/api/platform/recruiting/work")).json();
ok(nw.role === "recruiter" && nw.clients.length === 1 && nw.clients[0].id === ferro.id && nw.jobs.every(j => j.company_id === ferro.id), "a recruiter sees only their team's client and its jobs");
ok(rw.clients.length === 1 && rw.clients[0].id === other.id && rw.jobs.every(j => j.company_id === other.id), "the other team sees only its own client");
const managed = nw.jobs.find(j => j.service === "managed");
ok(!!managed, "the team's managed search is listed");
ok((await rina.get(`/api/platform/recruiting/pipeline?jd=${managed.id}`)).status() === 404 && (await rina.get(`/api/platform/recruiting/candidates?jd=${managed.id}`)).status() === 404, "another team cannot read this job's pipeline or candidates");
const anon = await browser.newContext();
ok((await anon.request.get(`${BASE}/api/platform/recruiting/work`)).status() === 401, "anonymous requests are refused");
ok((await noor.post("/api/platform/recruiting/assign-team", { companyId: other.id, teamId: kolkata })).status() === 403, "a recruiter cannot reassign clients");
ok((await noor.post("/api/platform/recruiting/assign-recruiter", { jdId: managed.id, userId: noorId })).status() === 403, "a recruiter cannot assign jobs");
ok((await noor.ctx.request.fetch(`${BASE}/api/platform/recruiting/stage`, { method: "POST", data: {}, headers: { origin: "https://evil.example" } })).status() === 403, "cross-site changes are refused");

const cands = (await (await noor.get(`/api/platform/recruiting/candidates?jd=${managed.id}`)).json()).candidates;
const pick = cands.find(c => Number(c.can_share) && !Number(c.in_pipeline));
ok(!!pick, `the recruiter sees ranked candidates for the managed job (${cands.length})`);
const adminCands = (await (await admin.get(`/api/platform/recruiting/candidates?jd=${managed.id}`)).json()).candidates;
ok(cands.length <= 3 && cands.every(c => !("score" in c) && !("lower_bound" in c)) && adminCands.length > 3 && "score" in adminCands[0], `recruiters see at most three candidates and no scores; the admin sees the full list (${adminCands.length})`);
const hiddenOne = adminCands.find(c => !cands.some(x => x.candidate_id === c.candidate_id) && !Number(c.in_pipeline));
ok((await noor.post("/api/platform/recruiting/submit", { jdId: managed.id, candidateId: hiddenOne.candidate_id, note: "not on my shortlist" })).status() === 404, "a recruiter cannot submit a candidate who is not on their current shortlist");
const skipped = cands.find(c => c.candidate_id !== pick.candidate_id);
ok((await noor.post("/api/platform/recruiting/pass", { jdId: managed.id, candidateId: skipped.candidate_id, reason: "" })).status() === 400 && (await noor.post("/api/platform/recruiting/pass", { jdId: managed.id, candidateId: skipped.candidate_id, reason: "skills_mismatch" })).ok(), "passing on a candidate needs a reason");
const next = (await (await noor.get(`/api/platform/recruiting/candidates?jd=${managed.id}`)).json()).candidates;
ok(!next.some(c => c.candidate_id === skipped.candidate_id) && next.some(c => c.candidate_id === pick.candidate_id) && next.length <= 3, "the passed candidate is replaced by the next best");
ok((await rina.post("/api/platform/recruiting/submit", { jdId: managed.id, candidateId: pick.candidate_id, note: "x" })).status() === 404, "another team cannot submit to this job");
ok((await noor.post("/api/platform/recruiting/submit", { jdId: managed.id, candidateId: pick.candidate_id, note: "Strong fit; 30 days notice" })).ok(), "the recruiter submits a candidate to the client");
const pipe = await (await noor.get(`/api/platform/recruiting/pipeline?jd=${managed.id}`)).json();
const entry = pipe.pipeline.find(e => e.stage === "submitted");
ok(!!entry, "the submission appears in the client's pipeline");
ok((await rina.post("/api/platform/recruiting/stage", { pipelineId: entry.id, stage: "shortlisted" })).status() === 404, "another team cannot update this candidate");
ok((await noor.post("/api/platform/recruiting/stage", { pipelineId: entry.id, stage: "shortlisted", note: "Client confirmed by phone" })).ok(), "the recruiter updates the candidate's stage");
ok((await noor.post("/api/platform/recruiting/interview", { pipelineId: entry.id, round: "Technical 1", scheduledAt: "2030-03-01T05:30:00.000Z", mode: "video", location: "https://meet.example/abc" })).ok(), "the recruiter schedules an interview");

ok((await admin.post("/api/platform/recruiting/team-manager", { teamId: kolkata, userId: noorId, manager: true })).ok(), "the admin makes Noor the team manager");
ok((await noor.post("/api/platform/recruiting/assign-recruiter", { jdId: managed.id, userId: rinaId })).status() === 400, "a manager cannot assign a job to someone outside the team");
ok((await noor.post("/api/platform/recruiting/assign-recruiter", { jdId: managed.id, userId: noorId })).ok(), "a manager assigns a job within the team");

// Team managers invite their own staff and set their team's WhatsApp number.
const inv = await noor.post("/api/platform/recruiting/team-invite", { teamId: kolkata, name: "New Recruiter", email: `new.${stamp}@example.test` });
const invBody = await inv.json();
ok(inv.status() === 201 && invBody.link.includes("/platform/accept?token="), "a team manager invites a recruiter into their own team and gets a one-time link");
ok((await rina.post("/api/platform/recruiting/team-invite", { teamId: kolkata, name: "X", email: `x.${stamp}@example.test` })).status() === 404, "a recruiter from another team cannot invite into this team");
ok((await noor.post("/api/platform/recruiting/team-invite", { teamId: franchise, name: "X", email: `y.${stamp}@example.test` })).status() === 404, "a manager cannot invite into another team");
const accepted = await (await browser.newContext()).request.post(`${BASE}/api/platform/auth/accept`, { data: { token: new URL(invBody.link).searchParams.get("token"), name: "New Recruiter", password: PASSWORD }, headers: { origin: BASE } });
const fresh = await signedIn(`new.${stamp}@example.test`, PASSWORD);
const fw = await (await fresh.get("/api/platform/recruiting/work")).json();
ok(accepted.ok() && fw.role === "recruiter" && fw.clients.length === 1 && fw.clients[0].id === ferro.id, "the invited recruiter signs in and sees only that team's client");
ok((await fresh.get("/api/platform/email-kit/state")).status() === 403, "the invited recruiter has the Recruiting tool only");
ok((await noor.post("/api/platform/recruiting/messaging", { scope: `team:${kolkata}`, number: "+91 98300 12345", enabled: true })).ok(), "a manager sets their team's WhatsApp number");
ok((await noor.post("/api/platform/recruiting/messaging", { scope: "admin", number: "+91 90000 00001", enabled: true })).status() === 403 && (await rina.post("/api/platform/recruiting/messaging", { scope: `team:${kolkata}`, number: "+91 90000 00002", enabled: true })).status() === 404, "nobody else can change the admin's or another team's WhatsApp set-up");
ok((await admin.post("/api/platform/recruiting/messaging", { scope: "admin", number: "+91 90000 00001", enabled: true, override: false })).ok(), "the admin sets the main WhatsApp number");

const page = await noor.ctx.newPage();
await page.goto(`${BASE}/platform/recruiting`, { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "Jobs" }).waitFor();
ok(await page.getByText("Demo Ferro Alloys").first().isVisible() && !(await page.getByText(other.display_name).count()), "the Recruiting screen lists only the team's work");
await page.locator(".pj-item", { has: page.getByText(managed.title, { exact: true }) }).getByRole("button", { name: "Open" }).click();
await page.getByText("Candidates to submit").waitFor();
await page.getByText("Interviewing").first().waitFor();
ok(true, "the job shows its pipeline with the updated stage");
await page.getByRole("heading", { name: "WhatsApp set-up" }).waitFor();
ok(await page.getByRole("heading", { name: "Invite a recruiter to your team" }).isVisible(), "the manager sees team invitations and the WhatsApp set-up");
await page.screenshot({ path: `${OUT}/recruiting.png`, fullPage: true });
// ---------- Assessments, Fast Track and the landing pages ----------
const inviteWith = async (name, access) => { const email = `${name.toLowerCase()}.${stamp}@example.test`; const r = await (await admin.post("/api/platform/admin/users", { email, name, access })).json(); await (await browser.newContext()).request.post(`${BASE}/api/platform/auth/accept`, { data: { token: new URL(r.link).searchParams.get("token"), name, password: PASSWORD }, headers: { origin: BASE } }); return signedIn(email, PASSWORD); };
const invig = await inviteWith("Invig", { assessments: "edit" });
ok((await noor.get("/api/platform/assessments/banks")).status() === 403 && (await invig.get("/api/platform/recruiting/work")).status() === 403, "only people given the Assessments tool can open question banks, and an invigilator sees nothing else");
ok((await invig.post("/api/platform/assessments/sample-load", {})).status() === 403 && (await invig.post("/api/platform/assessments/fast-track-settings", { priceInr: 1, payNote: "free for all now" })).status() === 403, "an invigilator cannot load samples or change Fast Track");
const banksBefore = (await (await admin.get("/api/platform/assessments/banks")).json()).banks;
if (!banksBefore.some(b => b.is_sample)) ok((await admin.post("/api/platform/assessments/sample-load", {})).ok(), "the admin loads the sample question banks");
const bankId = (await (await invig.post("/api/platform/assessments/bank-create", { kind: "technical", title: `SQL ${stamp}`, skillId: "sql" })).json()).id;
ok(!!bankId && (await invig.post("/api/platform/assessments/bank-status", { bankId, status: "active" })).status() === 400, "an invigilator creates a bank; it cannot go live without enough questions");
const bad = await invig.post("/api/platform/assessments/question-add", { bankId, level: 5, topic: "Joins", stem: "Which join returns only matching rows?", options: ["INNER JOIN", "LEFT JOIN", "All of the above"], answerIndex: 0 });
ok(bad.status() === 400 && /shuffled/.test((await bad.json()).error), "a question that depends on option order is refused");
const up = await (await invig.post("/api/platform/assessments/question-upload", { bankId, text: "level,topic,question,option 1,option 2,option 3,option 4,answer,explanation\n5,Joins,Which join returns only rows that match in both tables?,INNER JOIN,LEFT JOIN,RIGHT JOIN,CROSS JOIN,A,Inner joins keep matches only\n6,Keys,Which constraint stops duplicate values in a column?,UNIQUE,CHECK,DEFAULT,INDEX,UNIQUE,\n6,Keys,Broken row,One,Two,Three,Four,nothing," })).json();
ok(/2 question\(s\) added/.test(up.message) && up.errors.length === 1, `uploads add the good rows and report the bad ones (${up.message})`);
const qs = (await (await invig.get(`/api/platform/assessments/questions?bank=${bankId}`)).json()).questions;
ok(qs.length === 2 && qs.find(q => q.topic === "Keys").options[qs.find(q => q.topic === "Keys").answer_index] === "UNIQUE", "the stored answer key matches what was uploaded");
ok((await admin.post("/api/platform/assessments/fast-track-settings", { priceInr: 1499, payNote: "Pay by UPI to the Jobboard300 account and quote your reference." })).ok(), "the admin sets the Fast Track price and payment instructions");

const { DatabaseSync } = await import("node:sqlite");
const { readdirSync } = await import("node:fs");
const dbDir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject", sqlite = new DatabaseSync(`${dbDir}/${readdirSync(dbDir).find(f => f.endsWith(".sqlite"))}`, { readOnly: true });
const candEmail = sqlite.prepare("SELECT a.email FROM portal_accounts a JOIN candidates k ON k.account_id = a.id WHERE a.kind = 'candidate' AND k.status = 'active' AND k.fast_track_at IS NULL AND NOT EXISTS (SELECT 1 FROM fast_track_orders o WHERE o.candidate_id = k.id) ORDER BY a.email LIMIT 1").get().email;
const candCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const kapi = (method, path, data) => candCtx.request.fetch(`${BASE}${path}`, { method, data, headers: { origin: BASE } });
ok((await kapi("POST", "/api/portal/auth/sign-in", { email: candEmail, password: "quiet harbour lantern 2026" })).ok(), "a candidate signs in");
const sample = (await (await kapi("GET", "/api/portal/candidate/tests")).json());
ok(sample.fastTrack === false && sample.technical.length > 0 && (await kapi("POST", "/api/portal/candidate/test-start", { bankId: sample.technical[0].id })).status() === 402, "technical tests need Fast Track");
const order = await (await kapi("POST", "/api/portal/candidate/fasttrack-request", {})).json();
ok(/^FT-/.test(order.reference) && order.amount_inr === 1499 && (await (await kapi("GET", "/api/portal/candidate/tests")).json()).fastTrack === false, "the payment page gives an amount and a reference; asking is not paying");
const orders = (await (await admin.get("/api/platform/assessments/banks")).json()).fastTrack.orders;
ok((await admin.post("/api/platform/assessments/order-decide", { orderId: orders.find(o => o.reference === order.reference).id, paid: true, note: "UPI ref 778899" })).ok() && (await (await kapi("GET", "/api/portal/candidate/tests")).json()).fastTrack === true, "the candidate is Fast Track once the admin confirms the payment");
const sampleBank = sample.technical.find(b => /Sample/.test(b.title));
let step = await (await kapi("POST", "/api/portal/candidate/test-start", { bankId: sampleBank.id })).json(), seenStems = new Set();
ok(step.state === "question" && step.question.options.length === 4 && !JSON.stringify(step).match(/answer_index|Computed answer/), "the test serves one question at a time and never the answer");
const testId = step.id;
while (step.state === "question") { seenStems.add(step.question.stem); step = await (await kapi("POST", "/api/portal/candidate/test-answer", { testId, choice: 0 })).json(); }
ok(step.state === "done" && seenStems.size === 20 && ["beginner", "intermediate", "expert"].includes(step.band) && Array.isArray(step.weakTopics), `twenty different questions, then the candidate sees their level (${step.band}, level ${step.level}) and topics to prepare`);
const cTestPage = await candCtx.newPage();
await cTestPage.goto(`${BASE}/candidate`, { waitUntil: "networkidle" });
await cTestPage.getByRole("heading", { name: "Fast Track and tests" }).waitFor();
ok(await cTestPage.getByText("Your results").isVisible(), "the candidate page shows Fast Track and the result");
await cTestPage.screenshot({ path: `${OUT}/candidate-fast-track.png`, fullPage: true });

ok([403, 404].includes((await fresh.post("/api/platform/recruiting/job-aptitude", { jdId: managed.id, on: true })).status()) && (await noor.post("/api/platform/recruiting/job-aptitude", { jdId: managed.id, on: true })).ok(), "only a manager or the admin records that the client opted for the aptitude test");
const jobTests = (await (await noor.get(`/api/platform/recruiting/pipeline?jd=${managed.id}`)).json()).tests;
const aptBank = jobTests.banks.find(b => b.kind === "aptitude");
const testInvite = await (await noor.post("/api/platform/recruiting/test-invite", { pipelineId: entry.id, bankId: aptBank.id })).json();
const anonCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), token = new URL(testInvite.link).searchParams.get("token");
const tPage = await anonCtx.newPage();
await tPage.goto(`${BASE}/test?token=${token}`, { waitUntil: "networkidle" });
await tPage.getByRole("button", { name: "Start the test" }).click();
await tPage.getByText("Question 1 of 20").waitFor();
await tPage.locator("input[type=radio]").first().check();
await tPage.getByRole("button", { name: "Next" }).click();
await tPage.getByText("Question 2 of 20").waitFor();
ok(true, "an invited candidate opens the one-time link and takes the test without an account");
await tPage.screenshot({ path: `${OUT}/invited-test.png`, fullPage: true });
ok((await anonCtx.request.get(`${BASE}/api/portal/public/test?token=${"0".repeat(64)}`)).status() === 404 && (await anonCtx.request.post(`${BASE}/api/portal/public/test-answer`, { data: { token, choice: 0 }, headers: { origin: "https://evil.example" } })).status() === 403, "a wrong link is refused, and so is an answer sent from another site");
const staffSees = (await (await noor.get(`/api/platform/recruiting/pipeline?jd=${managed.id}`)).json()).pipeline.find(e => e.id === entry.id);
ok(staffSees.tests.length === 1 && staffSees.tests[0].status === "in_progress", "staff see the test's progress on the candidate");

for (const [path, text] of [["/employers", "7.5% to 8.33%"], ["/job-seekers", "Free to register and apply"], ["/terms/employers", "one replacement"], ["/terms/job-seekers", "at least 60 days"]]) {
  const r = await anonCtx.request.get(`${BASE}${path}`), body = await r.text();
  ok(r.ok() && body.includes(text) && !/West Bengal|13\+ years|90 days/.test(body), `${path} is live with the agreed terms`);
}
const lp = await anonCtx.newPage();
await lp.goto(`${BASE}/employers`, { waitUntil: "networkidle" });
await lp.screenshot({ path: `${OUT}/employers.png`, fullPage: true });
const enquiry = { contactName: "A Person", company: `Test Co ${stamp}`, email: `hr.${stamp}@example.com`, phone: "9830012345", roleTitle: "Developer", location: "Remote", headcount: "1", details: "Two years of experience in Java.", consent: "yes" };
ok((await anonCtx.request.post(`${BASE}/api/employer-enquiries`, { data: enquiry, headers: { origin: BASE } })).status() === 400 && (await anonCtx.request.post(`${BASE}/api/employer-enquiries`, { data: { ...enquiry, terms: "yes" }, headers: { origin: BASE } })).ok(), "an employer enquiry is accepted only with the terms for employers");

// Placement-fee model: the client cannot browse or unlock, sees a submitted candidate
// without contact details, and loses the profile when the process for them closes.
const clientCtx = await browser.newContext();
const capi = (method, path, data) => clientCtx.request.fetch(`${BASE}${path}`, { method, data, headers: { origin: BASE } });
ok((await capi("POST", "/api/portal/auth/sign-in", { email: "finance.lead@demo-ferro.example.com", password: "quiet harbour lantern 2026" })).ok(), "a client user signs in to the hiring portal");
const noMatches = await capi("GET", `/api/portal/company/matches?jd=${managed.id}`);
ok(noMatches.status() === 403 && (await noMatches.json()).code === "MANAGED_ONLY" && (await capi("POST", "/api/portal/company/unlock", { ref: entry.ref, jdId: managed.id })).status() === 403, "the client cannot browse matches or unlock profiles");
const dash = await (await capi("GET", "/api/portal/company/dashboard")).json();
ok(dash.selfService === false && dash.jds.every(j => j.released === 0 && j.unlocked === 0) && dash.overview.jobs.every(j => j.released === 0) && dash.quota.remaining === 0 && dash.terms.feePercent >= 7.5 && dash.terms.feePercent <= 8.33, "the client dashboard shows the fee terms and no match counts");
ok(!/score|lower_bound|explanation/i.test(JSON.stringify(dash)) && !/score|lower_bound|explanation/i.test(await (await capi("GET", "/api/portal/company/pipeline")).text()), "nothing the client receives carries scores or match reasons");
const prof = await capi("GET", `/api/portal/company/candidate?ref=${entry.ref}`), profBody = await prof.json();
ok(prof.ok() && profBody.contactsHidden === true && profBody.profile.contact.name && !profBody.profile.contact.email && !profBody.profile.contact.phone, "during the interview stage the client sees the profile without contact details");
const pdf = await capi("GET", `/api/portal/company/download?ref=${entry.ref}`);
ok(pdf.ok() && pdf.headers()["content-type"] === "application/pdf", "the client downloads a watermarked copy");
const rej = await noor.post("/api/platform/recruiting/stage", { pipelineId: entry.id, stage: "rejected", reason: "skills_gap" });
ok(rej.ok(), `the process for this candidate is closed (${rej.status()})`);
const after = await capi("GET", `/api/portal/company/candidate?ref=${entry.ref}`);
ok(after.status() === 403 && (await after.json()).code === "ACCESS_ENDED" && (await capi("GET", `/api/portal/company/download?ref=${entry.ref}`)).status() === 403, "once the process closes, the profile and CV are no longer available to the client");
const closed = (await (await capi("GET", "/api/portal/company/pipeline")).json()).pipeline.find(e => e.id === entry.id);
ok(closed.available === false && closed.name === `Candidate ${entry.ref}` && closed.recruiterNote === "", "the closed entry shows a reference, not a person");

await admin.ctx.request.fetch(`${BASE}/api/platform/admin/users/${rinaId}`, { method: "PATCH", data: { access: { recruiting: "none" } }, headers: { origin: BASE } });
ok((await rina.get("/api/platform/recruiting/work")).status() === 403, "removing the tool removes access at once");
await browser.close();
console.log(`\n${passed} recruiting end-to-end checks passed. Screenshots: ${OUT}`);
