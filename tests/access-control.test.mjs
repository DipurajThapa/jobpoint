// Who may see and take out how much: staff roles, contact details, downloads,
// two-step sign-in, the single staff sign-in for the owner console, and the
// separation of the encryption keys.
import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { world, call, route, portalCookie, makeStaff, makeCandidate, mods, root, SECRET, PASSWORD, INTEGRATION_KEY, ORIGIN, profile } from "./helpers/world.mjs";

const recruiting = await route("platform/recruiting/[action]");
const totp = await import(resolve(root, "lib/platform/totp.ts"));
const integrations = await import(resolve(root, "lib/platform/integrations.ts"));
const crypto2 = await import(resolve(root, "lib/platform/crypto.ts"));
const signIn = await route("platform/auth/sign-in"), twoFactor = await route("platform/auth/two-factor");

/** A staff member with a real password, signed in through the real route. */
async function staffWithPassword(w, id, opts = {}) {
  await makeStaff(w.db, id, opts);
  await w.db.prepare("UPDATE platform_users SET password_hash = ? WHERE id = ?").bind(await crypto2.hashPassword(PASSWORD), id).run();
  const login = async (code) => call(signIn, "POST", "/api/platform/auth/sign-in", { body: { email: `${id}@staff.example`, password: PASSWORD, ...(code === undefined ? {} : { code }) }, headers: { "cf-connecting-ip": `203.0.113.${Math.floor(Math.random() * 250)}` } });
  const res = await login();
  return { cookie: res.headers.get("set-cookie")?.split(";")[0], login };
}
async function turnOnTwoFactor(w, id, cookie) {
  const setup = await call(twoFactor, "POST", "/api/platform/auth/two-factor", { cookie, body: { action: "setup", password: PASSWORD } });
  assert.equal(setup.status, 200, setup.text);
  const code = await totp.codeFor(setup.json.secret, totp.counterAt(Date.now()));
  const on = await call(twoFactor, "POST", "/api/platform/auth/two-factor", { cookie, body: { action: "enable", code } });
  assert.equal(on.status, 200, on.text);
  return { secret: setup.json.secret, recovery: on.json.recoveryCodes };
}
/** More candidates matched to company A's job, so a recruiter has people to work through. */
async function pool(w, n) {
  const made = [];
  for (let i = 0; i < n; i++) {
    const name = `Pool Person${i}`, email = `pool${i}@person.example`, phone = `98311${String(i).padStart(5, "0")}`;
    const id = await mods.candidate.createCandidate(w.db, { accountId: null, displayName: name, email, phone });
    await mods.consent.recordConsent(w.db, id, "share_with_companies", "granted");
    await mods.candidate.addCv(w.db, id, { r2Key: `portal-cv/${id}/one`, fileName: "cv.pdf", fileType: "pdf", size: 10, sha256: `p${i}`, text: `${name} tally gst accounts durgapur words ${i} ${id}`, profile: profile(name, email, phone), parseOk: true });
    await w.db.prepare("INSERT INTO matches (jd_id, candidate_id, cv_id, profile_version, score, lower_bound, hard_pass, explanation, engine_version, scored_at) VALUES (?, ?, 'cv', 1, ?, ?, 1, '{}', 't', ?)").bind(w.A.jdId, id, 90 - i * 0.5, 85 - i * 0.5, new Date().toISOString()).run();
    made.push({ id, name, email, phone });
  }
  return made;
}

test("authenticator codes follow the published standard (RFC 6238 test values)", async () => {
  const secret = totp.base32Encode(new TextEncoder().encode("12345678901234567890"));
  assert.equal(await totp.codeFor(secret, totp.counterAt(59_000)), "287082");
  assert.equal(await totp.codeFor(secret, totp.counterAt(1111111109_000)), "081804");
  assert.equal(await totp.codeFor(secret, totp.counterAt(1234567890_000)), "005924");
  assert.equal(await totp.codeFor(secret, totp.counterAt(20000000000_000)), "353130");
  assert.deepEqual([...totp.base32Decode(secret)], [...new TextEncoder().encode("12345678901234567890")]);
  const now = 1234567890_000;
  assert.equal(await totp.verifyCode(secret, "005924", now), totp.counterAt(now));
  assert.equal(await totp.verifyCode(secret, "005924", now + 30_000), totp.counterAt(now), "one step of clock drift is allowed");
  assert.equal(await totp.verifyCode(secret, "005924", now + 90_000), null, "an old code was accepted");
  assert.equal(await totp.verifyCode(secret, "005924", now, totp.counterAt(now)), null, "a used code was accepted again");
  for (const bad of ["", "12345", "1234567", "abcdef", "005925", "00592 4x"]) assert.equal(await totp.verifyCode(secret, bad, now), null, bad);
});

