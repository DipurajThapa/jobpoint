// The merge plan (docs/WORKFLOWS_AND_MERGE_PLAN.md): the data inventory that
// precedes the merges, and merge 6, which links employers.
import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { world, root, mods, route, call, makeStaff } from "./helpers/world.mjs";

const inventoryLib = await import(resolve(root, "lib/platform/inventory.ts"));
const OWNER = { "oai-authenticated-user-id": "owner", "oai-authenticated-user-email": "dipuraj.thapa@gmail.com" };

async function enquiry(db, id, company) {
  await db.prepare("INSERT INTO employer_enquiries (id, contact_name, company, email, phone, role_title, location, headcount, details, consent) VALUES (?, 'Rina Das', ?, 'rina@alpha-steel.example', '9830033333', 'Accounts Executive', 'Durgapur', 2, 'Two accounts hires', 1)").bind(id, company).run();
}
async function org(db, id, name) {
  await db.prepare("INSERT INTO email_kit_records (tbl, id, data, updated_at, updated_by) VALUES ('orgs', ?, ?, ?, 'test')").bind(id, JSON.stringify({ id, name, keys: [name.toLowerCase()] }), new Date().toISOString()).run();
}

test("the data inventory counts every table in the plan and exposes numbers only", async () => {
  const w = await world();
  await enquiry(w.db, "enq-1", "Alpha Steel Works");
  const inv = await inventoryLib.dataInventory(w.db);
  assert.deepEqual(inv.groups.map(g => g.merge), ["1", "2", "3", "4", "5", "6", "7"]);
  const line = (merge, label) => inv.groups.find(g => g.merge === merge).lines.find(l => l.label === label);
  for (const g of inv.groups) for (const l of g.lines) assert.equal(typeof l.rows, "number", `${l.label} could not be counted`);
  assert.equal(line("1", "Candidate records with a portal account").rows, 2);
  assert.equal(line("2", "Pipeline entries").rows, 2);
  assert.equal(line("6", "Employer enquiries").rows, 1);
  assert.equal(line("6", "Clients").rows, 2);
  const text = inventoryLib.inventoryText(inv);
  assert.match(text, /Merge 6: Employers/);
  for (const secret of [w.asha.email, w.asha.name, w.asha.phone, "rina@alpha-steel.example", "Alpha Steel"]) assert.ok(!JSON.stringify(inv).includes(secret) && !text.includes(secret), `inventory leaks ${secret}`);
});

test("a table that a later merge removes is reported, not an error", async () => {
  const w = await world();
  w.db.raw.exec("DROP TABLE retired_service_enrolments");
  const inv = await inventoryLib.dataInventory(w.db);
  assert.equal(inv.groups.find(g => g.merge === "5").lines.find(l => l.table === "retired_service_enrolments").rows, null);
  assert.match(inventoryLib.inventoryText(inv), /Service enrolments: table removed/);
});

test("the inventory is for administrators only and changes nothing", async () => {
  const w = await world();
  const ops = await route("platform/admin/operations");
  const admin = await makeStaff(w.db, "boss", { admin: true }), member = await makeStaff(w.db, "rec-1", { team: "team-one" });
  const before = w.db.raw.prepare("SELECT COUNT(*) AS n FROM audit_events").get().n;
  assert.equal((await call(ops, "GET", "/api/platform/admin/operations?view=inventory")).status, 401);
  assert.equal((await call(ops, "GET", "/api/platform/admin/operations?view=inventory", { cookie: member })).status, 403);
  const ok = await call(ops, "GET", "/api/platform/admin/operations?view=inventory", { cookie: admin });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.inventory.groups.length, 7);
  assert.match(ok.json.text, /Jobboard300 data inventory/);
  assert.equal(w.db.raw.prepare("SELECT COUNT(*) AS n FROM audit_events").get().n, before);
});

