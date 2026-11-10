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
  w.db.raw.exec("DROP TABLE service_enrolments");
  const inv = await inventoryLib.dataInventory(w.db);
  assert.equal(inv.groups.find(g => g.merge === "5").lines.find(l => l.table === "service_enrolments").rows, null);
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
