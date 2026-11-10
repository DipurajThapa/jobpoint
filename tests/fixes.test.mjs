// The remaining audit fixes: sign-up and sign-in give nothing away, development
// shortcuts fail closed, corrections reach both records, limits cannot be reset
// by editing the audit log, and the security headers are sent.
import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { world, call, route, makeStaff, mods, root, SECRET, PASSWORD } from "./helpers/world.mjs";

const OWNER = { "oai-authenticated-user-id": "owner", "oai-authenticated-user-email": "dipuraj.thapa@gmail.com" };
const auth = await route("portal/auth/[action]");
const post = (action, body) => call(auth, "POST", `/api/portal/auth/${action}`, { action, body });
const withNodeEnv = async (value, fn) => {
  const before = process.env.NODE_ENV;
  if (value === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = value;
  try { return await fn(); } finally { process.env.NODE_ENV = before; }
};

test("sign-up answers the same whether or not the email already has an account", async () => {
  const w = await world();
  globalThis.__TEST_ENV__.PORTAL_OPEN = "true";
  const body = email => ({ kind: "candidate", email, password: PASSWORD, name: "New Person", phone: "9830099999", city: "Kolkata", adult: true, terms: true });
  const fresh = await post("register", body("brand.new@person.example"));
  const taken = await post("register", body(w.asha.email));
  const takenAgain = await post("register", body("brand.new@person.example"));
  assert.equal(fresh.status, 201);
  assert.equal(taken.status, fresh.status);
  assert.deepEqual(taken.json, fresh.json, "the reply reveals that the address is registered");
  assert.deepEqual(takenAgain.json, fresh.json);
  assert.equal((await w.db.prepare("SELECT COUNT(*) AS n FROM portal_accounts WHERE email = ?").bind(w.asha.email).first()).n, 1);
  assert.equal((await w.db.prepare("SELECT COUNT(*) AS n FROM portal_accounts WHERE email = 'brand.new@person.example'").first()).n, 1);
  // The existing account is untouched: same password still works, nothing was reset.
  assert.equal((await post("sign-in", { email: w.asha.email, password: PASSWORD })).status, 200);
  // Company sign-up gives the same neutral reply for a taken address.
  const co = await post("register", { kind: "company", email: w.A.email, password: PASSWORD, companyName: "X", legalName: "X Pvt Ltd", terms: true });
  assert.deepEqual(co.json, fresh.json);
});

test("sign-up stays closed in production until it is opened, and needs the stated agreements", async () => {
  await world();
  const body = { kind: "candidate", email: "closed@person.example", password: PASSWORD, name: "x", adult: true, terms: true };
  assert.equal((await post("register", body)).status, 503);
  globalThis.__TEST_ENV__.PORTAL_OPEN = "true";
  assert.equal((await post("register", { ...body, adult: false })).json.code, "AGE");
  assert.equal((await post("register", { ...body, terms: false })).json.code, "TERMS");
  assert.equal((await post("register", { ...body, password: "short" })).json.code, "WEAK_PASSWORD");
  assert.equal((await post("register", { ...body, email: "not-an-email" })).json.code, "INVALID_EMAIL");
  assert.equal((await post("register", body)).status, 201);
  assert.equal((await post("sign-in", { email: body.email, password: PASSWORD })).json.code, "UNVERIFIED", "an unverified account must not be able to sign in");
});

test("sign-in and password reset do not reveal which emails have accounts", async () => {
  const w = await world();
  const wrong = await post("sign-in", { email: w.asha.email, password: "the wrong passphrase 0000" });
  const unknown = await post("sign-in", { email: "nobody@person.example", password: "the wrong passphrase 0000" });
  assert.equal(wrong.status, 401);
  assert.deepEqual(unknown.json, wrong.json);
  const known = await post("reset-request", { email: w.asha.email }), missing = await post("reset-request", { email: "nobody@person.example" });
  assert.equal(known.status, 200);
  assert.deepEqual(missing.json, known.json);
  assert.ok(!("devLink" in known.json) || known.json.devLink === undefined, "a reset link was returned to the caller in production");
});

test("sign-in is rate limited", async () => {
  const w = await world();
  let limited = 0;
  for (let i = 0; i < 25; i++) if ((await post("sign-in", { email: w.asha.email, password: "wrong wrong wrong 1234" })).status === 429) limited++;
  assert.ok(limited >= 4, `expected the 21st attempt onwards to be refused, ${limited} were`);
  assert.equal((await post("sign-in", { email: w.asha.email, password: PASSWORD })).status, 429, "the correct password got through a locked-out connection");
});

test("one-time links are never handed to the caller unless the run is explicitly development or test", async () => {
  await world();
  const { sendMail } = await import(resolve(root, "lib/portal/mailer.ts"));
  for (const env of ["production", undefined, "", "staging"]) {
    const out = await withNodeEnv(env, () => sendMail({ to: "x@person.example", subject: "s", text: "t" }, "https://site.example/portal/reset?token=SECRET"));
    assert.equal(out.sent, false);
    assert.equal(out.devLink, undefined, `NODE_ENV=${env} returned the link`);
  }
  const dev = await withNodeEnv("development", () => sendMail({ to: "x@person.example", subject: "s", text: "t" }, "https://site.example/link"));
  assert.equal(dev.devLink, "https://site.example/link");
});

test("the built-in development secret is never used unless the run is explicitly development or test", async () => {
  await world();
  const { portalSecret } = await import(resolve(root, "lib/portal/session.ts"));
  assert.equal(portalSecret(), SECRET);
  globalThis.__TEST_ENV__.PORTAL_SECRET = undefined; globalThis.__TEST_ENV__.PLATFORM_SECRET_KEY = undefined;
  for (const env of ["production", undefined, "", "staging"]) await withNodeEnv(env, () => assert.throws(() => portalSecret(), /PORTAL_SECRET/, `NODE_ENV=${env}`));
  globalThis.__TEST_ENV__.PORTAL_SECRET = "too-short";
  assert.throws(() => portalSecret(), /PORTAL_SECRET/);
  await withNodeEnv("development", () => assert.match(portalSecret(), /local-development/));
});

test("a live job's requirements can change three times in 30 days, and clearing the audit log does not reset the count", async () => {
  const w = await world();
  const current = async () => JSON.parse((await w.db.prepare("SELECT requirements FROM jds WHERE id = ?").bind(w.A.jdId).first()).requirements);
  const relive = async () => { await mods.company.submitJd(w.db, w.A.id, w.A.jdId, w.A.userId); await mods.company.decideJd(w.db, w.A.jdId, true, "admin"); };
  for (let i = 0; i < 3; i++) { await mods.company.updateJdRequirements(w.db, w.A.id, w.A.jdId, await current(), w.A.userId); await relive(); }
  await assert.rejects(mods.company.updateJdRequirements(w.db, w.A.id, w.A.jdId, await current(), w.A.userId), e => e.code === "EDIT_LIMIT");
  await w.db.prepare("DELETE FROM audit_events").run();
  await assert.rejects(mods.company.updateJdRequirements(w.db, w.A.id, w.A.jdId, await current(), w.A.userId), e => e.code === "EDIT_LIMIT");
  // Company B's job has its own count.
  await mods.company.updateJdRequirements(w.db, w.B.id, w.B.jdId, JSON.parse((await w.db.prepare("SELECT requirements FROM jds WHERE id = ?").bind(w.B.jdId).first()).requirements), w.B.userId);
  // Edits older than the window stop counting.
  await w.db.prepare("UPDATE jd_requirement_edits SET at = ? WHERE jd_id = ?").bind(new Date(Date.now() - 31 * 86_400_000).toISOString(), w.A.jdId).run();
  await mods.company.updateJdRequirements(w.db, w.A.id, w.A.jdId, await current(), w.A.userId);
  // Editing a draft is not counted.
  const n = (await w.db.prepare("SELECT COUNT(*) AS n FROM jd_requirement_edits WHERE jd_id = ?").bind(w.A.jdId).first()).n;
  await mods.company.updateJdRequirements(w.db, w.A.id, w.A.jdId, await current(), w.A.userId);
  assert.equal((await w.db.prepare("SELECT COUNT(*) AS n FROM jd_requirement_edits WHERE jd_id = ?").bind(w.A.jdId).first()).n, n);
});

test("a correction made on a website application reaches the same person's candidate record", async () => {
  const w = await world();
  await w.db.prepare("INSERT INTO applications (id, full_name, email, phone, location, experience, consent, future_consent) VALUES ('app-1', 'Old Name', 'old@person.example', '9830012345', 'Kolkata', 'five years', 1, 1)").run();
  const linked = await mods.website.linkWebsiteApplication(w.db, w.BUCKET, { id: "app-1", jobId: null, fullName: "Old Name", email: "old@person.example", phone: "9830012345", location: "Kolkata", shareConsent: false, futureConsent: true, privacyVersion: "2026-11-09", resumeName: null }, null);
  const records = await route("admin/records/[type]/[id]");
  const res = await call(records, "PATCH", "/api/admin/records/applications/app-1", { params: { type: "applications", id: "app-1" }, headers: OWNER, body: { profile: { fullName: "New Name", email: "New@Person.Example", phone: "+91 98300 54321", location: "Howrah", experience: "five years" } } });
  assert.equal(res.status, 200, res.text);
  const person = await w.db.prepare("SELECT display_name, current_city, dedupe_email_hash, dedupe_phone_hash FROM candidates WHERE id = ?").bind(linked.candidateId).first();
  assert.equal(person.display_name, "New Name");
  assert.equal(person.current_city, "Howrah");
  assert.equal(person.dedupe_email_hash, await mods.db.sha256Hex("new@person.example"));
  assert.equal(person.dedupe_phone_hash, await mods.db.sha256Hex("9830054321"));
  // The next application from the corrected address joins the same person; the old address no longer does.
  await w.db.prepare("INSERT INTO applications (id, full_name, email, phone, location, experience, consent, future_consent) VALUES ('app-2', 'New Name', 'new@person.example', '9830054321', 'Howrah', 'x', 1, 1)").run();
  const again = await mods.website.linkWebsiteApplication(w.db, w.BUCKET, { id: "app-2", jobId: null, fullName: "New Name", email: "new@person.example", phone: "9830054321", location: "Howrah", shareConsent: false, futureConsent: true, privacyVersion: "2026-11-09", resumeName: null }, null);
  assert.equal(again.candidateId, linked.candidateId);
  assert.equal(again.created, false);
  // A portal account holder's record is never changed from the admin's website form.
  const before = await w.db.prepare("SELECT display_name, dedupe_email_hash FROM candidates WHERE id = ?").bind(w.asha.id).first();
  assert.equal(await mods.website.syncWebsiteProfile(w.db, "no-such-application", { fullName: "x", email: "x@x.example", phone: "", location: "" }, "owner"), false);
  assert.deepEqual(await w.db.prepare("SELECT display_name, dedupe_email_hash FROM candidates WHERE id = ?").bind(w.asha.id).first(), before);
});

test("a website applicant is one person however they type their email, and is never attached to someone's portal account", async () => {
  const w = await world();
  const app = (id, email) => ({ id, jobId: null, fullName: "Gee Mail", email, phone: "", location: "Kolkata", shareConsent: false, futureConsent: true, privacyVersion: "2026-11-09", resumeName: null });
  const one = await mods.website.linkWebsiteApplication(w.db, w.BUCKET, app("g-1", "gee.mail@gmail.com"), null);
  const two = await mods.website.linkWebsiteApplication(w.db, w.BUCKET, app("g-2", "GeeMail+jobs@gmail.com"), null);
  assert.equal(two.candidateId, one.candidateId, "the same mailbox created two candidate records");
  // Applying on the website with a portal user's email must not join (or expose) that user's account record.
  const intruder = await mods.website.linkWebsiteApplication(w.db, w.BUCKET, app("g-3", w.asha.email), null);
  assert.notEqual(intruder.candidateId, w.asha.id);
  assert.equal((await w.db.prepare("SELECT COUNT(*) AS n FROM duplicate_flags WHERE status = 'open' AND (a_id = ? OR b_id = ?)").bind(w.asha.id, w.asha.id).first()).n, 1, "the possible duplicate should be flagged for the admin");
});

test("deleting a staff account returns their jobs to unassigned and ends their sessions", async () => {
  const w = await world();
  const admin = await makeStaff(w.db, "u_bossadmin1", { admin: true, level: null });
  const rec = await makeStaff(w.db, "u_recleaving1", { team: "team-one" });
  await w.db.prepare("UPDATE jds SET recruiter_id = 'u_recleaving1' WHERE id = ?").bind(w.A.jdId).run();
  const users = await route("platform/admin/users/[id]");
  assert.equal((await call(users, "DELETE", "/api/platform/admin/users/u_recleaving1", { cookie: rec, params: { id: "u_recleaving1" } })).status, 403, "a member deleted an account");
  const res = await call(users, "DELETE", "/api/platform/admin/users/u_recleaving1", { cookie: admin, params: { id: "u_recleaving1" } });
  assert.equal(res.status, 200, res.text);
  assert.equal((await w.db.prepare("SELECT recruiter_id FROM jds WHERE id = ?").bind(w.A.jdId).first()).recruiter_id, null);
  const recruiting = await route("platform/recruiting/[action]");
  assert.equal((await call(recruiting, "GET", "/api/platform/recruiting/work", { cookie: rec, action: "work" })).status, 401);
  assert.equal((await w.db.prepare("SELECT COUNT(*) AS n FROM platform_team_members WHERE user_id = 'u_recleaving1'").first()).n, 0);
  assert.equal((await call(users, "DELETE", "/api/platform/admin/users/u_bossadmin1", { cookie: admin, params: { id: "u_bossadmin1" } })).status, 409, "the last administrator deleted themselves");
});

test("the audit log records who was invited by account, not by email address", async () => {
  const w = await world();
  await mods.client.inviteClient(w.db, { legalName: "Gamma Foods Pvt Ltd", displayName: "Gamma Foods", ownerEmail: "owner@gamma-foods.example", ownerName: "Owner", city: "Kolkata", params: (await import("./helpers/world.mjs")).PARAMS }, "admin-1");
  await mods.client.inviteMember(w.db, w.A.id, w.A.userId, "second@alpha-steel.example", "Second");
  const { results } = await w.db.prepare("SELECT action, detail FROM audit_events").all();
  assert.ok(results.some(r => r.action === "client.invited") && results.some(r => r.action === "client.member_invited"));
  for (const r of results) assert.ok(!/@/.test(r.detail), `audit entry ${r.action} holds an email address: ${r.detail}`);
});

test("security headers are sent on every page", async () => {
  const config = (await import(resolve(root, "next.config.ts"))).default;
  const rules = await config.headers();
  assert.deepEqual(rules.map(r => r.source).sort(), ["/", "/:path*"], "the home page and every other path must both be covered");
  assert.deepEqual(rules[0].headers, rules[1].headers);
  const [rule] = rules;
  const sent = Object.fromEntries(rule.headers.map(h => [h.key.toLowerCase(), h.value]));
  assert.equal(sent["x-content-type-options"], "nosniff");
  assert.equal(sent["x-frame-options"], "DENY");
  assert.match(sent["strict-transport-security"], /max-age=(\d+)/);
  assert.ok(Number(sent["strict-transport-security"].match(/max-age=(\d+)/)[1]) >= 15552000, "HSTS must last at least 180 days");
  const csp = Object.fromEntries(sent["content-security-policy"].split(";").map(d => d.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));
  for (const part of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "default-src 'self'", "form-action 'self'", "frame-src 'none'"]) assert.ok(sent["content-security-policy"].includes(part), part);
  // Nothing a page reads can be sent to another site, and no code can be loaded from one.
  assert.deepEqual(csp["connect-src"], ["'self'"]);
  assert.deepEqual(csp["img-src"], ["'self'", "data:", "blob:"]);
  assert.ok(!csp["script-src"].includes("'unsafe-eval'"), "eval must be off outside development");
  for (const [name, values] of Object.entries(csp)) for (const v of values) {
    assert.ok(!v.includes("*"), `${name} has a wildcard`);
    if (/^https?:/.test(v)) assert.ok(["https://fonts.googleapis.com", "https://fonts.gstatic.com"].includes(v), `${name} allows ${v}`);
  }
  assert.ok(sent["referrer-policy"] && sent["permissions-policy"]);
});

test("API replies with personal data are never cacheable", async () => {
  const w = await world();
  const { portalCookie } = await import("./helpers/world.mjs");
  const company = await route("portal/company/[action]"), candidate = await route("portal/candidate/[action]");
  const a = await call(company, "GET", "/api/portal/company/pipeline", { cookie: await portalCookie(w.A.email), action: "pipeline" });
  const c = await call(candidate, "GET", "/api/portal/candidate/profile", { cookie: await portalCookie(w.asha.email), action: "profile" });
  for (const res of [a, c]) { assert.equal(res.status, 200); assert.match(res.headers.get("cache-control"), /no-store/); }
});
