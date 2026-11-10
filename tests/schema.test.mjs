// The database: migrations apply cleanly in order, the typed schema matches
// what the migrations build, and references hold after real use.
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { world, root, mods } from "./helpers/world.mjs";

const dir = resolve(root, "drizzle");
const files = readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
const apply = (db, file) => { for (const s of readFileSync(resolve(dir, file), "utf8").split("--> statement-breakpoint")) if (s.trim()) db.exec(s); };

test("the migration journal lists every migration file once, in order", () => {
  const journal = JSON.parse(readFileSync(resolve(dir, "meta/_journal.json"), "utf8")).entries;
  assert.deepEqual(journal.map(e => `${e.tag}.sql`), files);
  journal.forEach((e, i) => { assert.equal(e.idx, i); if (i) assert.ok(e.when > journal[i - 1].when, `${e.tag} is not later than the one before`); });
  files.forEach((f, i) => assert.ok(f.startsWith(String(i).padStart(4, "0") + "_"), `${f} is out of sequence`));
});

test("migrations apply to an empty database with foreign keys on, one at a time", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const file of files) assert.doesNotThrow(() => apply(db, file), `${file} failed`);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
});

test("the typed schema (db/schema.ts) matches the tables the migrations build", async () => {
  const w = await world();
  const schema = await import(resolve(root, "db/schema.ts"));
  let checked = 0;
  for (const table of Object.values(schema)) {
    let config; try { config = getTableConfig(table); } catch { continue; }
    const actual = w.db.raw.prepare(`PRAGMA table_info("${config.name}")`).all();
    assert.ok(actual.length, `db/schema.ts declares "${config.name}", which no migration creates`);
    const declared = config.columns.map(c => c.name).sort();
    assert.deepEqual(declared, actual.map(c => c.name).sort(), `columns of "${config.name}" differ between db/schema.ts and the migrations`);
    for (const column of config.columns) {
      const real = actual.find(c => c.name === column.name);
      assert.equal(Boolean(real.notnull) || Boolean(real.pk), column.notNull || column.primary, `${config.name}.${column.name}: NOT NULL differs`);
    }
    checked++;
  }
  assert.ok(checked >= 14);
});

test("no reference is left dangling after the full hiring flow, a deletion and a merge", async () => {
  const w = await world();
  await mods.client.moveStage(w.db, w.A.id, w.A.userId, w.A.pipeline.id, { stage: "shortlisted" });
  await mods.client.moveStage(w.db, w.A.id, w.A.userId, w.A.pipeline.id, { stage: "offered", offerCtcInr: 420000 });
  await mods.client.moveStage(w.db, w.A.id, w.A.userId, w.A.pipeline.id, { stage: "offer_accepted", joiningDate: new Date().toISOString().slice(0, 10) });
  await mods.client.moveStage(w.db, w.A.id, w.A.userId, w.A.pipeline.id, { stage: "joined", joiningDate: new Date().toISOString().slice(0, 10) });
  await mods.candidate.deleteCandidateData(w.db, w.bikram.id, "candidate");
  assert.deepEqual(w.db.raw.prepare("PRAGMA foreign_key_check").all(), []);
  // References the schema does not enforce with a foreign key, checked by hand.
  const orphans = sql => w.db.raw.prepare(sql).all();
  assert.deepEqual(orphans("SELECT id FROM pipeline WHERE candidate_id NOT IN (SELECT id FROM candidates)"), []);
  assert.deepEqual(orphans("SELECT id FROM placements WHERE company_id NOT IN (SELECT id FROM companies) OR jd_id NOT IN (SELECT id FROM jds)"), []);
  assert.deepEqual(orphans("SELECT id FROM unlocks WHERE candidate_id NOT IN (SELECT id FROM candidates)"), []);
  assert.deepEqual(orphans("SELECT id FROM releases WHERE candidate_id NOT IN (SELECT id FROM candidates) OR company_id NOT IN (SELECT id FROM companies)"), []);
  assert.deepEqual(orphans("SELECT id FROM candidate_commitments WHERE pipeline_id NOT IN (SELECT id FROM pipeline)"), []);
  assert.deepEqual(orphans("SELECT id FROM interviews WHERE pipeline_id NOT IN (SELECT id FROM pipeline)"), []);
  assert.deepEqual(orphans("SELECT id FROM candidate_sources WHERE candidate_id NOT IN (SELECT id FROM candidates) OR ref_id NOT IN (SELECT id FROM applications)"), []);
  // The placement made above is the business record and is still whole.
  const placement = w.db.raw.prepare("SELECT company_id, candidate_id, fee_inr FROM placements").get();
  assert.equal(placement.company_id, w.A.id);
  assert.equal(placement.fee_inr, Math.round(420000 * 8.33 / 100));
});