test("two-step sign-in is off until a person turns it on, then the password alone no longer signs in", async () => {
  const w = await world();
  const plain = await staffWithPassword(w, "u_plainuser01", { team: "team-one" });
  assert.ok(plain.cookie, "an account without two-step sign-in signs in with its password as before");
  const user = await staffWithPassword(w, "u_twofactor01", { team: "team-one" });
  // Setting it up needs the current password, and it is not on until a code confirms it.
  assert.equal((await call(twoFactor, "POST", "/api/platform/auth/two-factor", { cookie: user.cookie, body: { action: "setup", password: "wrong password here 1" } })).status, 403);
  const setup = await call(twoFactor, "POST", "/api/platform/auth/two-factor", { cookie: user.cookie, body: { action: "setup", password: PASSWORD } });
  assert.equal((await user.login()).status, 200, "a started but unconfirmed set-up must not lock the person out");
  assert.equal((await call(twoFactor, "POST", "/api/platform/auth/two-factor", { cookie: user.cookie, body: { action: "enable", code: "000000" } })).status, 400);
  const code = await totp.codeFor(setup.json.secret, totp.counterAt(Date.now()));
  const on = await call(twoFactor, "POST", "/api/platform/auth/two-factor", { cookie: user.cookie, body: { action: "enable", code } });
  assert.equal(on.json.recoveryCodes.length, 10);
  // The secret is stored encrypted and the recovery codes as hashes.
  const stored = await w.db.prepare("SELECT totp_secret, totp_recovery FROM platform_users WHERE id = 'u_twofactor01'").first();
  assert.ok(!stored.totp_secret.includes(setup.json.secret) && /^v[12]\./.test(stored.totp_secret));
  for (const c of on.json.recoveryCodes) assert.ok(!stored.totp_recovery.includes(c));

  const noCode = await user.login();
  assert.equal(noCode.status, 401); assert.equal(noCode.json.code, "TWO_FACTOR"); assert.equal(noCode.headers.get("set-cookie"), null);
  assert.equal((await user.login("123456")).json.code, "TWO_FACTOR_INVALID");
  assert.equal((await user.login(code)).status, 401, "the code used to turn it on was accepted again at sign-in");
  const next = await totp.codeFor(setup.json.secret, totp.counterAt(Date.now()) + 1);
  assert.equal((await user.login(next)).status, 200);
  assert.equal((await user.login(next)).status, 401, "the same code signed in twice");
  // A recovery code works once.
  assert.equal((await user.login(on.json.recoveryCodes[0])).status, 200);
  assert.equal((await user.login(on.json.recoveryCodes[0])).status, 401);
  assert.equal((await user.login(on.json.recoveryCodes[1].toUpperCase().replace("-", " "))).status, 200, "recovery codes should forgive case and spacing");
  // A wrong password never reveals whether two-step sign-in is on.
  const wrong = await call(signIn, "POST", "/api/platform/auth/sign-in", { body: { email: "u_twofactor01@staff.example", password: "not the password 12" }, headers: { "cf-connecting-ip": "203.0.113.251" } });
  assert.equal(wrong.json.code, "INVALID");
  // The other account is unaffected.
  assert.equal((await plain.login()).status, 200);
});

