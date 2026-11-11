// Who can reach what. Every check goes through the real API route handlers
// against a database built from the real migrations.
//
// The tests are written to find leaks, not to confirm the design: they sweep
// every route file for an authentication guard, try every cross-tenant id on
// every action, and search whole responses for the other tenant's data.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import { world, call, route, portalCookie, makeStaff, mods, root, SECRET, ORIGIN } from "./helpers/world.mjs";

const company = await route("portal/company/[action]");
const candidate = await route("portal/candidate/[action]");
const recruiting = await route("platform/recruiting/[action]");

const COMPANY_GETS = ["dashboard", "pipeline", "team", "candidate", "download", "jd"];
const CANDIDATE_GETS = ["jobs", "tests", "test", "applications", "inbox", "profile", "export", "companies"];

function routeFiles(dir = resolve(root, "app/api"), out = []) {
  for (const name of readdirSync(dir)) {
    const path = resolve(dir, name);
    if (statSync(path).isDirectory()) routeFiles(path, out); else if (name === "route.ts") out.push(path);
  }
  return out;
}

// Routes that are meant to work without signing in. Anything not listed here must refuse an anonymous caller.
const PUBLIC = new Set([
  "blog/media/[id] GET", // only published media; dedicated tests verify draft assets stay private
  "blog/engagement POST", // counters only for published articles; rate-limited, same-origin and no personal data
  "jobs GET", "applications POST", "employer-enquiries POST", "privacy-requests POST",
  "employer-enquiries GET", // free times for a call with a consultant: times only, no personal data
  "portal/registration POST", // public unified signup, protected by origin checks and rate limits
  "portal/auth/[action] POST", "portal/public/[action] GET", "portal/public/[action] POST",
  "platform/auth/sign-in POST", "platform/auth/sign-out POST", "platform/auth/accept POST",
]);

test("every API route refuses an anonymous caller unless it is on the public list", async () => {
  await world();
  const seen = [];
  for (const file of routeFiles()) {
    const key = relative(resolve(root, "app/api"), file).replace(/\/route\.ts$/, "");
    const mod = await import(file);
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      if (typeof mod[method] !== "function") continue;
      seen.push(`${key} ${method}`);
      if (PUBLIC.has(`${key} ${method}`)) continue;
      const res = await call(mod, method, `/api/${key}`, { params: { action: "dashboard", id: "x", type: "applications" }, body: method === "GET" ? undefined : {} });
      // The owner bootstrap route answers "not found" to everyone but the owner, by design.
      const refusals = key === "platform/owner" ? [401, 403, 404] : [401, 403];
      assert.ok(refusals.includes(res.status), `${method} /api/${key} answered ${res.status} to an anonymous caller: ${res.text.slice(0, 120)}`);
    }
  }
  assert.ok(seen.length >= 45, `expected to sweep every route, saw ${seen.length}`);
  for (const entry of PUBLIC) assert.ok(seen.includes(entry), `public list names a route that no longer exists: ${entry}`);
});

test("owner-only admin routes refuse forged, partial and development identities in production", async () => {
  await world();
  const identities = [
    { "oai-authenticated-user-email": "dipuraj.thapa@gmail.com" },                                         // email without a verified user id
    { "oai-authenticated-user-id": "u1", "oai-authenticated-user-email": "someone@else.example" },         // signed in, not the owner
    { "oai-authenticated-user-id": "u1", "oai-authenticated-user-email": "seedy@sites.test" },             // the local test owner
    { "oai-authenticated-user-id": "u1", "oai-authenticated-user-email": "dipuraj.thapa@gmail.com.evil.example" },
  ];
  for (const file of routeFiles().filter(f => f.includes("/api/admin/") || f.endsWith("platform/owner/route.ts"))) {
    const mod = await import(file);
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      if (typeof mod[method] !== "function") continue;
      for (const headers of identities) {
        const res = await call(mod, method, "/api/admin/x", { headers, params: { action: "overview", id: "x", type: "applications" }, body: method === "GET" ? undefined : {} });
        const refusals = file.endsWith("platform/owner/route.ts") ? [401, 403, 404] : [401, 403];
        assert.ok(refusals.includes(res.status), `${method} ${relative(root, file)} accepted ${JSON.stringify(headers)} (${res.status})`);
      }
    }
  }
  // The real owner identity is accepted (so the test above is not passing by refusing everyone).
  const records = await route("admin/records");
  const ok = await call(records, "GET", "/api/admin/records", { headers: { "oai-authenticated-user-id": "owner", "oai-authenticated-user-email": "dipuraj.thapa@gmail.com" } });
  assert.equal(ok.status, 200);
});