test("merge 6: an enquiry records the client it became, and the link can be removed", async () => {
  const w = await world();
  await enquiry(w.db, "enq-1", "Alpha Steel Works");
  await mods.client.linkEnquiryToClient(w.db, "enq-1", w.A.id, "admin-1");
  assert.equal(w.db.raw.prepare("SELECT company_id FROM employer_enquiries WHERE id = 'enq-1'").get().company_id, w.A.id);
  const overview = await mods.views.adminOverview(w.db);
  assert.equal(overview.companies.find(c => c.id === w.A.id).enquiries, 1);
  assert.equal(overview.companies.find(c => c.id === w.B.id).enquiries, 0);
  await assert.rejects(mods.client.linkEnquiryToClient(w.db, "enq-1", "no-such-client", "admin-1"), /Client not found/);
  await assert.rejects(mods.client.linkEnquiryToClient(w.db, "no-such-enquiry", w.A.id, "admin-1"), /Enquiry not found/);
  await mods.client.linkEnquiryToClient(w.db, "enq-1", null, "admin-1");
  assert.equal(w.db.raw.prepare("SELECT company_id FROM employer_enquiries WHERE id = 'enq-1'").get().company_id, null);
  assert.deepEqual(w.db.raw.prepare("SELECT action FROM audit_events WHERE target_id = 'enq-1' ORDER BY rowid").all().map(r => r.action), ["enquiry.linked", "enquiry.unlinked"]);
});

test("merge 6: removing a client keeps the enquiry and clears its link", async () => {
  const w = await world();
  await enquiry(w.db, "enq-1", "Bravo Logistics");
  await mods.client.linkEnquiryToClient(w.db, "enq-1", w.B.id, "admin-1");
  await w.db.prepare("DELETE FROM companies WHERE id = ?").bind(w.B.id).run();
  const row = w.db.raw.prepare("SELECT company, company_id FROM employer_enquiries WHERE id = 'enq-1'").get();
  assert.equal(row.company, "Bravo Logistics");
  assert.equal(row.company_id, null);
});

test("merge 6: a client links to one Email Kit organisation, and an organisation to one client", async () => {
  const w = await world();
  await org(w.db, "o_alpha", "Alpha Steel"); await org(w.db, "o_bravo", "Bravo Logistics");
  assert.deepEqual((await mods.client.outreachOrgs(w.db)).map(o => o.name), ["Alpha Steel", "Bravo Logistics"]);
  await mods.client.linkClientToOutreach(w.db, w.A.id, "o_alpha", "admin-1");
  const row = (await mods.views.adminOverview(w.db)).companies.find(c => c.id === w.A.id);
  assert.equal(row.email_kit_org_id, "o_alpha"); assert.equal(row.outreach_org, "Alpha Steel");
  await assert.rejects(mods.client.linkClientToOutreach(w.db, w.B.id, "o_alpha", "admin-1"), /already linked to Alpha Steel Works/);
  await assert.rejects(mods.client.linkClientToOutreach(w.db, w.B.id, "o_missing", "admin-1"), /no longer exists/);
  await mods.client.linkClientToOutreach(w.db, w.A.id, null, "admin-1");
  await mods.client.linkClientToOutreach(w.db, w.B.id, "o_alpha", "admin-1");
  assert.equal(w.db.raw.prepare("SELECT email_kit_org_id FROM companies WHERE id = ?").get(w.A.id).email_kit_org_id, null);
});

