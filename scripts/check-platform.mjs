// End-to-end check of Working Platform and Email Kit against the local dev
// server (`npm run dev`). Uses only fictional people and companies, local
// Miniflare storage, and blocks every request that leaves 127.0.0.1, so nothing
// is ever sent to anyone.
//
//   node scripts/local-db.mjs --reset          (fresh local database)
//   USHA_STANDALONE=/path/Usha-3.0.html \
//   node scripts/check-platform.mjs [screenshot-dir]
//
// USHA_STANDALONE (optional) is the original Usha 3.0 single-file app; when set,
// a protected backup is created in it and migrated into Email Kit.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const BASE = process.env.PLATFORM_URL ?? "http://127.0.0.1:5173";
const OUT = resolve(process.argv[2] ?? "test-results/platform");
mkdirSync(OUT, { recursive: true });
const PASS = { admin: "blue lantern harbour 61", rina: "quiet orchard morning 24", vik: "silver kettle window 85", noor: "amber river lantern 39" };
const AGENCY = { name: "Example Search Agency", reviewBy: "2099-01-01", services: "We understand each requirement, source and screen candidates, share a shortlist and coordinate interviews, and we follow up after placement.", sectors: "We recruit in FMCG, retail, manufacturing and corporate functions.", references: "", terms: "Fee: 8.33% of annual CTC (negotiable).\nPayment: 30 days from joining.\nReplacement: one free replacement within 60 days." };

let pass = 0, fail = 0;
const results = [];
const ok = (cond, msg) => { results.push(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (cond) pass++; else { fail++; console.log("  FAIL:", msg); } };
const section = name => { results.push(`\n## ${name}`); console.log(">", name); };

async function http(path, { method = "GET", body, cookie, origin = true, headers = {} } = {}) {
  const h = { ...headers };
  if (origin) h.origin = BASE;
  if (cookie) h.cookie = cookie;
  if (body !== undefined) h["content-type"] = "application/json";
  const res = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, location: res.headers.get("location") ?? "", text, json, headers: res.headers };
}

const browser = await chromium.launch();
async function context(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, ...opts });
  // Nothing may leave the local server during tests (no fonts, no email apps, no search links).
  await ctx.route(url => !url.href.startsWith(BASE) && !url.href.startsWith("file:") && !url.href.startsWith("blob:") && !url.href.startsWith("data:"), r => r.abort());
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  page._errors = [];
  page.on("pageerror", e => page._errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|ERR_FAILED|net::/.test(m.text())) page._errors.push(m.text()); });
  return { ctx, page };
}
const cookieOf = async ctx => (await ctx.cookies()).filter(c => c.name.includes("wp_session")).map(c => `${c.name}=${c.value}`).join("; ");
const settle = p => p.waitForFunction(() => document.body.dataset.ready && !document.body.dataset.busy, null, { timeout: 20000 });
const click = async (p, sel) => { await p.click(sel); await settle(p); };
const state = async p => p.evaluate(async () => (await (await fetch("/api/platform/email-kit/state")).json()).state);

async function signIn(page, email, password) {
  await page.goto(`${BASE}/platform/sign-in`, { waitUntil: "networkidle" });
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await Promise.all([page.waitForURL(`${BASE}/platform`), page.click("button:has-text('Sign in')")]);
}
async function openKit(page) {
  await page.goto(`${BASE}/platform/email-kit`);
  await settle(page);
}
async function setupAgency(p) {
  await p.locator("#agencyBox").evaluate(el => { el.open = true; });
  for (const [key, id] of Object.entries({ name: "Name", reviewBy: "Review", services: "Services", sectors: "Sectors", references: "References", terms: "Terms" })) await p.fill(`#agency${id}`, AGENCY[key]);
  await p.check("#agencyApproved");
  await click(p, "#saveAgency");
  await p.waitForFunction(() => document.getElementById("agencyStatus").textContent.startsWith("Approved for"));
}
async function sender(p, name) {
  await p.evaluate(() => { document.getElementById("senderBox").open = true; });
  await p.fill("#senderName", name);
  await p.fill("#senderRole", "Business Development Manager");
}
async function firstMessage(p, who, name, company, contact) {
  await sender(p, who);
  await p.fill("#recipientName", name);
  await p.fill("#company", company);
  await p.fill("#designation", "Head of HR");
  await p.fill("#recipientContact", contact);
  await click(p, "#generate");
  await click(p, "#markSent");
}
const panel = p => p.evaluate(() => { document.getElementById("trackerBox").open = true; });
async function reply(p, name, text) {
  await panel(p);
  await click(p, `#trackerList li:has-text("${name}") button:has-text("Continue")`);
  await p.fill("#responseText", text);
  await click(p, "#categoryUse").catch(() => undefined);
  await click(p, "#generate");
}
// The site hides horizontal overflow on <body>, so measure every visible element instead.
async function noHorizontalScroll(page) {
  return page.evaluate(() => {
    const limit = window.innerWidth + 1;
    const clipped = [...document.querySelectorAll("body *")].filter(el => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === "auto" || o === "scroll") return false; // inside an intentional scroller
      }
      return r.right > limit || r.left < -1;
    });
    return document.documentElement.scrollWidth <= limit && clipped.length === 0;
  });
}