test("the local test owner works only in an explicit development run on this machine", () => {
  const { devOwnerAllowed, isOwnerIdentity } = mods.admin;
  assert.equal(devOwnerAllowed("development", "localhost:3000"), true);
  assert.equal(devOwnerAllowed("test", "127.0.0.1:8787"), true);
  for (const env of ["production", undefined, "", "staging", "prod"]) assert.equal(devOwnerAllowed(env, "localhost:3000"), false, `NODE_ENV=${env}`);
  for (const host of ["jobpoint.example", "localhost.evil.example", "evil.example:3000", "", null]) assert.equal(devOwnerAllowed("development", host), false, `host=${host}`);
  assert.equal(isOwnerIdentity("u", "seedy@sites.test", undefined, "localhost"), false);
  assert.equal(isOwnerIdentity(null, "dipuraj.thapa@gmail.com", "production", "x"), false);
  assert.equal(isOwnerIdentity("u", "DIPURAJ.THAPA@gmail.com", "production", "x"), true);
});

test("a candidate cannot use company routes and a company cannot use candidate routes", async () => {
  const w = await world();
  const asCandidate = await portalCookie(w.asha.email), asCompany = await portalCookie(w.A.email);
  for (const action of COMPANY_GETS) assert.equal((await call(company, "GET", `/api/portal/company/${action}`, { cookie: asCandidate, action })).status, 403, action);
  for (const action of CANDIDATE_GETS) assert.equal((await call(candidate, "GET", `/api/portal/candidate/${action}`, { cookie: asCompany, action })).status, 403, action);
  assert.equal((await call(company, "POST", "/api/portal/company/jd-create", { cookie: asCandidate, action: "jd-create", body: { title: "x", text: "y" } })).status, 403);
  assert.equal((await call(candidate, "POST", "/api/portal/candidate/delete", { cookie: asCompany, action: "delete", body: { confirm: "DELETE" } })).status, 403);
});

test("company A cannot read anything of company B's, by any id, on any read action", async () => {
  const w = await world();
  const cookie = await portalCookie(w.A.email);
  const get = (action, query = "") => call(company, "GET", `/api/portal/company/${action}${query}`, { cookie, action });

  assert.equal((await get("jd", `?id=${w.B.jdId}`)).status, 404);
  assert.equal((await get("candidate", `?ref=${w.B.pipeline.candidate_ref}`)).status, 403);
  assert.equal((await get("download", `?ref=${w.B.pipeline.candidate_ref}`)).status, 403);
  const foreign = await get("pipeline", `?jd=${w.B.jdId}`);
  assert.deepEqual(foreign.json.pipeline, []);

  // Everything company A can read, searched for anything that belongs to B or to B's candidate.
  const bodies = [];
  for (const [action, query] of [["dashboard", ""], ["pipeline", ""], ["team", ""], ["jd", `?id=${w.A.jdId}`], ["candidate", `?ref=${w.A.pipeline.candidate_ref}`], ["pipeline", `?jd=${w.B.jdId}`]]) {
    const res = await get(action, query);
    assert.equal(res.status, 200, `${action}: ${res.text.slice(0, 100)}`);
    bodies.push(res.text);
  }
  const all = bodies.join("\n");
  for (const secret of [w.B.name, w.B.email, w.B.id, w.B.jdId, w.B.pipeline.id, w.B.pipeline.candidate_ref, w.bikram.name, w.bikram.email, w.bikram.phone, w.bikram.id, "Asansol branch"])
    assert.ok(!all.includes(secret), `company A's responses contain "${secret}"`);
  // Sanity: A does see its own candidate, so the search above is looking at real data.
  assert.ok(all.includes(w.asha.name));
});