test("merge 6: only the owner can link, through the owner console", async () => {
  const w = await world();
  await enquiry(w.db, "enq-1", "Alpha Steel Works");
  const portal = await route("admin/portal/[action]");
  const anon = await call(portal, "POST", "/api/admin/portal/enquiry-link", { action: "enquiry-link", body: { enquiryId: "enq-1", companyId: w.A.id } });
  assert.equal(anon.status, 401);
  const client = await call(portal, "POST", "/api/admin/portal/enquiry-link", { action: "enquiry-link", body: { enquiryId: "enq-1", companyId: w.A.id }, cookie: "portal_session=nope" });
  assert.equal(client.status, 401);
  assert.equal(w.db.raw.prepare("SELECT company_id FROM employer_enquiries WHERE id = 'enq-1'").get().company_id, null);
  const staff = await makeStaff(w.db, "rec-1", { team: "team-one", manager: true });
  assert.equal((await call(portal, "POST", "/api/admin/portal/enquiry-link", { action: "enquiry-link", body: { enquiryId: "enq-1", companyId: w.A.id }, cookie: staff })).status, 401);
  const cross = await call(portal, "POST", "/api/admin/portal/enquiry-link", { action: "enquiry-link", body: { enquiryId: "enq-1", companyId: w.A.id }, headers: OWNER, origin: "https://evil.example" });
  assert.equal(cross.status, 403);
  const ok = await call(portal, "POST", "/api/admin/portal/enquiry-link", { action: "enquiry-link", body: { enquiryId: "enq-1", companyId: w.A.id }, headers: OWNER });
  assert.equal(ok.status, 200, ok.text);
  const records = await call(await route("admin/records"), "GET", "/api/admin/records", { headers: OWNER });
  assert.equal(records.status, 200, records.text);
  assert.equal(records.json.enquiries.find(q => q.id === "enq-1").companyId, w.A.id);
  assert.deepEqual(records.json.clients.map(c => c.name), ["Alpha Steel Works", "Bravo Logistics"]);
  const overview = await call(portal, "GET", "/api/admin/portal/overview", { action: "overview", headers: OWNER });
  assert.equal(overview.json.companies.find(c => c.id === w.A.id).enquiries, 1);
  assert.deepEqual(overview.json.outreachOrgs, []);
});

// ---- Merge 7: one message table and one audit table ----
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";

const MIGRATIONS = resolve(root, "drizzle");
const migrationFiles = readdirSync(MIGRATIONS).filter(f => f.endsWith(".sql")).sort();
const applyFile = (db, file) => { for (const s of readFileSync(resolve(MIGRATIONS, file), "utf8").split("--> statement-breakpoint")) if (s.trim()) db.exec(s); };

test("merge 7: the migration carries every existing message and log entry across, in order", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const merge = "0016_one_message_and_audit_table.sql";
  for (const f of migrationFiles.filter(f => f < merge)) applyFile(db, f);
  const at = n => `2026-11-0${n}T10:00:00.000Z`;
  db.exec(`INSERT INTO candidates (id, display_name, last_active_at, created_at) VALUES ('cand-1', 'Asha', '${at(1)}', '${at(1)}');
    INSERT INTO companies (id, legal_name, display_name, created_at) VALUES ('co-1', 'Alpha Pvt Ltd', 'Alpha', '${at(1)}');
    INSERT INTO candidate_messages (id, candidate_id, kind, title, body, created_at, read_at) VALUES ('cm-1', 'cand-1', 'stage.submitted', 'Put forward', 'First', '${at(1)}', '${at(2)}'), ('cm-2', 'cand-1', 'stage.interview', 'Interview', 'Second', '${at(3)}', NULL);
    INSERT INTO company_notices (id, company_id, kind, title, body, created_at) VALUES ('cn-1', 'co-1', 'stage.joined', 'Joined', 'Notice', '${at(4)}');
    INSERT INTO outbound_messages (id, channel, recipient_kind, recipient_id, sender_scope, kind, body, status, status_detail, created_at) VALUES ('om-1', 'whatsapp', 'candidate', 'cand-1', 'admin', 'stage.submitted', 'Put forward\nFirst', 'queued', 'waiting', '${at(1)}');
    INSERT INTO audit_events (id, actor_id, action, target_type, target_id, detail) VALUES ('au-1', 'owner', 'jd.approved', 'jd', 'jd-1', 'ok');
    INSERT INTO access_log (id, actor_kind, actor_id, company_id, action, jd_id, candidate_ref, ip_hash, detail, at) VALUES ('al-1', 'company_user', 'user-1', 'co-1', 'download', 'jd-1', 'c_abc', 'iphash', '', '${at(5)}'), ('al-2', 'staff', 'rec-1', NULL, 'contact_view', 'jd-1', NULL, '', 'cand-1', '${at(6)}');`);
  applyFile(db, merge);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name);
  for (const gone of ["candidate_messages", "company_notices", "outbound_messages", "access_log"]) assert.ok(!tables.includes(gone), `${gone} still exists`);
  assert.deepEqual(db.prepare("SELECT id, recipient_kind, recipient_id, channel, title, status, read_at FROM messages ORDER BY id").all().map(r => ({ ...r })), [
    { id: "cm-1", recipient_kind: "candidate", recipient_id: "cand-1", channel: "inbox", title: "Put forward", status: "delivered", read_at: at(2) },
    { id: "cm-2", recipient_kind: "candidate", recipient_id: "cand-1", channel: "inbox", title: "Interview", status: "delivered", read_at: null },
    { id: "cn-1", recipient_kind: "company", recipient_id: "co-1", channel: "inbox", title: "Joined", status: "delivered", read_at: null },
    { id: "om-1", recipient_kind: "candidate", recipient_id: "cand-1", channel: "whatsapp", title: "", status: "queued", read_at: null },
  ]);
  assert.deepEqual(db.prepare("SELECT id, kind, actor_kind, actor_id, action, company_id, jd_id, candidate_ref, ip_hash, detail, created_at FROM audit_events WHERE kind = 'access' ORDER BY created_at").all().map(r => ({ ...r })), [
    { id: "al-1", kind: "access", actor_kind: "company_user", actor_id: "user-1", action: "download", company_id: "co-1", jd_id: "jd-1", candidate_ref: "c_abc", ip_hash: "iphash", detail: "", created_at: at(5) },
    { id: "al-2", kind: "access", actor_kind: "staff", actor_id: "rec-1", action: "contact_view", company_id: null, jd_id: "jd-1", candidate_ref: null, ip_hash: "", detail: "cand-1", created_at: at(6) },
  ]);
  assert.equal(db.prepare("SELECT kind FROM audit_events WHERE id = 'au-1'").get().kind, "change");
  for (const f of migrationFiles.filter(f => f > merge)) applyFile(db, f);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  // Removing the person or the client still removes their messages.
  db.exec("DELETE FROM candidates WHERE id = 'cand-1'");
  assert.deepEqual(db.prepare("SELECT id FROM messages").all().map(r => r.id), ["cn-1"]);
  db.exec("DELETE FROM companies WHERE id = 'co-1'");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM messages").get().n, 0);
});

