import test from "node:test";
import assert from "node:assert/strict";
import { freshDb, route, call } from "./helpers/world.mjs";

const api = await route("jobs");
function setup() {
  const { db } = freshDb();
  db.raw.exec("DELETE FROM jobs");
  const insert = db.raw.prepare("INSERT INTO jobs (id, title, location, employment_type, description, status, sector, featured, created_at) VALUES (?, ?, ?, 'Full-time', ?, ?, ?, ?, ?)");
  const add = (id, title, location, status, sector, date, featured = 0) => insert.run(id, title, location, `${title} requirements`, status, sector, featured, date);
  return { db, add };
}

test("job board lists only published vacancies, newest first, with all pages reachable", async () => {
  const { add } = setup();
  for (let i = 1; i <= 65; i++) add(`job-${String(i).padStart(2, "0")}`, `Role ${i}`, "Pune", "published", i % 2 ? "IT" : "Non-IT", `2026-11-01 ${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00`);
  add("old-featured", "Featured older role", "Delhi", "published", "IT", "2025-01-01 00:00:00", 1);
  add("draft", "Private draft", "Hidden city", "draft", "IT", "2027-01-01 00:00:00");
  add("closed", "Closed role", "Hidden city", "closed", "IT", "2027-01-01 00:00:00");
  const pages = [];
  for (const page of [1, 2, 3]) {
    const result = await call(api, "GET", `/api/jobs?page=${page}`);
    assert.equal(result.status, 200);
    assert.equal(result.json.total, 66);
    assert.equal(result.json.pageCount, 3);
    assert.ok(!result.json.locations.includes("Hidden city"));
    pages.push(...result.json.jobs);
  }
  assert.equal(pages.length, 66);
  assert.equal(new Set(pages.map(j => j.id)).size, 66);
  assert.equal(pages[0].id, "job-65");
  assert.equal(pages.at(-1).id, "old-featured");
  assert.equal(pages.at(-1).featured, true);
  assert.ok(pages.every(j => j.location && j.createdAt));
  assert.equal((await call(api, "GET", "/api/jobs?page=999")).json.page, 3);
  assert.equal((await call(api, "GET", "/api/jobs?page=invalid")).json.page, 1);
});

test("role and location filters combine, literal wildcard searches do not return every role", async () => {
  const { add } = setup();
  add("dev", "Software developer", "Pune", "published", "IT", "2026-11-01 00:00:00");
  add("accounts", "Accounts executive", "Delhi", "published", "Non-IT", "2026-11-02 00:00:00");
  add("special", "100% quality analyst", "Pune", "published", "Operations", "2026-11-03 00:00:00");
  const find = async query => (await call(api, "GET", `/api/jobs?${query}`)).json;
  assert.deepEqual((await find("q=developer&location=Pune")).jobs.map(j => j.id), ["dev"]);
  assert.equal((await find("q=developer&location=Delhi")).total, 0);
  assert.deepEqual((await find("q=%25")).jobs.map(j => j.id), ["special"]);
  assert.equal((await find("q=%27%20OR%201%3D1--")).total, 0);
  assert.equal((await find("")).total, 3);
});

test("an unavailable database produces an error rather than a misleading empty board", async () => {
  setup();
  globalThis.__TEST_ENV__.DB = undefined;
  const result = await call(api, "GET", "/api/jobs");
  assert.equal(result.status, 503);
  assert.ok(result.json.error);
});