try {
  section("Anonymous visitors see no internal data");
  for (const path of ["/platform", "/platform/admin", "/platform/account", "/platform/email-kit"]) {
    const r = await http(path, { origin: false });
    ok(r.status === 307 && r.location.includes("/platform/sign-in"), `${path} redirects to sign-in (${r.status})`);
    ok(!/conversation|suppression|@example/.test(r.text), `${path} returns no records`);
  }
  for (const path of ["/api/platform/email-kit/state", "/api/platform/email-kit/revision", "/api/platform/email-kit/summary", "/api/platform/email-kit/files", "/api/platform/email-kit/files/file12345678", "/api/platform/email-kit/snapshots", "/api/platform/admin/users"]) {
    const r = await http(path, { origin: false });
    ok(r.status === 401 && r.json?.code === "SIGN_IN" && !("state" in (r.json ?? {})) && !("users" in (r.json ?? {})), `GET ${path} → 401 without data`);
  }
  for (const [method, path] of [["POST", "/api/platform/email-kit/commit"], ["POST", "/api/platform/email-kit/files"], ["PUT", "/api/platform/email-kit/files/file12345678"], ["POST", "/api/platform/email-kit/snapshots"], ["POST", "/api/platform/admin/users"], ["PATCH", "/api/platform/admin/users/u_abcdefghijklmnop"], ["DELETE", "/api/platform/admin/users/u_abcdefghijklmnop"], ["POST", "/api/platform/admin/users/u_abcdefghijklmnop/link"], ["POST", "/api/platform/auth/password"]]) {
    const r = await http(path, { method, body: {} });
    ok(r.status === 401, `${method} ${path} → 401 (${r.status})`);
    const x = await http(path, { method, body: {}, origin: false });
    ok(x.status === 403, `${method} ${path} without same-origin → 403 (${x.status})`);
  }
  const forged = await http("/api/platform/owner", { method: "POST", body: { action: "create-admin" }, headers: { "oai-authenticated-user-id": "x", "oai-authenticated-user-email": "dipuraj.thapa@gmail.com" } });
  ok(forged.status === 404, `forged identity headers to owner setup → 404 (${forged.status})`);
  ok((await http("/robots.txt")).text.includes("Disallow: /platform"), "robots.txt disallows /platform");
  const bad = await http("/api/platform/auth/sign-in", { method: "POST", body: { email: "nobody@example.test", password: "wrong password 123" } });
  ok(bad.status === 401 && bad.json.error === "Email or password is incorrect.", "unknown account gets the generic sign-in error");

  section("Owner creates the first administrator (Sign in with ChatGPT, local mock)");
  const owner = await context();
  await owner.page.goto(`${BASE}/signin-with-chatgpt?return_to=/platform/owner`, { waitUntil: "networkidle" });
  ok(await owner.page.isVisible("text=Create the first administrator"), "owner page offers first-admin setup");
  await owner.page.fill("form:has(input[value=create-admin]) input[name=name]", "Asha Admin");
  await owner.page.fill("form:has(input[value=create-admin]) input[name=email]", "admin@example.test");
  await owner.page.fill("form:has(input[value=create-admin]) input[name=password]", PASS.admin);
  await owner.page.click("button:has-text('Create administrator')");
  await owner.page.waitForSelector(".wp-notice");
  ok(/Administrator created/.test(await owner.page.textContent(".wp-notice")), "first administrator created");
  const again = await owner.page.evaluate(async () => (await fetch("/api/platform/owner", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create-admin", name: "X", email: "x@example.test", password: "another long pass 1" }) })).status);
  ok(again === 409, "a second first-admin is refused once an administrator exists");
  await owner.ctx.close();

  section("Administrator invites the team with per-tool permissions");
  const A = await context();
  await signIn(A.page, "admin@example.test", PASS.admin);
  ok(await A.page.isVisible("a.wp-tool:has-text('Email Kit')"), "admin dashboard shows Email Kit");
  await A.page.screenshot({ path: `${OUT}/desktop-dashboard.png` });
  await A.page.goto(`${BASE}/platform/admin`, { waitUntil: "networkidle" });
  const links = {};
  for (const [key, email, level] of [["rina", "rina@example.test", "edit"], ["vik", "vikram@example.test", "view"], ["noor", "noor@example.test", "none"]]) {
    await A.page.fill("form[aria-labelledby=invite-title] input[name=email]", email);
    await A.page.selectOption("form[aria-labelledby=invite-title] select[name=tool-email-kit]", level);
    await A.page.click("button:has-text('Create invitation link')");
    await A.page.waitForSelector(".wp-link-box code");
    links[key] = (await A.page.textContent(".wp-link-box code")).trim();
    ok(links[key].startsWith(`${BASE}/platform/accept?token=`), `invitation link created for ${email} (${level})`);
    await A.page.click(".wp-link-box button:has-text('Done')");
  }
  await A.page.screenshot({ path: `${OUT}/desktop-team-access.png`, fullPage: true });
  const adminCookie = await cookieOf(A.ctx);
  const users = (await http("/api/platform/admin/users", { cookie: adminCookie })).json.users;
  const byEmail = e => users.find(u => u.email === e);
  ok(users.length === 4 && byEmail("rina@example.test").access["email-kit"] === "edit" && byEmail("vikram@example.test").access["email-kit"] === "view" && !byEmail("noor@example.test").access["email-kit"], "levels stored per tool");
  const selfDisable = await http(`/api/platform/admin/users/${byEmail("admin@example.test").id}`, { method: "PATCH", cookie: adminCookie, body: { status: "disabled" } });
  ok(selfDisable.status === 409, "an administrator cannot disable themself / the last administrator");
  const dupe = await http("/api/platform/admin/users", { method: "POST", cookie: adminCookie, body: { email: "RINA@example.test" } });
  ok(dupe.status === 409, "inviting an existing email (any case) is refused");

  section("Team members accept invitations");
  const people = {};
  for (const [key, name] of [["rina", "Rina Das"], ["vik", "Vikram Rao"], ["noor", "Noor Khan"]]) {
    const c = await context();
    await c.page.goto(links[key], { waitUntil: "networkidle" });
    await c.page.fill("input[name=name]", name);
    await c.page.fill("input[name=password]", PASS[key]);
    await c.page.fill("input[name=confirm]", PASS[key]);
    await Promise.all([c.page.waitForURL(`${BASE}/platform`), c.page.click("button:has-text('Create my account')")]);
    ok(c.page.url() === `${BASE}/platform`, `${name} lands on the dashboard after accepting`);
    people[key] = c;
  }
  const reuse = await context();
  await reuse.page.goto(links.rina, { waitUntil: "networkidle" });
  ok(await reuse.page.isVisible("text=This link cannot be used"), "an invitation link works only once");
  await reuse.ctx.close();
  ok(await people.rina.page.isVisible("a.wp-tool:has-text('Email Kit') >> text=Edit access"), "Rina sees Email Kit with Edit access");
  ok(await people.vik.page.isVisible("a.wp-tool:has-text('Email Kit') >> text=View access"), "Vikram sees Email Kit with View access");
  ok(await people.noor.page.isVisible("text=No tools are assigned"), "Noor sees no tools");
  const noorCookie = await cookieOf(people.noor.ctx);
  const noorPage = await http("/platform/email-kit", { cookie: noorCookie });
  ok(noorPage.status === 403 && !/<script/.test(noorPage.text), "Noor gets a 403 page for Email Kit with no app or data");
  ok((await http("/api/platform/email-kit/state", { cookie: noorCookie })).status === 403, "Noor's Email Kit data request → 403");
  ok((await http("/platform/admin", { cookie: noorCookie })).text.includes("Administrators only"), "non-admin sees no team list");
  ok((await http("/api/platform/admin/users", { cookie: noorCookie })).status === 403, "non-admin team API → 403");

  section("Email Kit: setup, first message and shared records");
  await openKit(A.page);
  ok(A.page._errors.length === 0, `Email Kit loads without script or CSP errors ${A.page._errors.join(" | ")}`);
  ok((await A.page.title()).includes("Email Kit") && !(await A.page.evaluate(() => document.body.innerText + document.title)).includes("Usha"), "page title and visible text say Email Kit, not Usha");
  await setupAgency(A.page);
  await firstMessage(A.page, "Asha Admin", "Priya Sharma", "Lumen Retail", "priya@lumen.example");
  let s = await state(A.page);
  ok(Object.values(s.msgs).some(m => m.status === "sent" && /Dear Priya/.test(m.body)), "first message recorded as sent");
  ok(Object.values(s.events).some(e => e.actor === "Asha Admin"), "history records the signed-in person");
  await A.page.reload(); await settle(A.page);
  ok(Object.keys((await state(A.page)).convs).length === 1, "record persists after reload");
  await A.page.screenshot({ path: `${OUT}/desktop-email-kit.png` });

  const R = people.rina;
  await openKit(R.page);
  await panel(R.page);
  ok((await R.page.textContent("#trackerList")).includes("Priya"), "Rina sees the conversation Asha recorded (shared workspace)");
  await firstMessage(R.page, "Rina Das", "Karan Mehta", "Birch Trading", "karan@birch.example");
  s = await state(R.page);
  ok(Object.keys(s.convs).length === 2, "Rina's conversation saved to the shared records");

  section("Opt-out, Undo and restriction safeguards");
  await reply(R.page, "Priya", "Please do not contact me again.");
  s = await state(R.page);
  let active = Object.values(s.suppressions).filter(x => x.status === "active");
  ok(active.length === 1, "opt-out recorded as an active restriction");
  const undoBtn = R.page.locator("#toast button:has-text('Undo')");
  if (await undoBtn.isVisible()) {
    await undoBtn.click(); await settle(R.page);
    s = await state(R.page);
    ok(Object.values(s.suppressions).length === 0, "on-screen Undo by the same person removes the new restriction");
    await reply(R.page, "Priya", "Please do not contact me again.");
    s = await state(R.page);
  } else ok(false, "Undo offered after an opt-out");
  active = Object.values(s.suppressions).filter(x => x.status === "active");
  ok(active.length === 1, "restriction recorded again");
  const x = active[0];
  const rev = (await http("/api/platform/email-kit/revision", { cookie: adminCookie })).json.rev;
  const commit = (cookie, command, changes, expected = rev) => http("/api/platform/email-kit/commit", { method: "POST", cookie, body: { expected, command, changes } });
  const rinaCookie = await cookieOf(R.ctx);
  const vikCookie = await cookieOf(people.vik.ctx);
  ok((await commit(adminCookie, "undo", [{ table: "suppressions", id: x.id, value: null }])).json.code === "RESTRICTION", "another person cannot delete the restriction, even as Undo");
  ok((await commit(adminCookie, "deleteContact", [{ table: "suppressions", id: x.id, value: null }])).json.code === "RESTRICTION", "a restriction cannot be deleted by any other step");
  ok((await commit(adminCookie, "liftRestriction", [{ table: "suppressions", id: x.id, value: { ...x, status: "lifted" } }])).json.code === "RESTRICTION", "lifting without a reason is refused");
  ok((await commit(adminCookie, "processResponse", [{ table: "suppressions", id: x.id, value: { ...x, status: "paused" } }])).status === 422, "an unknown restriction status fails the engine's row check");
  ok((await commit(adminCookie, "processResponse", [{ table: "suppressions", id: x.id, value: { ...x, nameKeys: [] } }])).json.code === "RESTRICTION", "restriction keys cannot be narrowed");
  ok((await commit(adminCookie, "processResponse", [{ table: "suppressions", id: x.id, value: { ...x, contactId: "someoneelse" } }])).json.code === "RESTRICTION", "restriction cannot be moved to another person");
  if (x.scope === "channel") ok((await commit(adminCookie, "processResponse", [{ table: "suppressions", id: x.id, value: { ...x, channels: [] } }])).status >= 403, "restriction channels cannot be removed");
  ok((await commit(adminCookie, "processResponse", [{ table: "suppressions", id: x.id, value: { ...x, scope: x.scope === "all" ? "channel" : "review" } }])).status >= 403, "restriction scope cannot be narrowed");
  ok((await commit(adminCookie, "markSent", [{ table: "events", id: Object.keys(s.events)[0], value: null }])).json.code === "HISTORY", "an ordinary step cannot delete history");
  // Security review findings: touch-then-undo, scope downgrade, moving a restriction off a deleted contact.
  const touched = await commit(adminCookie, "saveDraft", [{ table: "suppressions", id: x.id, value: x }]);
  ok(touched.status === 200, "rewriting a restriction unchanged is accepted as a no-op");
  ok((await commit(adminCookie, "undo", [{ table: "suppressions", id: x.id, value: null }], touched.json.rev)).json.code === "RESTRICTION", "touching a restriction does not open an Undo window for someone else's restriction");
  const s2 = (await http("/api/platform/email-kit/state", { cookie: adminCookie })).json.state;
  const rev3 = (await http("/api/platform/email-kit/revision", { cookie: adminCookie })).json.rev;
  ok(rev3 === touched.json.rev, "an unchanged restriction write does not change the stored row");
  const orgWide = { ...x, id: "xorgtest1", scope: "organisation", channels: [] };
  const made = await commit(adminCookie, "processResponse", [{ table: "suppressions", id: orgWide.id, value: orgWide }], rev3);
  ok(made.status === 200, "a company-wide restriction can be added");
  ok((await commit(adminCookie, "processResponse", [{ table: "suppressions", id: orgWide.id, value: { ...orgWide, scope: "all" } }], made.json.rev)).json.code === "RESTRICTION", "a company-wide restriction cannot be downgraded to one person");
  const contact = s2.contacts[x.contactId];
  ok((await commit(adminCookie, "deleteContact", [{ table: "contacts", id: contact.id, value: null }, { table: "suppressions", id: orgWide.id, value: { ...orgWide, contactId: "", contactKeys: [], nameKeys: [] } }], made.json.rev)).json.code === "RESTRICTION", "a restriction cannot be moved off a contact being deleted");
  ok((await commit(rinaCookie, "toString", [], made.json.rev)).json?.code === "LEVEL", "an unknown step name (even an inherited one like toString) needs Manage");
  ok((await commit(rinaCookie, "saveAgency", [{ table: "meta", id: "agency", value: { id: "agency", value: { name: "Other" } } }])).json.code === "LEVEL", "Edit access cannot change the agency profile");
  ok((await commit(rinaCookie, "markSent", [{ table: "meta", id: "settings", value: { id: "settings", value: {} } }])).status === 403, "settings cannot be smuggled into an ordinary step");
  ok((await commit(rinaCookie, "eraseAll", [])).json.code === "LEVEL", "Edit access cannot erase all records");
  ok((await commit(vikCookie, "markSent", [])).status === 403, "View access cannot save anything");
  ok((await commit(adminCookie, "markSent", [{ table: "orgs", id: "o1", value: { id: "o1", name: "X", keys: ["x"] } }], rev - 1)).json?.code === "STALE", "a commit against an old revision is refused as stale (409)");
  const liveRev = (await http("/api/platform/email-kit/revision", { cookie: adminCookie })).json.rev;
  const lifted = await commit(adminCookie, "liftRestriction", [{ table: "suppressions", id: x.id, value: { ...x, status: "lifted", liftedAt: new Date().toISOString(), liftReason: "Test: documented re-permission" } }], liveRev);
  ok(lifted.status === 200, "lifting with a stated reason is accepted");
  await commit(adminCookie, "processResponse", [{ table: "suppressions", id: x.id, value: { ...x, status: "active" } }], lifted.json.rev);
  ok((await http("/api/platform/admin/users", { cookie: adminCookie })).json.activity.some(a => a.action === "email_kit.restriction_lifted"), "restriction lift is in the audit log with the acting person");

  section("Email Kit as View only");
  const V = people.vik;
  await openKit(V.page);
  ok(await V.page.isVisible(".ek-readonly"), "view-only banner shown");
  ok(!(await V.page.isVisible("#generate")) && !(await V.page.isVisible("#saveAgency")), "drafting and setup controls hidden for View");
  await panel(V.page);
  ok((await V.page.textContent("#trackerList")).includes("Karan"), "View user can read shared records");
  ok((await http("/api/platform/email-kit/files/file12345678", { method: "PUT", cookie: vikCookie, body: { name: "a", type: "text/plain", data: "data:text/plain;base64,QQ==" } })).status === 403, "View user cannot upload");

  section("Follow-up falls due and is drafted by the person who continues it");
  const F = await context();
  await signIn(F.page, "rina@example.test", PASS.rina);
  await F.page.clock.setFixedTime(new Date(Date.now() + 8 * 86400_000));
  await openKit(F.page);
  s = await state(F.page);
  const karan = Object.values(s.convs).find(c => Object.values(s.contacts).find(k => k.id === c.contactId)?.name === "Karan Mehta");
  ok(karan && karan.status === "followUpDue", `Karan's conversation is follow-up due (${karan?.status})`);
  ok(!Object.values(s.msgs).some(m => m.auto && m.convId === karan?.id), "no follow-up drafted in the background");
  await panel(F.page);
  await click(F.page, `#trackerList li:has-text("Karan") button:has-text("Continue")`);
  ok(await F.page.inputValue("#senderName") === "Rina Das", "sender name is pre-filled from the signed-in account");
  await F.page.evaluate(() => { document.getElementById("senderBox").open = true; });
  await F.page.fill("#senderRole", "Business Development Manager");
  await click(F.page, "#generate");
  ok((await F.page.inputValue("#body")).includes("Karan"), "the person continuing drafts the reminder");
  await F.page.screenshot({ path: `${OUT}/desktop-follow-up.png` });
  await F.ctx.close();

  section("Attachments");
  await panel(R.page);
  await R.page.click("label[for=tab-folders]");
  await R.page.evaluate(() => document.querySelectorAll(".folder").forEach(d => { d.open = true; }));
  await click(R.page, ".folder:has-text('Birch') .folder-conv button");
  const sourcesSummary = R.page.locator("#recordBox summary:has-text('Sources')");
  if (await sourcesSummary.count()) await sourcesSummary.first().click();
  const file = resolve(OUT, "jd-note.txt");
  writeFileSync(file, "Fictional job description for testing.");
  await R.page.setInputFiles("#recordBox input[type=file]", file);
  await R.page.waitForFunction(() => document.getElementById("recordBox").textContent.includes("jd-note.txt"));
  const ids = (await http("/api/platform/email-kit/files", { cookie: rinaCookie })).json.ids;
  ok(ids.length === 1, "attachment stored on the server");
  const got = (await http(`/api/platform/email-kit/files/${ids[0]}`, { cookie: vikCookie })).json;
  ok(got && Buffer.from(got.data.split(",")[1], "base64").toString() === "Fictional job description for testing.", "attachment content round-trips");
  ok((await http("/api/platform/email-kit/files", { method: "POST", cookie: adminCookie, body: { action: "delete", ids } })).json.deleted === 0, "an attachment in use cannot be deleted");

  if (process.env.USHA_STANDALONE) {
    section("Migration from the original Usha 3.0 app");
    const U = await context();
    await U.page.goto("file://" + resolve(process.env.USHA_STANDALONE));
    await U.page.waitForSelector("body[data-ready]");
    await setupAgency(U.page);
    await firstMessage(U.page, "Meera Old", "Meera Iyer", "Cedar Foods", "meera@cedar.example");
    await firstMessage(U.page, "Meera Old", "Dev Sinha", "Maple Works", "dev@maple.example");
    await reply(U.page, "Dev", "Do not contact anyone at our company again.");
    const counts = await U.page.evaluate(() => new Promise(res => { const r = indexedDB.open("usha-records"); r.onsuccess = () => { const db = r.result; const out = {}; const t = db.transaction(["convs", "msgs", "suppressions", "contacts", "events"]); let n = 0; for (const name of ["convs", "msgs", "suppressions", "contacts", "events"]) { const q = t.objectStore(name).count(); q.onsuccess = () => { out[name] = q.result; if (++n === 5) res(out); }; } }; }));
    await U.page.evaluate(() => { document.getElementById("appBox").open = true; });
    await U.page.fill("#backupPassword", "migration passphrase 1");
    const [download] = await Promise.all([U.page.waitForEvent("download"), U.page.click("#exportBackup")]);
    const backupPath = resolve(OUT, "usha-backup.json");
    await download.saveAs(backupPath);
    ok(JSON.parse(readFileSync(backupPath, "utf8")).format === "usha-backup-v1", `original app produced a protected backup (${JSON.stringify(counts)})`);
    await U.ctx.close();

    const before = (await http("/api/platform/email-kit/summary", { cookie: adminCookie })).json.counts;
    await A.page.reload(); await settle(A.page);
    await A.page.evaluate(() => { document.getElementById("appBox").open = true; });
    await A.page.fill("#backupPassword", "wrong passphrase 123");
    await A.page.setInputFiles("#importFile", backupPath);
    await A.page.waitForFunction(() => /Could not unlock/.test(document.getElementById("backupStatus").textContent));
    ok(JSON.stringify((await http("/api/platform/email-kit/summary", { cookie: adminCookie })).json.counts) === JSON.stringify(before), "a wrong passphrase changes nothing");
    await A.page.fill("#backupPassword", "migration passphrase 1");
    await A.page.setInputFiles("#importFile", backupPath);
    await A.page.waitForSelector("#restoreReport:not([hidden])");
    await settle(A.page);
    const report = await A.page.textContent("#restoreReport");
    const rows = await A.page.$$eval("#restoreReport tbody tr", trs => trs.map(tr => [...tr.cells].map(td => td.textContent)));
    ok(rows.length > 0 && rows.every(r => r[4] === "0"), `every backup row accounted for and stored: ${rows.map(r => r.join("/")).join(", ")}`);
    ok(/every row in the backup is now saved/.test(report), "restore check reports nothing lost");
    const after = (await http("/api/platform/email-kit/summary", { cookie: adminCookie })).json.counts;
    ok(after.convs - (before.convs ?? 0) === counts.convs && after.suppressions - (before.suppressions ?? 0) === counts.suppressions, `server counts grew by the backup's conversations (${counts.convs}) and restrictions (${counts.suppressions})`);
    await A.page.screenshot({ path: `${OUT}/desktop-restore-report.png`, fullPage: false });
    await A.page.reload(); await settle(A.page);
    await A.page.evaluate(() => { document.getElementById("senderBox").open = true; });
    await A.page.fill("#recipientName", "New Person");
    await A.page.fill("#company", "Maple Works");
    await A.page.waitForTimeout(400);
    ok(await A.page.isDisabled("#generate"), "a migrated company-wide opt-out still blocks new outreach");
    await A.page.fill("#recipientName", ""); await A.page.fill("#company", "");
    const rina = (await http("/api/platform/email-kit/state", { cookie: rinaCookie })).json.state;
    ok(Object.values(rina.convs).length === after.convs, "migrated records are visible to other team members");
  } else results.push("SKIP  migration test (set USHA_STANDALONE to the original Usha 3.0 HTML)");

  section("Remove access, reset and sign-out");
  ok((await http(`/api/platform/admin/users/${byEmail("rina@example.test").id}`, { method: "PATCH", cookie: adminCookie, body: { access: { "email-kit": "none" } } })).status === 200, "admin removes Rina's Email Kit access");
  ok((await http("/api/platform/email-kit/state", { cookie: rinaCookie })).json?.code === "NO_TOOL_ACCESS", "Rina's next data request is refused");
  await R.page.evaluate(() => document.getElementById("generate").click()).catch(() => undefined);
  await R.page.reload();
  ok((await R.page.textContent("body")).includes("No access to Email Kit"), "Rina's reload shows no Email Kit");
  await http(`/api/platform/admin/users/${byEmail("rina@example.test").id}`, { method: "PATCH", cookie: adminCookie, body: { access: { "email-kit": "edit" } } });
  ok((await http(`/api/platform/admin/users/${byEmail("vikram@example.test").id}`, { method: "PATCH", cookie: adminCookie, body: { status: "disabled" } })).status === 200, "admin disables Vikram");
  ok((await http("/platform", { cookie: vikCookie })).status === 307, "Vikram's existing session no longer opens the platform");
  ok((await http("/api/platform/auth/sign-in", { method: "POST", body: { email: "vikram@example.test", password: PASS.vik } })).status === 401, "a disabled person cannot sign in");

  const reset = await http(`/api/platform/admin/users/${byEmail("rina@example.test").id}/link`, { method: "POST", cookie: adminCookie, body: { purpose: "reset" } });
  ok(reset.status === 200 && reset.json.link.includes("/platform/reset?token="), "admin creates a reset link");
  const Rr = await context();
  await Rr.page.goto(reset.json.link, { waitUntil: "networkidle" });
  await Rr.page.fill("input[name=password]", "copper meadow sunrise 72");
  await Rr.page.fill("input[name=confirm]", "copper meadow sunrise 72");
  await Promise.all([Rr.page.waitForURL(`${BASE}/platform`), Rr.page.click("button:has-text('Set new password')")]);
  ok((await http("/platform", { cookie: rinaCookie })).status === 307, "the reset ends Rina's older sessions");
  ok((await http("/api/platform/auth/sign-in", { method: "POST", body: { email: "rina@example.test", password: PASS.rina } })).status === 401, "the old password no longer works");
  ok((await http("/api/platform/auth/sign-in", { method: "POST", body: { email: "rina@example.test", password: "copper meadow sunrise 72" } })).status === 200, "the new password works");
  ok((await http(new URL(reset.json.link).pathname + new URL(reset.json.link).search)).text.includes("This link cannot be used"), "a reset link works only once");

  const N = people.noor;
  await N.page.goto(`${BASE}/platform/account`, { waitUntil: "networkidle" });
  await N.page.fill("input[name=current]", PASS.noor);
  await N.page.fill("input[name=next]", "granite willow evening 18");
  await N.page.fill("input[name=confirm]", "granite willow evening 18");
  await N.page.click("button:has-text('Change password')");
  await N.page.waitForSelector(".wp-notice");
  ok(/Password changed/.test(await N.page.textContent(".wp-notice")), "a member changes their own password");

  await openKit(Rr.page);
  await Rr.page.evaluate(() => localStorage.setItem("email-kit-sender", "{\"senderName\":\"Rina\"}"));
  await Promise.all([Rr.page.waitForURL(/signed_out=1/), Rr.page.click(".ek-bar button:has-text('Sign out')")]);
  ok(await Rr.page.isVisible("text=You are signed out"), "sign-out from Email Kit returns to sign-in");
  ok(await Rr.page.evaluate(() => localStorage.getItem("email-kit-sender")) === null, "sign-out clears Email Kit browser data");
  ok((await http("/platform", { cookie: await cookieOf(Rr.ctx) })).status === 307, "after sign-out the platform needs sign-in again");

  section("Mobile layout (360 px)");
  const M = await context({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await M.page.goto(`${BASE}/platform/sign-in`, { waitUntil: "networkidle" });
  ok(await noHorizontalScroll(M.page), "sign-in fits 360 px");
  await M.page.screenshot({ path: `${OUT}/mobile-sign-in.png` });
  await signIn(M.page, "admin@example.test", PASS.admin);
  ok(await noHorizontalScroll(M.page), "dashboard fits 360 px");
  await M.page.screenshot({ path: `${OUT}/mobile-dashboard.png` });
  await M.page.goto(`${BASE}/platform/admin`, { waitUntil: "networkidle" });
  await M.page.waitForSelector(".wp-user");
  ok(await noHorizontalScroll(M.page), "team access fits 360 px");
  await M.page.screenshot({ path: `${OUT}/mobile-team-access.png` });
  await openKit(M.page);
  ok(await noHorizontalScroll(M.page), "Email Kit fits 360 px");
  await M.page.screenshot({ path: `${OUT}/mobile-email-kit.png` });

  section("Public website regression");
  for (const path of ["/", "/privacy", "/terms", "/compliance", "/jobs/dummy-operations-coordinator", "/api/jobs"]) {
    const r = await http(path, { origin: false });
    ok(r.status === 200, `${path} → 200`);
  }
  ok((await http("/api/applications", { method: "POST", body: {} })).status === 503, "public intake stays read-only (demo)");
  ok((await http("/admin", { origin: false })).location.includes("signin-with-chatgpt"), "/admin still requires the site owner");
  const errors = [A, R, V, N, Rr, M].flatMap(c => c.page._errors).filter(e => !/Failed to fetch|Load failed|ERR_ABORTED/.test(e));
  ok(errors.length === 0, `no page errors (${errors.slice(0, 3).join(" | ")})`);
} catch (error) {
  fail++;
  results.push(`ERROR ${error.stack ?? error}`);
  console.log("ERROR", error);
} finally {
  await browser.close();
  const summary = `\n${pass} passed, ${fail} failed`;
  writeFileSync(resolve(OUT, "results.txt"), results.join("\n") + summary + "\n");
  console.log(summary);
  process.exit(fail ? 1 : 0);
}