test("merge 7: each side reads only its own inbox from the shared table", async () => {
  const w = await world();
  const notify = await import(resolve(root, "lib/portal/notify.ts"));
  const ashaInbox = await notify.candidateInbox(w.db, w.asha.id), bikramInbox = await notify.candidateInbox(w.db, w.bikram.id);
  assert.ok(ashaInbox.length && bikramInbox.length, "the submission in the standard world wrote no inbox message");
  await notify.notifyCompany(w.db, w.A.id, "test.notice", "For Alpha only", "Body");
  assert.ok((await notify.companyNotices(w.db, w.A.id)).some(n => n.title === "For Alpha only"));
  const bravoNotices = await notify.companyNotices(w.db, w.B.id);
  assert.ok(bravoNotices.length && bravoNotices.every(n => n.title !== "For Alpha only"), "Bravo read Alpha's notice");
  assert.equal(w.db.raw.prepare("SELECT COUNT(*) AS n FROM messages WHERE recipient_kind = 'company' AND recipient_id = ?").get(w.B.id).n, bravoNotices.length);
  // A candidate id is never read as a company id, or the other way round.
  assert.deepEqual(await notify.companyNotices(w.db, w.asha.id), []);
  assert.deepEqual(await notify.candidateInbox(w.db, w.A.id), []);
  // The WhatsApp queue copy is not shown in the inbox.
  assert.equal(w.db.raw.prepare("SELECT COUNT(*) AS n FROM messages WHERE recipient_id = ? AND channel = 'whatsapp'").get(w.asha.id).n, ashaInbox.length);
  await notify.markInboxRead(w.db, w.asha.id);
  assert.ok((await notify.candidateInbox(w.db, w.asha.id)).every(m => m.read_at));
  assert.ok((await notify.candidateInbox(w.db, w.bikram.id)).every(m => !m.read_at), "marking Asha's inbox read touched Bikram's");
  assert.ok((await notify.companyNotices(w.db, w.A.id)).every(m => !m.read_at));
});