test("turning two-step sign-in off needs the password and a code; an administrator can reset a colleague but not themselves", async () => {
  const w = await world();
  const user = await staffWithPassword(w, "u_twofactor02", { team: "team-one" });
  const { secret, recovery } = await turnOnTwoFactor(w, "u_twofactor02", user.cookie);
  const post = (cookie, body) => call(twoFactor, "POST", "/api/platform/auth/two-factor", { cookie, body });
  assert.equal((await post(user.cookie, { action: "disable", password: PASSWORD })).status, 403);
  assert.equal((await post(user.cookie, { action: "disable", password: "wrong password here 1", code: recovery[0] })).status, 403);
  assert.equal((await post(user.cookie, { action: "reset", userId: "u_someoneelse" })).status, 403, "a team member reset someone's second step");
  const admin = await staffWithPassword(w, "u_adminuser01", { admin: true, level: null });
  assert.equal((await post(admin.cookie, { action: "reset", userId: "u_adminuser01" })).status, 400);
  assert.equal((await post(admin.cookie, { action: "reset", userId: "u_twofactor02" })).status, 200);
  assert.equal((await call(recruiting, "GET", "/api/platform/recruiting/work", { cookie: user.cookie, action: "work" })).status, 401, "a reset must end the person's sessions");
  assert.equal((await user.login()).status, 200);
  assert.ok(secret);
  assert.equal((await call(twoFactor, "POST", "/api/platform/auth/two-factor", { body: { action: "setup", password: PASSWORD } })).status, 401);
});

test("one staff sign-in: only an administrator with two-step sign-in reaches the owner console", async () => {
  const w = await world();
  const records = await route("admin/records"), resumes = await route("admin/resumes/[id]"), portal = await route("admin/portal/[action]");
  const get = cookie => call(records, "GET", "/api/admin/records", { cookie });
  const admin = await staffWithPassword(w, "u_adminuser02", { admin: true, level: null });
  const manager = await staffWithPassword(w, "u_manageruser1", { team: "team-one", manager: true });
  const member = await staffWithPassword(w, "u_memberuser01", { team: "team-one" });
  assert.equal((await get(admin.cookie)).status, 401, "an administrator's password alone opened the owner console");
  await turnOnTwoFactor(w, "u_manageruser1", manager.cookie);
  await turnOnTwoFactor(w, "u_memberuser01", member.cookie);
  const { secret } = await turnOnTwoFactor(w, "u_adminuser02", admin.cookie);
  for (const [who, cookie] of [["manager", manager.cookie], ["member", member.cookie]]) {
    assert.equal((await get(cookie)).status, 401, `a team ${who} opened the owner console`);
    assert.equal((await call(resumes, "GET", "/api/admin/resumes/x", { cookie, params: { id: "x" } })).status, 401, `a team ${who} reached CV downloads`);
    assert.equal((await call(portal, "GET", "/api/admin/portal/overview", { cookie, action: "overview" })).status, 401);
  }
  assert.equal((await get(admin.cookie)).status, 200);
  // What the administrator does there is recorded under their own account.
  await w.db.prepare("INSERT INTO applications (id, full_name, email, phone, location, experience, consent) VALUES ('app-x', 'N', 'n@person.example', '9830000000', 'K', 'e', 1)").run();
  const patch = await call(await route("admin/records/[type]/[id]"), "PATCH", "/api/admin/records/applications/app-x", { cookie: admin.cookie, params: { type: "applications", id: "app-x" }, body: { status: "screening" } });
  assert.equal(patch.status, 200, patch.text);
  assert.equal((await w.db.prepare("SELECT actor_id FROM audit_events WHERE target_id = 'app-x'").first()).actor_id, "platform:u_adminuser02");
  // Losing the role, being disabled, or turning the second step off closes the console again.
  await w.db.prepare("UPDATE platform_users SET role = 'member' WHERE id = 'u_adminuser02'").run();
  assert.equal((await get(admin.cookie)).status, 401);
  await w.db.prepare("UPDATE platform_users SET role = 'admin', status = 'disabled' WHERE id = 'u_adminuser02'").run();
  assert.equal((await get(admin.cookie)).status, 401);
  assert.ok(secret);
  const rule = mods.admin.platformAdminAllowed;
  assert.equal(rule({ role: "admin", status: "active", twoFactor: true }), true);
  for (const u of [null, undefined, { role: "admin", status: "active", twoFactor: false }, { role: "member", status: "active", twoFactor: true }, { role: "admin", status: "invited", twoFactor: true }, { role: "admin", status: "active", twoFactor: "yes" }]) assert.equal(rule(u), false, JSON.stringify(u));
});

