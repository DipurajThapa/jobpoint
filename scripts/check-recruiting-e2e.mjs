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
await admin.ctx.request.fetch(`${BASE}/api/platform/admin/users/${rinaId}`, { method: "PATCH", data: { access: { recruiting: "none" } }, headers: { origin: BASE } });
ok((await rina.get("/api/platform/recruiting/work")).status() === 403, "removing the tool removes access at once");
await browser.close();
console.log(`\n${passed} recruiting end-to-end checks passed. Screenshots: ${OUT}`);