test("merge 7: views are logged in the audit table and stay out of the activity lists", async () => {
  const w = await world();
  const access = await import(resolve(root, "lib/portal/access.ts"));
  assert.equal(await access.guard(w.db, { userId: w.A.userId, companyId: w.A.id, action: "list", jdId: w.A.jdId }), true);
  const row = w.db.raw.prepare("SELECT kind, actor_kind, company_id, jd_id, created_at FROM audit_events WHERE actor_id = ? AND action = 'list'").get(w.A.userId);
  assert.deepEqual({ ...row, created_at: null }, { kind: "access", actor_kind: "company_user", company_id: w.A.id, jd_id: w.A.jdId, created_at: null });
  const admin = await makeStaff(w.db, "boss", { admin: true });
  const ops = await call(await route("platform/admin/operations"), "GET", "/api/platform/admin/operations", { cookie: admin });
  assert.equal(ops.status, 200, ops.text);
  assert.ok(ops.json.activity.length);
  assert.ok(ops.json.activity.every(a => !["list", "submit", "contact_view", "download"].includes(a.action)), "views appeared in the administrators' activity list");
  const privacy = await call(await route("admin/privacy-requests"), "GET", "/api/admin/privacy-requests", { headers: OWNER });
  assert.ok(privacy.json.activity.every(a => a.targetType !== "access"));
});

// ---- Merges 4 and 5: one test system, one orders table ----
test("merges 4 and 5: retired tables keep their rows under a new name, and Fast Track orders become orders", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const first = "0017_one_test_system.sql";
  for (const f of migrationFiles.filter(f => f < first)) applyFile(db, f);
  const at = "2026-11-01T10:00:00.000Z";
  db.exec(`INSERT INTO candidates (id, display_name, last_active_at, created_at) VALUES ('cand-1', 'Asha', '${at}', '${at}');
    INSERT INTO assessments (id, owner_kind, title, items_per_form, time_limit_sec, status, created_by, created_at) VALUES ('as-1', 'platform', 'Excel', 5, 600, 'approved', 'admin', '${at}');
    INSERT INTO assessment_items (id, assessment_id, stem, options, answer_index, created_at) VALUES ('it-1', 'as-1', 'Q', '[]', 0, '${at}');
    INSERT INTO assessment_attempts (id, assessment_id, candidate_id, form, started_at, deadline_at, status, items, score) VALUES ('at-1', 'as-1', 'cand-1', '[]', '${at}', '${at}', 'submitted', 5, 0.8);
    INSERT INTO assessment_responses (attempt_id, item_id, position) VALUES ('at-1', 'it-1', 1);
    INSERT INTO services (id, code, category, name, created_at) VALUES ('sv-1', 'cv', 'cv_writing', 'CV writing', '${at}');
    INSERT INTO service_orders (id, candidate_id, service_id, created_at, updated_at) VALUES ('so-1', 'cand-1', 'sv-1', '${at}', '${at}');
    INSERT INTO service_enrolments (id, order_id, candidate_id, created_at) VALUES ('se-1', 'so-1', 'cand-1', '${at}');
    INSERT INTO payment_intents (id, payer_kind, payer_id, purpose, ref_id, amount_inr, created_at) VALUES ('pi-1', 'candidate', 'cand-1', 'service_order', 'so-1', 499, '${at}');
    INSERT INTO fast_track_orders (id, candidate_id, reference, amount_inr, status, created_at) VALUES ('ft-1', 'cand-1', 'FT-1', 1499, 'paid', '${at}');`);
  for (const f of migrationFiles.filter(f => f >= first)) applyFile(db, f);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name);
  for (const old of ["assessments", "assessment_items", "assessment_attempts", "assessment_responses", "services", "service_orders", "service_enrolments", "payment_intents", "fast_track_orders"]) assert.ok(!tables.includes(old), `${old} still exists`);
  for (const kept of ["retired_assessments", "retired_assessment_items", "retired_assessment_attempts", "retired_assessment_responses", "retired_services", "retired_service_orders", "retired_service_enrolments", "retired_payment_intents"])
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${kept}`).get().n, 1, `${kept} lost its row`);
  assert.equal(db.prepare("SELECT score FROM retired_assessment_attempts WHERE id = 'at-1'").get().score, 0.8);
  assert.deepEqual({ ...db.prepare("SELECT id, kind, reference, amount_inr, status FROM orders").get() }, { id: "ft-1", kind: "fast_track", reference: "FT-1", amount_inr: 1499, status: "paid" });
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  // Removing the person still removes their rows in the retired tables and their orders.
  db.exec("DELETE FROM candidates WHERE id = 'cand-1'");
  for (const t of ["retired_assessment_attempts", "retired_assessment_responses", "retired_service_orders", "retired_service_enrolments", "orders"]) assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n, 0, `${t} kept the person's row`);
});

