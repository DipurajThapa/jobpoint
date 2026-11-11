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
  assert.match(text, /6\. Employers/);
  for (const secret of [w.asha.email, w.asha.name, w.asha.phone, "rina@alpha-steel.example", "Alpha Steel"]) assert.ok(!JSON.stringify(inv).includes(secret) && !text.includes(secret), `inventory leaks ${secret}`);
});

test("a table the inventory cannot read is reported, not an error", async () => {
  const w = await world();
  w.db.raw.exec("DROP TABLE placements");
  const inv = await inventoryLib.dataInventory(w.db);
  assert.equal(inv.groups.find(g => g.merge === "2").lines.find(l => l.table === "placements").rows, null);
  assert.match(inventoryLib.inventoryText(inv), /Placements: table removed/);
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
  assert.equal(w.db.raw.prepare("SELECT COUNT(*) AS n FROM messages WHERE recipient_kind = 'company' AND recipient_id = ? AND channel = 'inbox'").get(w.B.id).n, bravoNotices.length);
  // Each notice also has its email copy, which is not shown as a second notice.
  assert.equal(w.db.raw.prepare("SELECT COUNT(*) AS n FROM messages WHERE recipient_kind = 'company' AND recipient_id = ? AND channel = 'email'").get(w.B.id).n, bravoNotices.length);
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
test("merges 4 and 5: the old test and services tables are gone, and Fast Track orders become orders", () => {
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
  // 0020 drops the retired tables for good (the owner confirmed there is no live data).
  assert.deepEqual(tables.filter(t => t.startsWith("retired_")), []);
  for (const gone of ["plans", "company_subscriptions", "quota_ledger"]) assert.ok(!tables.includes(gone), `${gone} still exists`);
  assert.deepEqual({ ...db.prepare("SELECT id, kind, reference, amount_inr, status FROM orders").get() }, { id: "ft-1", kind: "fast_track", reference: "FT-1", amount_inr: 1499, status: "paid" });
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  // Removing the person still removes their orders.
  db.exec("DELETE FROM candidates WHERE id = 'cand-1'");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders").get().n, 0);
});

test("merge 4: the old test routes are gone and matching reads adaptive results", async (t) => {
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
  // During the pilot a test only paying candidates can take never reaches the ranking.
  const { PILOT_RULES } = await import(resolve(root, "lib/portal/policy.ts"));
  assert.deepEqual(await adaptive.adaptiveEvidence(w.db, w.asha.id), {});
  PILOT_RULES.paidResultsAffectSelection = true;
  t.after(() => { PILOT_RULES.paidResultsAffectSelection = false; });
  assert.deepEqual(Object.keys(await adaptive.adaptiveEvidence(w.db, w.asha.id)), ["tally"]);
  await mods.company.enqueue(w.db, "candidate", w.asha.id, "test").run();
  await queue.drainQueue(w.db, "test-secret-test-secret-test-secret-123", 400);
  const match = w.db.raw.prepare("SELECT explanation FROM matches WHERE candidate_id = ? AND jd_id = ?").get(w.asha.id, w.A.jdId);
  assert.match(match.explanation, /verified/, "the adaptive result did not reach the match explanation");
});

test("merge 5: a Fast Track request is written to the one orders table", async (t) => {
  const w = await world();
  const adaptive = await import(resolve(root, "lib/portal/adaptive.ts"));
  await adaptive.saveFastTrackSettings(w.db, 1499, "Pay by UPI", "admin");
  // Fast Track is not offered during the pilot.
  const { PILOT_RULES } = await import(resolve(root, "lib/portal/policy.ts"));
  await assert.rejects(adaptive.requestFastTrack(w.db, w.asha.id), e => e.code === "NOT_OFFERED");
  PILOT_RULES.fastTrack = true;
  t.after(() => { PILOT_RULES.fastTrack = false; });
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

// ---- Merge 2: one vacancy record and one pipeline ----
const vacancy = await import(resolve(root, "lib/portal/vacancy.ts"));
const queueLib = await import(resolve(root, "lib/portal/queue.ts"));
const { SECRET, profile: cvProfile } = await import("./helpers/world.mjs");
const ROLE = { title: "Accounts Executive", location: "Durgapur", employmentType: "Full-time", workMode: "On-site", sector: "Accounts", description: "We are hiring an Accounts Executive in Durgapur for a manufacturing client. B.Com with 2-5 years of experience.", requirements: "Must have Tally, GST returns and bank reconciliation. Salary 3 to 4.5 LPA." };
const jobsRoute = () => route("admin/jobs"), jobRoute = () => route("admin/jobs/[id]");
// Only an authorised vacancy of a client with a signed mandate is published: these tests post roles for Alpha, which has one.
const AUTHORISED = { authorisedBy: "Priya Sharma, HR manager", authorisedOn: "2026-11-01" };
const mandate = (w) => w.db.prepare("UPDATE companies SET mandate_signed_on = '2026-10-30', mandate_reference = 'signed-mandate.pdf' WHERE id = ?").bind(w.A.id).run();
const postRole = async (body) => call(await jobsRoute(), "POST", "/api/admin/jobs", { headers: OWNER, body: { ...ROLE, ...AUTHORISED, ...body } });

/** A website applicant with a parsed CV: name, whether they ticked the two optional boxes, and the role applied to. */
async function websiteApplicant(w, id, name, email, { jobId = null, share = false, future = false } = {}) {
  await w.db.prepare("INSERT INTO applications (id, job_id, full_name, email, phone, location, experience, consent, share_consent, future_consent) VALUES (?, ?, ?, ?, '9830077777', 'Durgapur', 'four years', 1, ?, ?)").bind(id, jobId, name, email, share ? 1 : 0, future ? 1 : 0).run();
  const out = await mods.website.linkWebsiteApplication(w.db, w.BUCKET, { id, jobId, fullName: name, email, phone: "9830077777", location: "Durgapur", shareConsent: share, futureConsent: future, privacyVersion: "2026-11-09", resumeName: null }, null);
  const r2Key = `portal-cv/${out.candidateId}/one`;
  await w.BUCKET.put(r2Key, new TextEncoder().encode(`CV of ${name}`));
  await mods.candidate.addCv(w.db, out.candidateId, { r2Key, fileName: "cv.pdf", fileType: "pdf", size: 1000, sha256: `sha-${id}`, text: `${name} accounts executive with tally gst and bank reconciliation in durgapur ${id}`, profile: cvProfile(name, email, "9830077777"), parseOk: true });
  await mods.company.enqueue(w.db, "candidate", out.candidateId, "test").run();
  await queueLib.drainQueue(w.db, SECRET, 400);
  return out.candidateId;
}

test("merge 2: a role posted in the owner console is one vacancy, under the house client or the chosen client", async () => {
  const w = await world();
  const house = await postRole({ status: "published" });
  assert.equal(house.status, 201, house.text);
  // A role for no client is not an employer's authorised vacancy: it is kept as a draft, with the reason.
  assert.match(house.json.message, /not published/i);
  const jd = w.db.raw.prepare("SELECT company_id, status, service, title FROM jds WHERE id = ?").get(house.json.id);
  assert.deepEqual({ ...jd }, { company_id: vacancy.HOUSE_CLIENT_ID, status: "draft", service: "managed", title: ROLE.title });
  // A client without a signed mandate cannot have a role published either; with one, it can.
  const noMandate = await postRole({ status: "published", companyId: w.A.id });
  assert.match(noMandate.json.message, /mandate/i);
  await mandate(w);
  const ok = await postRole({ status: "published", companyId: w.A.id });
  assert.equal(w.db.raw.prepare("SELECT status FROM jds WHERE id = ?").get(ok.json.id).status, "live");
  assert.equal(w.db.raw.prepare("SELECT status FROM jobs WHERE id = ?").get(ok.json.id).status, "published");
  assert.equal(w.db.raw.prepare("SELECT status FROM companies WHERE id = ?").get(vacancy.HOUSE_CLIENT_ID).status, "active");
  assert.ok(JSON.parse(w.db.raw.prepare("SELECT requirements FROM jds WHERE id = ?").get(house.json.id).requirements).roleFamily, "the role's requirements were not parsed");
  const forClient = await postRole({ status: "draft", companyId: w.A.id });
  assert.deepEqual({ ...w.db.raw.prepare("SELECT company_id, status FROM jds WHERE id = ?").get(forClient.json.id) }, { company_id: w.A.id, status: "draft" });
  // A client that is not active cannot be given a role, and no half-made role is left behind.
  await w.db.prepare("UPDATE companies SET status = 'suspended' WHERE id = ?").bind(w.B.id).run();
  const before = w.db.raw.prepare("SELECT COUNT(*) AS n FROM jobs").get().n;
  assert.equal((await postRole({ companyId: w.B.id })).status, 400);
  assert.equal(w.db.raw.prepare("SELECT COUNT(*) AS n FROM jobs").get().n, before);
  // The list shows the client; the house client is not offered as a client to pick, or to link an enquiry to.
  const list = await call(await jobsRoute(), "GET", "/api/admin/jobs", { headers: OWNER });
  assert.equal(list.json.jobs.find(j => j.id === house.json.id).clientName, "Jobboard300");
  assert.equal(list.json.jobs.find(j => j.id === forClient.json.id).clientName, "Alpha Steel Works");
  assert.ok(!list.json.clients.some(c => c.id === vacancy.HOUSE_CLIENT_ID));
  const records = await call(await route("admin/records"), "GET", "/api/admin/records", { headers: OWNER });
  assert.ok(!records.json.clients.some(c => c.id === vacancy.HOUSE_CLIENT_ID));
  // Only the owner posts roles.
  assert.equal((await call(await jobsRoute(), "POST", "/api/admin/jobs", { body: ROLE })).status, 401);
});

test("merge 2: publishing, unpublishing and closing a role moves the same vacancy", async () => {
  const w = await world();
  await mandate(w);
  const role = (await postRole({ status: "draft", companyId: w.A.id })).json.id;
  const set = async (status) => call(await jobRoute(), "PATCH", `/api/admin/jobs/${role}`, { headers: OWNER, body: { status }, params: { id: role } });
  const jd = () => w.db.raw.prepare("SELECT status FROM jds WHERE id = ?").get(role).status;
  assert.equal(jd(), "draft");
  await set("published"); assert.equal(jd(), "live");
  await set("draft"); assert.equal(jd(), "paused");
  await set("published"); assert.equal(jd(), "live");
  await set("closed"); assert.equal(jd(), "closed");
  assert.equal(w.db.raw.prepare("SELECT status FROM jobs WHERE id = ?").get(role).status, "closed");
});

test("merge 2: roles posted before this get their vacancy record when the owner opens the list", async () => {
  const w = await world();
  await w.db.prepare("INSERT INTO jobs (id, title, location, employment_type, description, requirements, status) VALUES ('old-role', 'Store Keeper', 'Asansol', 'Full-time', 'Short text.', '', 'published')").run();
  assert.equal(w.db.raw.prepare("SELECT COUNT(*) AS n FROM jds WHERE id = 'old-role'").get().n, 0);
  await call(await jobsRoute(), "GET", "/api/admin/jobs", { headers: OWNER });
  assert.deepEqual({ ...w.db.raw.prepare("SELECT company_id, status FROM jds WHERE id = 'old-role'").get() }, { company_id: vacancy.HOUSE_CLIENT_ID, status: "live" });
  assert.equal(await vacancy.backfillVacancies(w.db, "owner"), 0);
});

test("merge 2: a website application to a role enters that vacancy's shortlist, and nothing else", async () => {
  const w = await world();
  await mandate(w);
  const role = (await postRole({ status: "published", companyId: w.A.id })).json.id;
  // Ticked "share my CV with the employer for this role" only: not the general matching box.
  const farah = await websiteApplicant(w, "app-f1", "Farah Khan", "farah.khan@person.example", { jobId: role, share: true });
  assert.deepEqual({ ...w.db.raw.prepare("SELECT jd_id, status FROM portal_applications WHERE candidate_id = ?").get(farah) }, { jd_id: role, status: "applied" });
  // Scored for the role applied to, and for no other job (Alpha's own job and Bravo's job are live too).
  assert.deepEqual(w.db.raw.prepare("SELECT jd_id FROM matches WHERE candidate_id = ?").all(farah).map(r => r.jd_id), [role]);
  const shortlist = await mods.client.submissionCandidates(w.db, role);
  const row = shortlist.find(c => c.candidate_id === farah);
  assert.ok(row, "the applicant is not in the role's shortlist");
  assert.equal(row.applied, 1); assert.equal(row.can_share, 1); assert.equal(row.source, "website");
  assert.ok(!(await mods.client.submissionCandidates(w.db, w.B.jdId)).some(c => c.candidate_id === farah), "the applicant appeared in another client's shortlist");
  // The recruiter can submit them to this role on the strength of that tick, but to no other job.
  await assert.rejects(mods.client.submitByRecruiter(w.db, SECRET, { companyId: w.B.id, jobId: w.B.jdId, jdId: w.B.jdId, candidateId: farah, note: "x" }, "admin-1"), /not consented/);
  await assert.rejects(mods.client.submitByRecruiter(w.db, SECRET, { companyId: w.A.id, jdId: w.A.jdId, candidateId: farah, note: "x" }, "admin-1"), /not consented/);
  await mods.client.submitByRecruiter(w.db, SECRET, { companyId: w.A.id, jdId: role, candidateId: farah, note: "Applied on the website; strong Tally." }, "admin-1");
  assert.equal(w.db.raw.prepare("SELECT stage FROM pipeline WHERE jd_id = ? AND candidate_id = ?").get(role, farah).stage, "submitted");
  // The owner console shows where the application stands and how many applied.
  const records = await call(await route("admin/records"), "GET", "/api/admin/records", { headers: OWNER });
  assert.deepEqual((({ stage, submissions, inCandidateList }) => ({ stage, submissions, inCandidateList }))(records.json.applications.find(a => a.id === "app-f1")), { stage: "submitted", submissions: 1, inCandidateList: true });
  const list = await call(await jobsRoute(), "GET", "/api/admin/jobs", { headers: OWNER });
  assert.deepEqual((({ applicants, inPipeline }) => ({ applicants, inPipeline }))(list.json.jobs.find(j => j.id === role)), { applicants: 1, inPipeline: 1 });
});

test("merge 2: an applicant who did not tick the sharing box is shortlisted but cannot be submitted", async () => {
  const w = await world();
  await mandate(w);
  const role = (await postRole({ status: "published", companyId: w.A.id })).json.id;
  const gita = await websiteApplicant(w, "app-g1", "Gita Paul", "gita.paul@person.example", { jobId: role });
  const row = (await mods.client.submissionCandidates(w.db, role)).find(c => c.candidate_id === gita);
  assert.ok(row); assert.equal(row.applied, 1); assert.ok(!row.can_share);
  await assert.rejects(mods.client.submitByRecruiter(w.db, SECRET, { companyId: w.A.id, jdId: role, candidateId: gita, note: "x" }, "admin-1"), /not consented/);
});

test("merge 2: the old stage list is read-only and CV screening is gone", async () => {
  const w = await world();
  await w.db.prepare("INSERT INTO applications (id, full_name, email, phone, location, experience, consent, status, recruiter_notes) VALUES ('app-h1', 'Hari Das', 'hari.das@person.example', '9830088888', 'Kolkata', 'two years', 1, 'qualified', 'old note')").run();
  const rec = await route("admin/records/[type]/[id]");
  const patch = body => call(rec, "PATCH", "/api/admin/records/applications/app-h1", { headers: OWNER, body, params: { type: "applications", id: "app-h1" } });
  const moved = await patch({ status: "interview" });
  assert.equal(moved.status, 409); assert.match(moved.json.error, /Recruiting tool/);
  assert.equal((await patch({ notes: "new note" })).status, 200);
  assert.deepEqual({ ...w.db.raw.prepare("SELECT status, recruiter_notes FROM applications WHERE id = 'app-h1'").get() }, { status: "qualified", recruiter_notes: "new note" });
  const tables = w.db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name);
  assert.ok(!tables.some(t => t.includes("ats_screenings") || t.includes("ats_job_profiles")));
  await assert.rejects(import(resolve(root, "app/api/admin/ats/route.ts")));
});

// ---- Contact details on the candidate record, and merge 3 (self-service removed) ----
test("a candidate record carries the person's email and phone, from the portal and from the website", async () => {
  const w = await world();
  // Portal sign-up.
  assert.deepEqual({ ...w.db.raw.prepare("SELECT email, phone FROM candidates WHERE id = ?").get(w.asha.id) }, { email: w.asha.email, phone: w.asha.phone });
  // Website application: stored as typed (trimmed, lower-case email), while the match code still ignores dots and +tags.
  const site = await mods.website.linkWebsiteApplication(w.db, w.BUCKET, webApp("app-k1", "  Kiran.Bose+jobs@Gmail.com ", { fullName: "Kiran Bose", phone: "+91 98300 12345" }), null);
  assert.deepEqual({ ...w.db.raw.prepare("SELECT email, phone FROM candidates WHERE id = ?").get(site.candidateId) }, { email: "kiran.bose+jobs@gmail.com", phone: "+91 98300 12345" });
  // A correction in the owner console reaches the record.
  await w.db.prepare("INSERT INTO applications (id, full_name, email, phone, location, experience, consent) VALUES ('app-k1', 'Kiran Bose', 'kiran.bose+jobs@gmail.com', '+91 98300 12345', 'Kolkata', 'x', 1)").run();
  await mods.website.syncWebsiteProfile(w.db, "app-k1", { fullName: "Kiran Bose", email: "kiran@new.example", phone: "9830054321", location: "Howrah" }, "owner");
  assert.deepEqual({ ...w.db.raw.prepare("SELECT email, phone FROM candidates WHERE id = ?").get(site.candidateId) }, { email: "kiran@new.example", phone: "9830054321" });
});

test("staff get the record's contact details, even when the person has no readable CV", async () => {
  const w = await world();
  await mandate(w);
  const role = (await postRole({ status: "published", companyId: w.A.id })).json.id;
  const lata = await websiteApplicant(w, "app-l1", "Lata Roy", "lata.roy@person.example", { jobId: role, share: true });
  await w.db.prepare("UPDATE candidates SET phone = '9830011223' WHERE id = ?").bind(lata).run();
  const staff = { id: "boss", admin: true };
  await makeStaff(w.db, "boss", { admin: true });
  const staffLib = await import(resolve(root, "lib/portal/staff.ts"));
  const out = await staffLib.staffContact(w.db, staff, { jdId: role, candidateId: lata });
  assert.deepEqual(out, { name: "Lata Roy", phone: "9830011223", email: "lata.roy@person.example" });
  assert.equal(w.db.raw.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE kind = 'access' AND action = 'contact_view' AND detail = ?").get(lata).n, 1, "the view was not logged");
});

test("deleting a person clears the email and phone from their record", async () => {
  const w = await world();
  await mods.candidate.deleteCandidateData(w.db, w.asha.id, "admin");
  assert.deepEqual({ ...w.db.raw.prepare("SELECT status, email, phone, display_name FROM candidates WHERE id = ?").get(w.asha.id) }, { status: "deleted", email: "", phone: "", display_name: "" });
  assert.deepEqual({ ...w.db.raw.prepare("SELECT email, phone FROM candidates WHERE id = ?").get(w.bikram.id) }, { email: w.bikram.email, phone: w.bikram.phone });
});

test("migration 0020 fills email and phone for existing records and removes plans and quotas", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const last = "0020_contact_details_and_cleanup.sql";
  for (const f of migrationFiles.filter(f => f < last)) applyFile(db, f);
  const at = "2026-11-01T10:00:00.000Z";
  db.exec(`INSERT INTO portal_accounts (id, kind, email, phone, status, created_at) VALUES ('acc-1', 'candidate', 'asha@person.example', '9830011111', 'active', '${at}');
    INSERT INTO candidates (id, account_id, display_name, last_active_at, created_at) VALUES ('cand-portal', 'acc-1', 'Asha', '${at}', '${at}'), ('cand-web', NULL, 'Bikram', '${at}', '${at}'), ('cand-gone', NULL, '', '${at}', '${at}');
    UPDATE candidates SET status = 'deleted' WHERE id = 'cand-gone';
    INSERT INTO applications (id, full_name, email, phone, location, experience, consent, created_at) VALUES ('app-old', 'Bikram', 'old@person.example', '9830000001', 'K', 'x', 1, '2026-10-01 10:00:00'), ('app-new', 'Bikram', 'bikram@person.example', '9830022222', 'K', 'x', 1, '2026-11-01 10:00:00'), ('app-gone', 'Gone', 'gone@person.example', '9830033333', 'K', 'x', 1, '2026-11-01 10:00:00');
    INSERT INTO candidate_sources (id, candidate_id, kind, ref_id, created_at) VALUES ('s1', 'cand-web', 'website_application', 'app-old', '${at}'), ('s2', 'cand-web', 'website_application', 'app-new', '${at}'), ('s3', 'cand-gone', 'website_application', 'app-gone', '${at}');
    INSERT INTO companies (id, legal_name, display_name, created_at) VALUES ('co-1', 'Alpha Pvt Ltd', 'Alpha', '${at}');
    INSERT INTO jds (id, company_id, title, raw_text, requirements, status, service, created_by, created_at, updated_at) VALUES ('jd-1', 'co-1', 'T', 'x', '{}', 'live', 'self', 'u', '${at}', '${at}');
    INSERT INTO company_parameters (id, company_id, version, params, status, requested_by, created_at) VALUES ('p1', 'co-1', 1, '{}', 'approved', 'a', '${at}'), ('p2', 'co-1', 2, '{}', 'requested', 'u', '${at}');`);
  applyFile(db, last);
  const row = id => ({ ...db.prepare("SELECT email, phone FROM candidates WHERE id = ?").get(id) });
  assert.deepEqual(row("cand-portal"), { email: "asha@person.example", phone: "9830011111" });
  assert.deepEqual(row("cand-web"), { email: "bikram@person.example", phone: "9830022222" }, "the latest website application should supply the contact details");
  assert.deepEqual(row("cand-gone"), { email: "", phone: "" }, "a deleted record was given contact details back");
  assert.equal(db.prepare("SELECT service FROM jds WHERE id = 'jd-1'").get().service, "managed");
  assert.deepEqual(db.prepare("SELECT id, status FROM company_parameters ORDER BY id").all().map(r => ({ ...r })), [{ id: "p1", status: "approved" }, { id: "p2", status: "rejected" }]);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name);
  for (const gone of ["plans", "company_subscriptions", "quota_ledger"]) assert.ok(!tables.includes(gone), `${gone} still exists`);
  for (const kept of ["releases", "unlocks", "company_parameters"]) assert.ok(tables.includes(kept), `${kept} was dropped`);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
});

test("merge 3: a client is set up without a plan, scoring shows the client nothing, and a recruiter's submission still works", async () => {
  const w = await world();
  // The standard world invited two clients and submitted one candidate to each, with no plans table at all.
  assert.equal(w.db.raw.prepare("SELECT COUNT(*) AS n FROM pipeline").get().n, 2);
  assert.equal(w.db.raw.prepare("SELECT COUNT(*) AS n FROM releases WHERE revoked_at IS NULL").get().n, 2);
  // Draining the scoring queue adds matches but never a release.
  await mods.company.enqueue(w.db, "jd", w.A.jdId, "test").run();
  const out = await queueLib.drainQueue(w.db, SECRET, 400);
  assert.ok(!("releases" in out));
  assert.ok(w.db.raw.prepare("SELECT COUNT(*) AS n FROM matches WHERE jd_id = ?").get(w.A.jdId).n >= 1);
  assert.equal(w.db.raw.prepare("SELECT COUNT(*) AS n FROM releases WHERE revoked_at IS NULL").get().n, 2);
  // The client's dashboard carries no quota, plans or match counts.
  const { portalCookie } = await import("./helpers/world.mjs");
  const dash = await call(await route("portal/company/[action]"), "GET", "/api/portal/company/dashboard", { cookie: await portalCookie(w.A.email), action: "dashboard" });
  assert.equal(dash.status, 200, dash.text);
  for (const key of ["quota", "pendingRequest", "selfService"]) assert.ok(!(key in dash.json), `the dashboard still returns ${key}`);
  // The owner console has no plan or quota actions.
  const owner = await route("admin/portal/[action]");
  for (const action of ["plan-assign", "quota-adjust", "params-decide"]) assert.ok((await call(owner, "POST", `/api/admin/portal/${action}`, { action, headers: OWNER, body: { companyId: w.A.id, plan: "starter", delta: 5, note: "x" } })).status >= 400, action);
  const overview = await call(owner, "GET", "/api/admin/portal/overview", { action: "overview", headers: OWNER });
  assert.equal(overview.status, 200, overview.text);
  for (const key of ["plans", "paramRequests", "selfService"]) assert.ok(!(key in overview.json), `the overview still returns ${key}`);
});