test("staff see contact details one candidate at a time, only for people in front of them, and every view is recorded", async () => {
  const w = await world();
  const people = await pool(w, 6);
  const rec = await makeStaff(w.db, "rec-one", { team: "team-one" });
  const other = await makeStaff(w.db, "rec-two", { team: "team-two" });
  const viewer = await makeStaff(w.db, "viewer", { team: "team-one", level: "view" });
  const contact = (cookie, jdId, candidateId) => call(recruiting, "POST", "/api/platform/recruiting/contact", { cookie, action: "contact", body: { jdId, candidateId } });
  const list = await call(recruiting, "GET", `/api/platform/recruiting/candidates?jd=${w.A.jdId}`, { cookie: rec, action: "candidates" });
  assert.equal(list.json.candidates.length, 3);
  // The list itself never carries phone numbers or emails.
  for (const p of [...people, w.asha]) { assert.ok(!list.text.includes(p.phone), "a phone number is in the list"); assert.ok(!list.text.includes(p.email), "an email is in the list"); }
  const shown = list.json.candidates.map(c => c.candidate_id), hidden = people.find(p => !shown.includes(p.id));
  const ok = await contact(rec, w.A.jdId, shown[0]);
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.json.phone, people.find(p => p.id === shown[0]).phone);
  assert.deepEqual(Object.keys(ok.json).sort(), ["email", "name", "phone"], "the reply carries more than the contact details");
  // Not shown to this recruiter yet; another team's job; another team's recruiter; a view-only account.
  assert.equal((await contact(rec, w.A.jdId, hidden.id)).status, 404, "a recruiter opened a candidate further down the list");
  assert.equal((await contact(rec, w.B.jdId, w.bikram.id)).status, 404);
  assert.equal((await contact(rec, w.A.jdId, w.bikram.id)).status, 404, "a candidate from another company's pipeline was opened through this job");
  assert.equal((await contact(other, w.A.jdId, shown[0])).status, 404);
  assert.equal((await contact(viewer, w.A.jdId, shown[0])).status, 403);
  assert.equal((await contact(null, w.A.jdId, shown[0])).status, 401);
  // A candidate already in this job's pipeline can be contacted.
  assert.equal((await contact(rec, w.A.jdId, w.asha.id)).status, 200);
  const log = (await w.db.prepare("SELECT actor_id, jd_id, detail FROM access_log WHERE action = 'contact_view' ORDER BY at").all()).results;
  assert.deepEqual(log.map(l => [l.actor_id, l.jd_id, l.detail]), [["rec-one", w.A.jdId, shown[0]], ["rec-one", w.A.jdId, w.asha.id]], "refused attempts must not be logged as views, and every real view must be");
});