test("merge 4: the old test routes are gone and matching reads adaptive results", async () => {
  const w = await world();
  const candidate = await route("portal/candidate/[action]"), company = await route("portal/company/[action]"), owner = await route("admin/portal/[action]");
  const { portalCookie } = await import("./helpers/world.mjs");
  const asha = await portalCookie(w.asha.email), alpha = await portalCookie(w.A.email);
  assert.equal((await call(candidate, "GET", "/api/portal/candidate/assessments", { cookie: asha, action: "assessments" })).status, 404);
  assert.equal((await call(candidate, "POST", "/api/portal/candidate/assessment-start", { cookie: asha, action: "assessment-start", body: { assessmentId: "x" } })).status, 404);
  assert.equal((await call(company, "POST", "/api/portal/company/assessment-create", { cookie: alpha, action: "assessment-create", body: { jdId: w.A.jdId, title: "x", items: [] } })).status, 404);
  const gone = await call(owner, "POST", "/api/admin/portal/attempt-review", { action: "attempt-review", body: { attemptId: "x", accept: true }, headers: OWNER });
  assert.ok(gone.status >= 400, "the owner console still reviews old test attempts");
  // A completed adaptive technical test is the test evidence the scorer receives.
  const at = new Date().toISOString();
  await w.db.prepare("INSERT INTO question_banks (id, kind, title, skill_id, status, created_by, created_at, updated_at) VALUES ('bank-tally', 'technical', 'Tally', 'tally', 'active', 'admin', ?, ?)").bind(at, at).run();
  await w.db.prepare("INSERT INTO adaptive_tests (id, bank_id, candidate_id, status, final_level, created_at, completed_at) VALUES ('t-1', 'bank-tally', ?, 'completed', 8, ?, ?)").bind(w.asha.id, at, at).run();
  const adaptive = await import(resolve(root, "lib/portal/adaptive.ts")), queue = await import(resolve(root, "lib/portal/queue.ts"));
  assert.deepEqual(Object.keys(await adaptive.adaptiveEvidence(w.db, w.asha.id)), ["tally"]);
  await mods.company.enqueue(w.db, "candidate", w.asha.id, "test").run();
  await queue.drainQueue(w.db, "test-secret-test-secret-test-secret-123", 400);
  const match = w.db.raw.prepare("SELECT explanation FROM matches WHERE candidate_id = ? AND jd_id = ?").get(w.asha.id, w.A.jdId);
  assert.match(match.explanation, /verified/, "the adaptive result did not reach the match explanation");
});

test("merge 5: a Fast Track request is written to the one orders table", async () => {
  const w = await world();
  const adaptive = await import(resolve(root, "lib/portal/adaptive.ts"));
  await adaptive.saveFastTrackSettings(w.db, 1499, "Pay by UPI", "admin");
  const order = await adaptive.requestFastTrack(w.db, w.asha.id);
  const row = w.db.raw.prepare("SELECT kind, status, amount_inr, candidate_id FROM orders WHERE reference = ?").get(order.reference);
  assert.deepEqual({ ...row }, { kind: "fast_track", status: "awaiting_payment", amount_inr: 1499, candidate_id: w.asha.id });
  const listed = await adaptive.fastTrackOrders(w.db);
  await adaptive.decideFastTrackOrder(w.db, listed[0].id, true, "received", "admin");
  assert.equal(w.db.raw.prepare("SELECT status FROM orders WHERE reference = ?").get(order.reference).status, "paid");
  assert.equal(await adaptive.isFastTrack(w.db, w.asha.id), true);
});