test("company A cannot change anything of company B's, and B's data is untouched afterwards", async () => {
  const w = await world();
  await mods.client.moveStage(w.db, w.B.id, w.B.userId, w.B.pipeline.id, { stage: "shortlisted" });
  await mods.client.scheduleInterview(w.db, w.B.id, w.B.userId, w.B.pipeline.id, { round: "Round 1", scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), mode: "video", location: "", interviewer: "Lead" });
  const interview = await w.db.prepare("SELECT id FROM interviews WHERE company_id = ?").bind(w.B.id).first();
  await w.db.prepare("INSERT INTO placements (id, company_id, candidate_id, jd_id, title, joined_on, guarantee_ends_on, non_solicit_until, created_by, created_at) VALUES ('pl-b', ?, ?, ?, 'x', '2026-10-01', '2026-12-01', '2027-10-01', 'admin', ?)").bind(w.B.id, w.bikram.id, w.B.jdId, new Date().toISOString()).run();
  const snapshot = async () => JSON.stringify({
    jd: await w.db.prepare("SELECT status, requirements, service, openings FROM jds WHERE id = ?").bind(w.B.jdId).first(),
    pipe: await w.db.prepare("SELECT stage, stage_reason FROM pipeline WHERE id = ?").bind(w.B.pipeline.id).first(),
    interviews: (await w.db.prepare("SELECT id, status, outcome, feedback FROM interviews WHERE company_id = ? ORDER BY id").bind(w.B.id).all()).results,
    placement: await w.db.prepare("SELECT status, left_on FROM placements WHERE id = 'pl-b'").first(),
    team: (await w.db.prepare("SELECT account_id FROM company_users WHERE company_id = ?").bind(w.B.id).all()).results,
    owner: await w.db.prepare("SELECT status, email FROM portal_accounts WHERE id = ?").bind(w.B.userId).first(),
  });
  const before = await snapshot();
  const cookie = await portalCookie(w.A.email);
  const post = (action, body) => call(company, "POST", `/api/portal/company/${action}`, { cookie, action, body });
  const attempts = [
    ["pipeline-stage", { pipelineId: w.B.pipeline.id, stage: "offered", offerCtcInr: 400000 }],
    ["pipeline-stage", { pipelineId: w.B.pipeline.id, stage: "rejected", reason: "skills_mismatch" }],
    ["interview-schedule", { pipelineId: w.B.pipeline.id, round: "Sneaky", scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), mode: "video" }],
    ["interview-record", { interviewId: interview.id, status: "completed", outcome: "reject", feedback: "x" }],
    ["placement-exit", { placementId: "pl-b", leftOn: "2026-10-15", note: "x" }],
    ["jd-update", { jdId: w.B.jdId, requirements: {} }],
    ["jd-submit", { jdId: w.B.jdId }],
    ["jd-close", { jdId: w.B.jdId }],
    ["jd-openings", { jdId: w.B.jdId, openings: 9 }],
    ["team-remove", { memberId: w.B.userId }],
    ["team-reinvite", { memberId: w.B.userId }],
  ];
  for (const [action, body] of attempts) {
    const res = await post(action, body);
    assert.ok([403, 404].includes(res.status), `${action} on B's record answered ${res.status}: ${res.text.slice(0, 120)}`);
  }
  assert.equal(await snapshot(), before, "company B's data changed");
});

test("before an offer the client gets no contact details, no scores and no browsing", async () => {
  const w = await world();
  await w.db.prepare("INSERT INTO matches (jd_id, candidate_id, cv_id, profile_version, score, lower_bound, hard_pass, explanation, engine_version, scored_at) VALUES (?, ?, 'cv', 1, 87.5, 81.25, 1, ?, 't', ?)").bind(w.A.jdId, w.asha.id, JSON.stringify({ summary: "fits", meets: [], misses: [], why: "INTERNAL-MATCH-REASON" }), new Date().toISOString()).run();
  const cookie = await portalCookie(w.A.email);
  const get = (action, query = "") => call(company, "GET", `/api/portal/company/${action}${query}`, { cookie, action });
  const profile = await get("candidate", `?ref=${w.A.pipeline.candidate_ref}`);
  assert.equal(profile.status, 200);
  assert.equal(profile.json.contactsHidden, true);
  const everything = [profile.text, (await get("dashboard")).text, (await get("pipeline")).text].join("\n");
  for (const hidden of [w.asha.email, w.asha.phone, "linkedin.com/in/ashamukherjee", "INTERNAL-MATCH-REASON", "87.5", "81.25"]) assert.ok(!everything.includes(hidden), `client can see "${hidden}"`);
  // Self-service is removed: there is no browsing, unlocking or adding candidates, for anyone's candidates.
  assert.equal((await get("matches", `?jd=${w.A.jdId}`)).status, 404);
  for (const action of ["unlock", "pipeline-add", "application-status", "params-request", "jd-service"]) {
    const res = await call(company, "POST", `/api/portal/company/${action}`, { cookie, action, body: { ref: w.B.pipeline.candidate_ref, jdId: w.A.jdId, service: "self" } });
    assert.equal(res.status, 404, action);
  }
  assert.equal(w.db.raw.prepare("SELECT COUNT(*) AS n FROM pipeline WHERE company_id = ? AND candidate_id = ?").get(w.A.id, w.bikram.id).n, 0);
  // From the offer stage the client does get the contact details.
  await mods.client.moveStage(w.db, w.A.id, w.A.userId, w.A.pipeline.id, { stage: "shortlisted" });
  await mods.client.moveStage(w.db, w.A.id, w.A.userId, w.A.pipeline.id, { stage: "offered", offerCtcInr: 420000 });
  const offered = await get("candidate", `?ref=${w.A.pipeline.candidate_ref}`);
  assert.equal(offered.json.contactsHidden, false);
  assert.equal(offered.json.profile.contact.email, w.asha.email);
});