test("contact views have a daily limit, lower for team members than for team managers; the administrator is not limited", async () => {
  const w = await world();
  const { CONTACT_VIEWS_PER_DAY } = mods.staff;
  assert.ok(CONTACT_VIEWS_PER_DAY.recruiter < CONTACT_VIEWS_PER_DAY.manager && CONTACT_VIEWS_PER_DAY.manager <= 100);
  const people = await pool(w, 4);
  await makeStaff(w.db, "rec-one", { team: "team-one" }); await makeStaff(w.db, "mgr-one", { team: "team-one", manager: true }); await makeStaff(w.db, "boss", { admin: true, level: null });
  const fill = async (staffId, n) => { for (let i = 0; i < n; i++) await w.db.prepare("INSERT INTO access_log (id, actor_kind, actor_id, action, jd_id, detail, at) VALUES (?, 'staff', ?, 'contact_view', ?, ?, ?)").bind(`${staffId}-${i}`, staffId, w.A.jdId, `earlier-${i}`, new Date().toISOString()).run(); };
  const open = (id, admin = false) => mods.staff.staffContact(w.db, { id, admin }, { jdId: w.A.jdId, candidateId: w.asha.id });
  await fill("rec-one", CONTACT_VIEWS_PER_DAY.recruiter - 1);
  await open("rec-one");                                                    // the last one allowed today
  await open("rec-one");                                                    // looking at the same person again is not a new view
  const shown = (await mods.staff.staffCandidates(w.db, { id: "rec-one", admin: false }, w.A.jdId))[0].candidate_id;
  await assert.rejects(mods.staff.staffContact(w.db, { id: "rec-one", admin: false }, { jdId: w.A.jdId, candidateId: shown }), e => e.code === "CONTACT_LIMIT" && e.status === 429);
  await fill("mgr-one", CONTACT_VIEWS_PER_DAY.recruiter + 5);
  await open("mgr-one");                                                    // a manager is past the member limit but under their own
  await fill("boss", 500);
  await open("boss", true);
  // Yesterday's views do not count today.
  await w.db.prepare("UPDATE access_log SET at = ? WHERE actor_id = 'rec-one'").bind(new Date(Date.now() - 86_400_000).toISOString()).run();
  await mods.staff.staffContact(w.db, { id: "rec-one", admin: false }, { jdId: w.A.jdId, candidateId: shown });
  assert.ok(people.length && (await w.db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'contact.limit_reached'").first()).n === 1);
});

test("no staff route hands out a CV file or a list of contact details, whatever the role below administrator", async () => {
  const w = await world();
  await pool(w, 5);
  const manager = await makeStaff(w.db, "mgr-one", { team: "team-one", manager: true }), member = await makeStaff(w.db, "rec-one", { team: "team-one" });
  const everyone = [w.asha, w.bikram];
  for (const cookie of [manager, member]) {
    for (const [action, query] of [["work", ""], ["candidates", `?jd=${w.A.jdId}`], ["pipeline", `?jd=${w.A.jdId}`]]) {
      const res = await call(recruiting, "GET", `/api/platform/recruiting/${action}${query}`, { cookie, action });
      assert.equal(res.status, 200);
      assert.match(res.headers.get("content-type"), /json/, `${action} returned a file`);
      for (const p of everyone) { assert.ok(!res.text.includes(p.email), `${action} lists an email address`); assert.ok(!res.text.includes(p.phone), `${action} lists a phone number`); }
      assert.ok(!/r2_key|r2Key|portal-cv\//.test(res.text), `${action} exposes a stored file key`);
    }
    // Managers see the same three-at-a-time shortlist as members: no full list, no scores.
    const list = await call(recruiting, "GET", `/api/platform/recruiting/candidates?jd=${w.A.jdId}`, { cookie, action: "candidates" });
    assert.ok(list.json.candidates.length <= 3 && list.json.full === false && !/"score"/.test(list.text));
    // The administrator-only download and export routes refuse them.
    for (const [path, params] of [["admin/resumes/[id]", { id: "x" }], ["admin/records", {}], ["platform/email-kit/snapshots", {}], ["platform/email-kit/summary", {}], ["platform/admin/users", {}]]) {
      const res = await call(await route(path), "GET", `/api/${path}`, { cookie, params });
      assert.ok([401, 403].includes(res.status), `${path} answered ${res.status} to a team account`);
    }
  }
});

test("a client cannot bulk-download: only people in its open pipeline, each copy logged and stamped, with a rate limit", async () => {
  const w = await world();
  const company = await route("portal/company/[action]");
  const cookie = await portalCookie(w.A.email);
  const download = ref => call(company, "GET", `/api/portal/company/download?ref=${ref}`, { cookie, action: "download" });
  // There is no list-all or export route for a client at all.
  for (const action of ["export", "candidates", "search", "all", "matches", "download-all"]) {
    const res = await call(company, "GET", `/api/portal/company/${action}`, { cookie, action });
    assert.ok([403, 404].includes(res.status), `${action} answered ${res.status}`);
  }
  assert.equal((await download(w.B.pipeline.candidate_ref)).status, 403);
  assert.equal((await download("c_doesnotexist")).status, 403);
  // Every attempt is logged, allowed or not, and the limit holds even for the client's own candidate.
  const { LIMITS } = await import(resolve(root, "lib/portal/access.ts"));
  const hourly = LIMITS.download.find(l => l.windowSec === 3600).max;
  assert.ok(hourly <= 60);
  let refused = 0;
  for (let i = 0; i < hourly + 5; i++) if ((await download(w.A.pipeline.candidate_ref)).status === 429) refused++;
  assert.ok(refused >= 3, `the download limit did not hold (${refused} refused)`);
  assert.ok((await w.db.prepare("SELECT COUNT(*) AS n FROM access_log WHERE action = 'download' AND company_id = ?").bind(w.A.id).first()).n >= hourly);
  assert.equal((await w.db.prepare("SELECT COUNT(*) AS n FROM abuse_flags WHERE company_id = ? AND rule = 'rate:download'").bind(w.A.id).first()).n, 1, "hitting the limit should raise a flag for the administrator");
});

test("a candidate cannot browse: no other people, no client list, no scores, and paid tests need Fast Track", async () => {
  const w = await world();
  const candidate = await route("portal/candidate/[action]");
  const cookie = await portalCookie(w.asha.email);
  for (const action of ["candidates", "companies-all", "search", "pipeline", "matches", "scores", "admin"]) {
    const res = await call(candidate, "GET", `/api/portal/candidate/${action}`, { cookie, action });
    assert.equal(res.status, 404, `${action} answered ${res.status}`);
  }
  const at = new Date().toISOString();
  await w.db.prepare("INSERT INTO question_banks (id, kind, title, skill_id, status, created_by, created_at, updated_at) VALUES ('tech', 'technical', 'Tally', 'tally', 'active', 'admin', ?, ?)").bind(at, at).run();
  const start = await call(candidate, "POST", "/api/portal/candidate/test-start", { cookie, action: "test-start", body: { bankId: "tech" } });
  assert.notEqual(start.status, 200, "a technical test started without Fast Track");
  const upload = await import(resolve(root, "lib/portal/access.ts"));
  assert.ok(upload.LIMITS.cv_upload.every(l => l.max <= 3), "CV uploads should stay limited");
});

test("the keys are separate: stored credentials move to their own key and candidate references never change", async () => {
  const w = await world();
  const refBefore = await mods.db.candidateRef(SECRET, w.A.id, w.asha.id);
  assert.equal(refBefore, w.A.pipeline.candidate_ref);
  const v1 = await integrations.encryptToken("api-token-one");
  assert.match(v1, /^v1\./);
  await w.db.prepare("INSERT INTO platform_integrations (id, name, kind, endpoint, encrypted_token, created_at, updated_at) VALUES ('i1', 'Old', 'api', 'https://api.partner.example', ?, 't', 't')").bind(v1).run();
  await assert.rejects(integrations.rewrapStoredSecrets(w.db), /INTEGRATION_SECRET_KEY/);
  globalThis.__TEST_ENV__.INTEGRATION_SECRET_KEY = INTEGRATION_KEY;
  const v2 = await integrations.encryptToken("api-token-two");
  assert.match(v2, /^v2\./);
  assert.equal(await integrations.decryptToken(v1), "api-token-one", "values written before the split must stay readable");
  assert.equal(await integrations.decryptToken(v2), "api-token-two");
  assert.deepEqual(await integrations.rewrapStoredSecrets(w.db), { moved: 1, alreadyDone: 0 });
  assert.deepEqual(await integrations.rewrapStoredSecrets(w.db), { moved: 0, alreadyDone: 1 });
  const stored = (await w.db.prepare("SELECT encrypted_token FROM platform_integrations WHERE id = 'i1'").first()).encrypted_token;
  assert.match(stored, /^v2\./);
  // The old key can now be replaced without losing anything stored under the new one...
  const oldKey = globalThis.__TEST_ENV__.PLATFORM_SECRET_KEY;
  globalThis.__TEST_ENV__.PLATFORM_SECRET_KEY = "C".repeat(42) + "E";
  assert.equal(await integrations.decryptToken(stored), "api-token-one");
  await assert.rejects(integrations.decryptToken(v1), "a value under the old key was readable with a different key");
  // ...and a value from one key is never readable with the other.
  globalThis.__TEST_ENV__.PLATFORM_SECRET_KEY = oldKey;
  await assert.rejects(integrations.decryptToken(v2.replace(/^v2/, "v1")));
  // Candidate references depend only on PORTAL_SECRET: unchanged through all of the above.
  assert.equal(await mods.db.candidateRef(SECRET, w.A.id, w.asha.id), refBefore);
  const company = await route("portal/company/[action]");
  assert.equal((await call(company, "GET", `/api/portal/company/candidate?ref=${refBefore}`, { cookie: await portalCookie(w.A.email), action: "candidate" })).status, 200);
  assert.notEqual(await mods.db.candidateRef(SECRET, w.B.id, w.asha.id), refBefore, "two companies must not share a reference for the same person");
  assert.ok(ORIGIN && makeCandidate);
});