// ---- Merge 1: one person record ----
const { PASSWORD } = await import("./helpers/world.mjs");
const webApp = (id, email, extra = {}) => ({ id, jobId: null, fullName: "Chitra Sen", email, phone: "9830055555", location: "Kolkata", shareConsent: true, futureConsent: true, privacyVersion: "2026-11-09", resumeName: null, ...extra });
const authCall = async (action, body) => call(await route("portal/auth/[action]"), "POST", `/api/portal/auth/${action}`, { action, body });
const liveRecords = (db, hash) => db.raw.prepare("SELECT id, account_id FROM candidates WHERE dedupe_email_hash = ? AND status IN ('active','review')").all(hash);
const hashOf = (db, id) => db.raw.prepare("SELECT dedupe_email_hash AS h FROM candidates WHERE id = ?").get(id).h;

test("merge 1: a website applicant who then verifies a portal account ends up as one record", async () => {
  const w = await world();
  const email = "chitra.sen@person.example";
  const site = await mods.website.linkWebsiteApplication(w.db, w.BUCKET, webApp("app-c1", email), null);
  await mods.client.submitByRecruiter(w.db, "test-secret-test-secret-test-secret-123", { companyId: w.A.id, jdId: w.A.jdId, candidateId: site.candidateId, note: "From the website." }, "admin-1").catch(() => null);
  const accountId = await mods.accounts.createAccount(w.db, "candidate", email, PASSWORD, "9830055555");
  await mods.candidate.createCandidate(w.db, { accountId, displayName: "Chitra Sen", email, phone: "9830055555", currentCity: "Kolkata" });
  // Until the portal has verified the address, the two records stay apart.
  assert.equal(liveRecords(w.db, hashOf(w.db, site.candidateId)).length, 2);
  const token = await mods.accounts.issuePortalToken(w.db, accountId, "verify", 48);
  assert.equal((await authCall("verify", { token })).status, 200);
  const live = liveRecords(w.db, hashOf(w.db, site.candidateId));
  assert.equal(live.length, 1, "two live records remain for one person");
  assert.equal(live[0].account_id, accountId);
  const old = w.db.raw.prepare("SELECT status, merged_into FROM candidates WHERE id = ?").get(site.candidateId);
  assert.deepEqual({ ...old }, { status: "merged", merged_into: live[0].id });
  // The application and any pipeline history follow the person.
  assert.equal(w.db.raw.prepare("SELECT candidate_id FROM candidate_sources WHERE ref_id = 'app-c1'").get().candidate_id, live[0].id);
  assert.equal(w.db.raw.prepare("SELECT COUNT(*) AS n FROM pipeline WHERE candidate_id = ?").get(site.candidateId).n, 0);
  assert.equal(w.db.raw.prepare("SELECT COUNT(*) AS n FROM duplicate_flags WHERE status = 'open' AND (a_id = ? OR b_id = ?)").get(site.candidateId, site.candidateId).n, 0);
  assert.ok(w.db.raw.prepare("SELECT 1 AS x FROM messages WHERE recipient_id = ? AND kind = 'record.merged'").get(live[0].id), "the person was not told");
  // Running it again changes nothing.
  assert.equal(await mods.website.mergeVerifiedDuplicates(w.db, accountId), 0);
});

test("merge 1: signing in merges website records made before this existed", async () => {
  const w = await world();
  // Asha has a verified account. A website-only record with her email exists from earlier.
  const earlier = await mods.candidate.createCandidate(w.db, { accountId: null, displayName: "Asha M", email: w.asha.email, phone: "9830099999", currentCity: "Durgapur" });
  await w.db.prepare("INSERT INTO candidate_sources (id, candidate_id, kind, ref_id, created_at) VALUES ('src-old', ?, 'website_application', 'app-old', ?)").bind(earlier, new Date().toISOString()).run();
  const { portalCookie } = await import("./helpers/world.mjs");
  await portalCookie(w.asha.email);
  assert.equal(w.db.raw.prepare("SELECT status FROM candidates WHERE id = ?").get(earlier).status, "merged");
  assert.equal(w.db.raw.prepare("SELECT candidate_id FROM candidate_sources WHERE ref_id = 'app-old'").get().candidate_id, w.asha.id);
  // A client signing in merges nothing.
  await portalCookie(w.A.email);
  assert.equal(w.db.raw.prepare("SELECT COUNT(*) AS n FROM candidates WHERE status = 'merged'").get().n, 1);
});