test("client access to a candidate ends when the hiring process for that person ends", async () => {
  const w = await world();
  const cookie = await portalCookie(w.A.email);
  await mods.client.moveStage(w.db, w.A.id, w.A.userId, w.A.pipeline.id, { stage: "rejected", reason: mods.client.REASONS.rejected[0] });
  const res = await call(company, "GET", `/api/portal/company/candidate?ref=${w.A.pipeline.candidate_ref}`, { cookie, action: "candidate" });
  assert.equal(res.status, 403);
  assert.equal(res.json.code, "ACCESS_ENDED");
  const pipe = await call(company, "GET", "/api/portal/company/pipeline", { cookie, action: "pipeline" });
  assert.ok(!pipe.text.includes(w.asha.name), "the name is still shown after rejection");
  assert.ok(!pipe.text.includes("Strong Tally"), "the recruiter's note is still shown after rejection");
});

test("a suspended or closed company loses every company route at once; other companies are unaffected", async () => {
  const w = await world();
  const a = await portalCookie(w.A.email), b = await portalCookie(w.B.email);
  for (const status of ["suspended", "closed"]) {
    await w.db.prepare("UPDATE companies SET status = ? WHERE id = ?").bind(status, w.A.id).run();
    for (const action of COMPANY_GETS) {
      const res = await call(company, "GET", `/api/portal/company/${action}?ref=${w.A.pipeline.candidate_ref}&jd=${w.A.jdId}&id=${w.A.jdId}`, { cookie: a, action });
      assert.equal(res.status, 403, `${status}: ${action} answered ${res.status}`);
      assert.equal(res.json.code, "COMPANY_INACTIVE");
      assert.ok(!res.text.includes(w.asha.name));
    }
    for (const action of ["jd-create", "pipeline-stage", "interview-schedule", "team-invite", "notices-read"]) {
      const res = await call(company, "POST", `/api/portal/company/${action}`, { cookie: a, action, body: { pipelineId: w.A.pipeline.id, stage: "shortlisted", title: "t", text: "x", email: "new@alpha-steel.example" } });
      assert.equal(res.json.code, "COMPANY_INACTIVE", `${status}: ${action}`);
    }
    assert.equal((await call(company, "GET", "/api/portal/company/dashboard", { cookie: b, action: "dashboard" })).status, 200);
  }
  await w.db.prepare("UPDATE companies SET status = 'active' WHERE id = ?").bind(w.A.id).run();
  assert.equal((await call(company, "GET", "/api/portal/company/dashboard", { cookie: a, action: "dashboard" })).status, 200);
});

test("the access rule itself: every combination of account kind, company state and need", () => {
  const { accessProblem } = mods.accounts;
  const base = { id: "a", email: "e", status: "active", candidateId: null, companyId: null, companyRole: null, companyStatus: null };
  const cand = { ...base, kind: "candidate", candidateId: "k" };
  const owner = s => ({ ...base, kind: "company_user", companyId: "c", companyRole: "owner", companyStatus: s });
  const recruiter = s => ({ ...owner(s), companyRole: "recruiter" });
  assert.equal(accessProblem(cand, "candidate"), null);
  assert.equal(accessProblem(cand, "company")?.code, "COMPANY_ONLY");
  assert.equal(accessProblem(cand, "company_owner")?.code, "COMPANY_ONLY");
  assert.equal(accessProblem({ ...cand, candidateId: null }, "candidate")?.code, "CANDIDATE_ONLY");
  for (const need of ["company", "company_owner", "any", "candidate"]) for (const s of ["suspended", "closed"]) {
    assert.equal(accessProblem(owner(s), need)?.code, "COMPANY_INACTIVE", `${s}/${need}`);
    assert.equal(accessProblem(recruiter(s), need)?.code, "COMPANY_INACTIVE", `${s}/${need}`);
  }
  for (const s of ["active", "applied"]) {
    assert.equal(accessProblem(owner(s), "company"), null);
    assert.equal(accessProblem(owner(s), "company_owner"), null);
    assert.equal(accessProblem(recruiter(s), "company_owner")?.code, "OWNER_ONLY");
    assert.equal(accessProblem(owner(s), "candidate")?.code, "CANDIDATE_ONLY");
  }
  assert.equal(accessProblem({ ...base, kind: "company_user" }, "company")?.code, "COMPANY_ONLY");
});

test("only the company owner manages the team", async () => {
  const w = await world();
  const invited = await mods.client.inviteMember(w.db, w.A.id, w.A.userId, "recruiter@alpha-steel.example", "Recruiter");
  await mods.accounts.redeemToken(w.db, invited.token, "invite", "harbour lantern 4471 quiet");
  const cookie = await portalCookie("recruiter@alpha-steel.example");
  for (const [action, body] of [["team-invite", { email: "x@alpha-steel.example", name: "x" }], ["team-remove", { memberId: w.A.userId }], ["team-reinvite", { memberId: w.A.userId }]])
    assert.equal((await call(company, "POST", `/api/portal/company/${action}`, { cookie, action, body })).status, 403, action);
  assert.equal((await w.db.prepare("SELECT status FROM portal_accounts WHERE id = ?").bind(w.A.userId).first()).status, "active");
});