test("one stage for one hiring journey: the candidate's view follows the pipeline", async () => {
  const w = await world();
  await mods.candidate.applyToJd(w.db, w.asha.id, w.A.jdId);
  const stage = async () => [(await w.db.prepare("SELECT stage FROM pipeline WHERE id = ?").bind(w.A.pipeline.id).first()).stage, (await w.db.prepare("SELECT status FROM portal_applications WHERE candidate_id = ? AND jd_id = ?").bind(w.asha.id, w.A.jdId).first()).status];
  await mods.client.moveStage(w.db, w.A.id, w.A.userId, w.A.pipeline.id, { stage: "shortlisted" });
  assert.deepEqual(await stage(), ["shortlisted", "shortlisted"]);
  await mods.client.moveStage(w.db, w.A.id, w.A.userId, w.A.pipeline.id, { stage: "offered", offerCtcInr: 420000 });
  assert.deepEqual(await stage(), ["offered", "offer"]);
  await mods.client.moveStage(w.db, w.A.id, w.A.userId, w.A.pipeline.id, { stage: "offer_declined", reason: mods.client.REASONS.offer_declined[0] });
  const [pipe, app] = await stage();
  assert.equal(pipe, "offer_declined");
  assert.notEqual(app, "offer", "the candidate still sees an open offer after declining it");
});

test("migration 0013 carries earlier requirement edits into the new counter", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const file of files.filter(f => f < "0013")) apply(db, file);
  db.exec("INSERT INTO companies (id, legal_name, display_name, created_at) VALUES ('c', 'C', 'C', 't')");
  db.exec("INSERT INTO jds (id, company_id, title, raw_text, requirements, created_by, created_at, updated_at) VALUES ('jd-1', 'c', 't', 'r', '{}', 'u', 't', 't')");
  db.exec(`INSERT INTO audit_events (id, actor_id, action, target_type, target_id, detail, created_at) VALUES
    ('e1', 'u', 'jd.edited', 'jd', 'jd-1', 'was live; needs approval again', '2026-11-01 10:00:00'),
    ('e2', 'u', 'jd.edited', 'jd', 'jd-1', '', '2026-11-02 10:00:00'),
    ('e3', 'u', 'jd.edited', 'jd', 'jd-gone', 'was live; needs approval again', '2026-11-03 10:00:00'),
    ('e4', 'u', 'jd.closed', 'jd', 'jd-1', 'was live', '2026-11-04 10:00:00')`);
  db.exec("INSERT INTO privacy_requests (id, request_type, requester_name, email) VALUES ('p', 'deletion', 'n', 'e@x.example')");
  apply(db, files.find(f => f.startsWith("0013")));
  assert.deepEqual(db.prepare("SELECT id, jd_id, edited_by, at FROM jd_requirement_edits").all().map(r => ({ ...r })), [{ id: "e1", jd_id: "jd-1", edited_by: "u", at: "2026-11-01T10:00:00Z" }]);
  assert.deepEqual({ ...db.prepare("SELECT erased_at, erasure_summary FROM privacy_requests WHERE id = 'p'").get() }, { erased_at: null, erasure_summary: "" });
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
});

test("build output is not tracked in git", () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n");
  for (const file of tracked) assert.ok(!/(^|\/)(tsconfig\.tsbuildinfo|\.env[^/]*|node_modules\/.*|dist\/.*)$/.test(file), `${file} should not be committed`);
});