test("merge 1: an unverified account never takes over a website record, and other people are untouched", async () => {
  const w = await world();
  const email = "deepa.roy@person.example";
  const site = await mods.website.linkWebsiteApplication(w.db, w.BUCKET, webApp("app-d1", email, { fullName: "Deepa Roy" }), null);
  const other = await mods.website.linkWebsiteApplication(w.db, w.BUCKET, webApp("app-e1", "someone.else@person.example", { fullName: "Someone Else", phone: "9830066666" }), null);
  const accountId = await mods.accounts.createAccount(w.db, "candidate", email, PASSWORD, "9830055555");
  await mods.candidate.createCandidate(w.db, { accountId, displayName: "Not Deepa", email, phone: "9830055555" });
  assert.equal(await mods.website.mergeVerifiedDuplicates(w.db, accountId), 0, "an account that has not verified its email took over a website record");
  assert.equal(w.db.raw.prepare("SELECT status FROM candidates WHERE id = ?").get(site.candidateId).status, "active");
  assert.equal(await mods.website.mergeVerifiedDuplicates(w.db, w.asha.accountId), 0);
  assert.equal(await mods.website.mergeVerifiedDuplicates(w.db, w.A.userId), 0);
  assert.equal(w.db.raw.prepare("SELECT status FROM candidates WHERE id = ?").get(other.candidateId).status, "active");
});

test("merge 1: a website form sent with a verified account's email joins the record without changing its CV or consents", async () => {
  const w = await world();
  const before = {
    cv: w.db.raw.prepare("SELECT id, r2_key FROM cvs WHERE candidate_id = ? AND is_primary = 1").get(w.asha.id),
    consents: w.db.raw.prepare("SELECT COUNT(*) AS n FROM candidate_consents WHERE candidate_id = ?").get(w.asha.id).n,
    name: w.db.raw.prepare("SELECT display_name FROM candidates WHERE id = ?").get(w.asha.id).display_name,
  };
  const out = await mods.website.linkWebsiteApplication(w.db, w.BUCKET, webApp("app-a9", w.asha.email.toUpperCase(), { fullName: "Somebody Else", resumeName: "other.pdf" }), new TextEncoder().encode("not asha's cv"));
  assert.equal(out.candidateId, w.asha.id);
  assert.equal(out.created, false); assert.equal(out.cv, "none");
  assert.equal(liveRecords(w.db, hashOf(w.db, w.asha.id)).length, 1, "a second record was created for a verified account's email");
  assert.deepEqual({ ...w.db.raw.prepare("SELECT id, r2_key FROM cvs WHERE candidate_id = ? AND is_primary = 1").get(w.asha.id) }, { ...before.cv });
  assert.equal(w.db.raw.prepare("SELECT COUNT(*) AS n FROM cvs WHERE candidate_id = ?").get(w.asha.id).n, 1);
  assert.equal(w.db.raw.prepare("SELECT COUNT(*) AS n FROM candidate_consents WHERE candidate_id = ?").get(w.asha.id).n, before.consents, "the form's ticks were applied to the account");
  assert.equal(w.db.raw.prepare("SELECT display_name FROM candidates WHERE id = ?").get(w.asha.id).display_name, before.name);
  assert.ok(w.db.raw.prepare("SELECT 1 AS x FROM messages WHERE recipient_id = ? AND kind = 'record.application_added'").get(w.asha.id));
  // Bikram's record is not involved.
  assert.equal(w.db.raw.prepare("SELECT COUNT(*) AS n FROM candidate_sources WHERE candidate_id = ?").get(w.bikram.id).n, 0);
});