test("a candidate sees only their own records, and nothing internal", async () => {
  const w = await world();
  await mods.client.moveStage(w.db, w.A.id, w.A.userId, w.A.pipeline.id, { stage: "shortlisted" });
  await mods.client.scheduleInterview(w.db, w.A.id, w.A.userId, w.A.pipeline.id, { round: "Round 1", scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), mode: "video", location: "", interviewer: "Lead" });
  const interview = await w.db.prepare("SELECT id FROM interviews WHERE company_id = ?").bind(w.A.id).first();
  await mods.client.recordInterview(w.db, w.A.id, w.A.userId, interview.id, { status: "completed", outcome: "hold", rating: 2, feedback: "CONFIDENTIAL-INTERVIEW-FEEDBACK" });
  const at = new Date().toISOString();
  await w.db.prepare("INSERT INTO question_banks (id, kind, title, status, created_by, created_at, updated_at) VALUES ('bank', 'aptitude', 'Aptitude', 'active', 'admin', ?, ?)").bind(at, at).run();
  await w.db.prepare("INSERT INTO adaptive_tests (id, bank_id, candidate_id, status, final_level, band, created_at) VALUES ('test-bikram', 'bank', ?, 'completed', 9, 'expert', ?)").bind(w.bikram.id, at).run();
  const cookie = await portalCookie(w.asha.email);
  const bodies = [];
  for (const action of CANDIDATE_GETS) {
    const res = await call(candidate, "GET", `/api/portal/candidate/${action}?id=test-bikram`, { cookie, action });
    assert.ok(res.status === 200 || res.status === 404, `${action} answered ${res.status}: ${res.text.slice(0, 100)}`);
    bodies.push(res.text);
  }
  const all = bodies.join("\n");
  for (const secret of [w.bikram.name, w.bikram.email, w.bikram.phone, w.bikram.id, "CONFIDENTIAL-INTERVIEW-FEEDBACK", "Strong Tally", "Asansol branch", w.B.pipeline.candidate_ref, w.A.email, w.B.email])
    assert.ok(!all.includes(secret), `candidate Asha's responses contain "${secret}"`);
  assert.ok(all.includes(w.asha.name));
  // Another candidate's test cannot be read, started or answered.
  assert.equal((await call(candidate, "GET", "/api/portal/candidate/test?id=test-bikram", { cookie, action: "test" })).status, 404);
  assert.notEqual((await call(candidate, "POST", "/api/portal/candidate/test-start", { cookie, action: "test-start", body: { testId: "test-bikram" } })).status, 200);
  assert.notEqual((await call(candidate, "POST", "/api/portal/candidate/test-answer", { cookie, action: "test-answer", body: { testId: "test-bikram", choice: 0 } })).status, 200);
  // The data export holds this candidate's data only.
  const exported = await call(candidate, "GET", "/api/portal/candidate/export", { cookie, action: "export" });
  assert.ok(exported.text.includes(w.asha.email) && !exported.text.includes("bikram"));
});

test("a candidate who hides from an employer cannot be submitted to it, and the reply never reveals the client list", async () => {
  const w = await world();
  const cookie = await portalCookie(w.bikram.email);
  const real = await call(candidate, "POST", "/api/portal/candidate/block", { cookie, action: "block", body: { name: "Alpha Steel Works Private Limited" } });
  const made = await call(candidate, "POST", "/api/portal/candidate/block", { cookie, action: "block", body: { name: "Company That Is Not A Client" } });
  assert.equal(real.status, 200);
  assert.deepEqual(real.json, made.json, "the reply differs for a real client");
  await assert.rejects(mods.client.submitByRecruiter(w.db, SECRET, { companyId: w.A.id, jdId: w.A.jdId, candidateId: w.bikram.id, note: "try" }, "admin-1"), e => e.code === "HIDDEN");
  const listed = await call(candidate, "GET", "/api/portal/candidate/companies", { cookie, action: "companies" });
  assert.ok(!listed.text.includes(w.A.id), "the client's id is returned to the candidate");
});

test("withdrawing consent closes the client's access immediately", async () => {
  const w = await world();
  const asCandidate = await portalCookie(w.asha.email), asCompany = await portalCookie(w.A.email);
  assert.equal((await call(candidate, "POST", "/api/portal/candidate/consent", { cookie: asCandidate, action: "consent", body: { purpose: "share_with_companies", grant: false } })).status, 200);
  const res = await call(company, "GET", `/api/portal/company/candidate?ref=${w.A.pipeline.candidate_ref}`, { cookie: asCompany, action: "candidate" });
  assert.equal(res.status, 410);
  const pipe = await call(company, "GET", "/api/portal/company/pipeline", { cookie: asCompany, action: "pipeline" });
  assert.ok(!pipe.text.includes(w.asha.name));
});

