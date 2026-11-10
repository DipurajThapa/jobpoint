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