test("changes from another website, or with no origin, are refused for every signed-in role", async () => {
  const w = await world();
  const asCompany = await portalCookie(w.A.email), asCandidate = await portalCookie(w.asha.email), asStaff = await makeStaff(w.db, "rec-csrf", { team: "team-one" });
  for (const origin of ["https://evil.example", null]) {
    assert.equal((await call(company, "POST", "/api/portal/company/jd-close", { cookie: asCompany, action: "jd-close", body: { jdId: w.A.jdId }, origin })).status, 403);
    assert.equal((await call(candidate, "POST", "/api/portal/candidate/delete", { cookie: asCandidate, action: "delete", body: { confirm: "DELETE" }, origin })).status, 403);
    assert.equal((await call(recruiting, "POST", "/api/platform/recruiting/stage", { cookie: asStaff, action: "stage", body: { pipelineId: w.A.pipeline.id, stage: "shortlisted" }, origin })).status, 403);
  }
  const crossSite = await call(company, "POST", "/api/portal/company/jd-close", { cookie: asCompany, action: "jd-close", body: { jdId: w.A.jdId }, headers: { "sec-fetch-site": "cross-site" } });
  assert.equal(crossSite.status, 403);
  assert.equal((await w.db.prepare("SELECT status FROM jds WHERE id = ?").bind(w.A.jdId).first()).status, "live");
  assert.equal((await w.db.prepare("SELECT status FROM candidates WHERE id = ?").bind(w.asha.id).first()).status, "active");
});

test("a recruiter works only on their own team's clients, jobs and pipelines", async () => {
  const w = await world();
  const cookie = await makeStaff(w.db, "rec-one", { team: "team-one" });
  await makeStaff(w.db, "rec-two", { team: "team-two" });
  const get = (action, query = "") => call(recruiting, "GET", `/api/platform/recruiting/${action}${query}`, { cookie, action });
  const post = (action, body) => call(recruiting, "POST", `/api/platform/recruiting/${action}`, { cookie, action, body });

  const work = await get("work");
  assert.equal(work.status, 200);
  assert.ok(work.text.includes(w.A.name));
  for (const secret of [w.B.name, w.B.id, w.B.jdId, "team-two", "rec-two"]) assert.ok(!work.text.includes(secret), `recruiter of team one sees "${secret}"`);
  assert.equal((await get("candidates", `?jd=${w.B.jdId}`)).status, 404);
  assert.equal((await get("pipeline", `?jd=${w.B.jdId}`)).status, 404);

  const before = JSON.stringify([
    await w.db.prepare("SELECT stage FROM pipeline WHERE id = ?").bind(w.B.pipeline.id).first(),
    await w.db.prepare("SELECT recruiter_id, aptitude_test FROM jds WHERE id = ?").bind(w.B.jdId).first(),
    await w.db.prepare("SELECT team_id FROM companies WHERE id = ?").bind(w.B.id).first(),
    (await w.db.prepare("SELECT user_id, is_manager FROM platform_team_members ORDER BY user_id").all()).results,
    (await w.db.prepare("SELECT COUNT(*) AS n FROM pipeline").first()).n,
    (await w.db.prepare("SELECT COUNT(*) AS n FROM messaging_settings").first()).n,
  ]);
  const refused = [
    ["stage", { pipelineId: w.B.pipeline.id, stage: "shortlisted" }, [404]],
    ["interview", { pipelineId: w.B.pipeline.id, round: "x", scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), mode: "video" }, [404]],
    ["submit", { jdId: w.B.jdId, candidateId: w.asha.id, note: "x" }, [404]],
    ["pass", { jdId: w.B.jdId, candidateId: w.asha.id, reason: "other" }, [404]],
    ["test-invite", { pipelineId: w.B.pipeline.id, bankId: "bank" }, [404]],
    ["commitment-link", { pipelineId: w.B.pipeline.id }, [404]],
    ["job-aptitude", { jdId: w.B.jdId, on: true }, [404]],
    ["assign-recruiter", { jdId: w.B.jdId, userId: "rec-one" }, [404]],
    ["assign-recruiter", { jdId: w.A.jdId, userId: "rec-one" }, [403]],   // own team, but not a manager
    ["job-aptitude", { jdId: w.A.jdId, on: true }, [403]],
    ["assign-team", { companyId: w.B.id, teamId: "team-one" }, [403]],
    ["team-manager", { teamId: "team-one", userId: "rec-one", manager: true }, [403]],
    ["team-remove", { teamId: "team-two", userId: "rec-two" }, [404]],
    ["team-invite", { teamId: "team-two", email: "new@staff.example", name: "New" }, [404]],
    ["team-invite", { teamId: "team-one", email: "new@staff.example", name: "New" }, [404]],  // not a manager of their own team either
    ["messaging", { scope: "team:team-two", number: "+919800000000", enabled: true }, [404]],
    ["messaging", { scope: "admin", number: "+919800000000", enabled: true }, [403]],
  ];
  for (const [action, body, allowed] of refused) {
    const res = await post(action, body);
    assert.ok(allowed.includes(res.status), `${action} ${JSON.stringify(body)} answered ${res.status}: ${res.text.slice(0, 120)}`);
  }
  const after = JSON.stringify([
    await w.db.prepare("SELECT stage FROM pipeline WHERE id = ?").bind(w.B.pipeline.id).first(),
    await w.db.prepare("SELECT recruiter_id, aptitude_test FROM jds WHERE id = ?").bind(w.B.jdId).first(),
    await w.db.prepare("SELECT team_id FROM companies WHERE id = ?").bind(w.B.id).first(),
    (await w.db.prepare("SELECT user_id, is_manager FROM platform_team_members ORDER BY user_id").all()).results,
    (await w.db.prepare("SELECT COUNT(*) AS n FROM pipeline").first()).n,
    (await w.db.prepare("SELECT COUNT(*) AS n FROM messaging_settings").first()).n,
  ]);
  assert.equal(after, before, "a refused request still changed data");
  // The recruiter can work on their own team's pipeline (the refusals above are not a blanket refusal).
  assert.equal((await post("stage", { pipelineId: w.A.pipeline.id, stage: "shortlisted" })).status, 200);
});

test("recruiters see the shortlist without scores; a job assigned to a colleague is hidden", async () => {
  const w = await world();
  const carol = await mods.candidate.createCandidate(w.db, { accountId: null, displayName: "Carol Das", email: "carol.das@person.example", phone: "9830033333" });
  await mods.consent.recordConsent(w.db, carol, "share_with_companies", "granted");
  await mods.candidate.addCv(w.db, carol, { r2Key: `portal-cv/${carol}/one`, fileName: "cv.pdf", fileType: "pdf", size: 10, sha256: "c", text: "carol das accounts tally gst durgapur unique words here", profile: (await import("./helpers/world.mjs")).profile("Carol Das", "carol.das@person.example", "9830033333"), parseOk: true });
  await w.db.prepare("INSERT INTO matches (jd_id, candidate_id, cv_id, profile_version, score, lower_bound, hard_pass, explanation, engine_version, scored_at) VALUES (?, ?, 'cv', 1, 91.5, 88.25, 1, '{}', 't', ?)").bind(w.A.jdId, carol, new Date().toISOString()).run();
  const one = await makeStaff(w.db, "rec-one", { team: "team-one" }), other = await makeStaff(w.db, "rec-other", { team: "team-one" });
  const admin = await makeStaff(w.db, "boss", { admin: true, level: null });
  // Opening a job scores whatever is waiting. This test seeds its own score, so nothing may be waiting.
  await w.db.prepare("DELETE FROM score_queue").run();
  const list = await call(recruiting, "GET", `/api/platform/recruiting/candidates?jd=${w.A.jdId}`, { cookie: one, action: "candidates" });
  assert.equal(list.status, 200);
  assert.ok(list.json.candidates.length >= 1 && list.json.candidates.length <= 3);
  assert.ok(!/"score"|"lower_bound"|91\.5|88\.25/.test(list.text), "a recruiter can see scores");
  const full = await call(recruiting, "GET", `/api/platform/recruiting/candidates?jd=${w.A.jdId}`, { cookie: admin, action: "candidates" });
  assert.ok(/91\.5/.test(full.text), "the administrator should see scores");
  // Assigned to rec-one: rec-other no longer sees the job.
  await w.db.prepare("UPDATE jds SET recruiter_id = 'rec-one' WHERE id = ?").bind(w.A.jdId).run();
  assert.equal((await call(recruiting, "GET", `/api/platform/recruiting/pipeline?jd=${w.A.jdId}`, { cookie: other, action: "pipeline" })).status, 404);
  assert.equal((await call(recruiting, "GET", `/api/platform/recruiting/pipeline?jd=${w.A.jdId}`, { cookie: one, action: "pipeline" })).status, 200);
});

test("staff permissions: no tool, view-only, disabled account, and non-admin on admin routes", async () => {
  const w = await world();
  const noTool = await makeStaff(w.db, "no-tool", { level: null, team: "team-one" });
  const viewer = await makeStaff(w.db, "viewer", { level: "view", team: "team-one" });
  const gone = await makeStaff(w.db, "gone", { team: "team-one" });
  assert.equal((await call(recruiting, "GET", "/api/platform/recruiting/work", { cookie: noTool, action: "work" })).status, 403);
  assert.equal((await call(recruiting, "GET", "/api/platform/recruiting/work", { cookie: viewer, action: "work" })).status, 200);
  assert.equal((await call(recruiting, "POST", "/api/platform/recruiting/stage", { cookie: viewer, action: "stage", body: { pipelineId: w.A.pipeline.id, stage: "shortlisted" } })).status, 403);
  await w.db.prepare("UPDATE platform_users SET status = 'disabled' WHERE id = 'gone'").run();
  assert.equal((await call(recruiting, "GET", "/api/platform/recruiting/work", { cookie: gone, action: "work" })).status, 401);
  assert.equal((await call(recruiting, "GET", "/api/platform/recruiting/work", { cookie: "wp_session=" + "a".repeat(43), action: "work" })).status, 401);
  const users = await route("platform/admin/users"), ops = await route("platform/admin/operations"), assess = await route("platform/assessments/[action]");
  assert.equal((await call(users, "GET", "/api/platform/admin/users", { cookie: viewer })).status, 403);
  assert.equal((await call(ops, "GET", "/api/platform/admin/operations", { cookie: viewer })).status, 403);
  assert.equal((await call(assess, "GET", "/api/platform/assessments/banks", { cookie: viewer, action: "banks" })).status, 403);
  // A portal (client or candidate) session is not a staff session, and the other way round.
  const portal = await portalCookie(w.A.email);
  assert.equal((await call(recruiting, "GET", "/api/platform/recruiting/work", { cookie: portal.replace("jp_portal", "wp_session"), action: "work" })).status, 401);
  assert.equal((await call(company, "GET", "/api/portal/company/dashboard", { cookie: viewer.replace("wp_session", "jp_portal"), action: "dashboard" })).status, 401);
});

test("sessions: sign-out, password reset and removal end access; tampered tokens are refused", async () => {
  const w = await world();
  const auth = await route("portal/auth/[action]");
  const cookie = await portalCookie(w.A.email);
  assert.equal((await call(auth, "POST", "/api/portal/auth/sign-out", { cookie, action: "sign-out" })).status, 200);
  assert.equal((await call(company, "GET", "/api/portal/company/dashboard", { cookie, action: "dashboard" })).status, 401);
  const second = await portalCookie(w.A.email);
  const token = await mods.accounts.issuePortalToken(w.db, w.A.userId, "reset", 2);
  await mods.accounts.redeemToken(w.db, token, "reset", "another long passphrase 9917 here");
  assert.equal((await call(company, "GET", "/api/portal/company/dashboard", { cookie: second, action: "dashboard" })).status, 401, "old session survived a password reset");
  await assert.rejects(mods.accounts.redeemToken(w.db, token, "reset", "another long passphrase 9917 here"), e => e.code === "INVALID_LINK");
  for (const bad of ["jp_portal=", "jp_portal=short", `jp_portal=${"x".repeat(43)}`, "jp_portal=' OR 1=1 --", `__Host-jp_portal=${"y".repeat(43)}`])
    assert.equal((await call(company, "GET", "/api/portal/company/dashboard", { cookie: bad, action: "dashboard" })).status, 401, bad);
  const stale = await portalCookie(w.asha.email);
  await w.db.prepare("UPDATE portal_sessions SET last_seen_at = ? WHERE account_id = ?").bind(new Date(Date.now() - 13 * 3600_000).toISOString(), w.asha.accountId).run();
  assert.equal((await call(candidate, "GET", "/api/portal/candidate/profile", { cookie: stale, action: "profile" })).status, 401, "an idle session was accepted");
});

test("public endpoints give away no personal data and no draft roles", async () => {
  const w = await world();
  await w.db.prepare("INSERT INTO jobs (id, title, location, employment_type, description, status) VALUES ('pub', 'Public Role', 'Kolkata', 'Full-time', 'd', 'published'), ('draft', 'SECRET-DRAFT-ROLE', 'Kolkata', 'Full-time', 'd', 'draft'), ('closed', 'SECRET-CLOSED-ROLE', 'Kolkata', 'Full-time', 'd', 'closed')").run();
  const jobs = await call(await route("jobs"), "GET", "/api/jobs?q=%25");
  assert.equal(jobs.status, 200);
  const open = await call(await route("jobs"), "GET", "/api/jobs");
  assert.ok(open.text.includes("Public Role"));
  for (const hidden of ["SECRET-DRAFT-ROLE", "SECRET-CLOSED-ROLE", w.asha.email, w.A.name]) assert.ok(!open.text.includes(hidden) && !jobs.text.includes(hidden), hidden);
  const pub = await route("portal/public/[action]");
  for (const token of ["", "x", "a".repeat(64), "' OR 1=1 --"]) {
    assert.equal((await call(pub, "GET", `/api/portal/public/commitment?token=${encodeURIComponent(token)}`, { action: "commitment" })).status, 404);
    assert.equal((await call(pub, "GET", `/api/portal/public/test?token=${encodeURIComponent(token)}`, { action: "test" })).status, 404);
  }
  assert.equal(ORIGIN.startsWith("http://localhost"), true);
});
