// Shared helpers for the three auditors (quality, functional, UAT).
//
// The auditors run against the local dev server (`npm run dev`) and its local
// D1 database under .wrangler/state. They never touch a hosted database.
// Everything they create is fictional (example.test / example.com addresses).
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
export const { chromium } = require("playwright");

export const ROOT = resolve(import.meta.dirname, "../..");
export const BASE = (process.env.AUDIT_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "");
export const OUT = resolve(ROOT, process.env.AUDIT_OUT ?? "test-results/audit");
mkdirSync(OUT, { recursive: true });

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) {
  console.error(`Refusing to run: the auditors create and delete records, so they only run against a local server (got ${BASE}).`);
  process.exit(2);
}

// ---------------------------------------------------------------- database

const D1_DIR = resolve(ROOT, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
function d1File() {
  if (!existsSync(D1_DIR)) throw new Error("No local D1 yet. Run `npm run dev`, open the site once, then `node scripts/local-db.mjs`.");
  const files = readdirSync(D1_DIR).filter(f => f.endsWith(".sqlite") && f !== "metadata.sqlite");
  if (files.length !== 1) throw new Error(`Expected one local D1 file, found ${files.length}.`);
  return resolve(D1_DIR, files[0]);
}
let handle;
const conn = () => handle ??= new DatabaseSync(d1File());
/** Rows straight from the local database: the check that an entry really was stored. */
export const rows = (sql, ...params) => conn().prepare(sql).all(...params);
export const row = (sql, ...params) => conn().prepare(sql).get(...params);
export const count = (table, where = "1=1", ...params) => Number(row(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, ...params).n);
export const tables = () => rows("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations' ORDER BY name").map(r => r.name);
/**
 * Test-only: the public forms and sign-in are rate limited per connection, and
 * one audit run sends more than a real visitor would. Clearing the counters
 * keeps the run about workflows, not about the limiter (which has its own check).
 */
export const clearRateLimits = () => { try { conn().exec("DELETE FROM rate_limits"); } catch { /* table absent before migrations */ } };

// ---------------------------------------------------------------- findings

const SEVERITY = ["blocker", "high", "medium", "low", "info"];

/**
 * A recorder collects checks. A check that fails becomes a finding. A finding
 * can also be raised directly for a gap (something missing, not something
 * failing). Results are written as JSON for the report builder.
 */
export function recorder(auditor) {
  const checks = [], findings = [];
  let section = "";
  const api = {
    section(name) { section = name; console.log(`\n== ${name}`); },
    /** Record a check. `meta` describes the finding raised if it fails. */
    check(id, title, pass, meta = {}) {
      const ok = !!pass;
      checks.push({ id, section, title, ok, detail: meta.detail ?? "" });
      console.log(`${ok ? "PASS" : "FAIL"} ${id} ${title}${!ok && meta.detail ? ` — ${meta.detail}` : ""}`);
      if (!ok) api.finding(id, { title: meta.title ?? `Failed: ${title}`, ...meta });
      return ok;
    },
    /** Run an async step; an exception is a failed check, not a crashed run. */
    async step(id, title, fn, meta = {}) {
      try { const out = await fn(); return api.check(id, title, out !== false, { ...meta, detail: meta.detail ?? (out === false ? "the step returned false" : "") }), out; }
      catch (error) { api.check(id, title, false, { ...meta, detail: String(error?.message ?? error).slice(0, 400) }); return undefined; }
    },
    finding(id, { severity = "medium", area = section, title, detail = "", expected = "", actual = "", fix = "", where = "", kind = "defect" }) {
      if (!SEVERITY.includes(severity)) throw new Error(`Unknown severity ${severity}`);
      if (findings.some(f => f.id === id)) return;
      findings.push({ id, auditor, severity, kind, area, title, detail, expected, actual, fix, where });
      console.log(`  -> finding [${severity}] ${title}`);
    },
    note(text) { console.log(`  note: ${text}`); },
    save(extra = {}) {
      const passed = checks.filter(c => c.ok).length;
      const file = resolve(OUT, `${auditor}.json`);
      writeFileSync(file, JSON.stringify({ auditor, at: new Date().toISOString(), base: BASE, passed, failed: checks.length - passed, checks, findings, ...extra }, null, 2));
      console.log(`\n${auditor}: ${passed}/${checks.length} checks passed, ${findings.length} finding(s). Saved ${file}`);
      return { passed, failed: checks.length - passed, findings: findings.length };
    },
    checks, findings,
  };
  return api;
}

// ---------------------------------------------------------------- state shared between auditors

const STATE = resolve(OUT, "state.json");
export const loadState = () => existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
export const saveState = patch => { const next = { ...loadState(), ...patch }; writeFileSync(STATE, JSON.stringify(next, null, 2)); return next; };

// ---------------------------------------------------------------- browser and sessions

export const PASSWORD = "harbour meadow lantern 58";

/** A browser context that cannot reach anything but the local server. */
export async function context(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true, ...opts });
  await ctx.route(u => !u.toString().startsWith(BASE), r => r.abort());
  return ctx;
}

/** JSON API calls from a context, with the same-origin header the server requires on changes. */
export function client(ctx) {
  const call = async (method, path, data, extra = {}) => {
    const r = await ctx.request.fetch(`${BASE}${path}`, { method, data, headers: { origin: BASE, ...extra.headers }, multipart: extra.multipart, maxRedirects: extra.maxRedirects ?? 0, failOnStatusCode: false });
    let body = null; const text = await r.text().catch(() => "");
    try { body = JSON.parse(text); } catch { body = null; }
    return { status: r.status(), ok: r.ok(), body, text, headers: r.headers(), raw: r };
  };
  return { ctx, get: (p, x) => call("GET", p, undefined, x), post: (p, d, x) => call("POST", p, d ?? {}, x), patch: (p, d) => call("PATCH", p, d), del: p => call("DELETE", p), form: (p, multipart) => call("POST", p, undefined, { multipart }) };
}

/** The site owner, signed in with the dev server's local sign-in (seedy@sites.test). */
export async function ownerSession(browser) {
  const ctx = await context(browser);
  await ctx.request.get(`${BASE}/signin-with-chatgpt?return_to=%2Fadmin`);
  return client(ctx);
}

/** A Working Platform member (administrator, team manager or recruiter). */
export async function staffSession(browser, email, password = PASSWORD) {
  const c = client(await context(browser));
  const r = await c.post("/api/platform/auth/sign-in", { email, password });
  if (!r.ok) throw new Error(`Staff sign-in failed for ${email}: ${r.status} ${r.text.slice(0, 200)}`);
  return c;
}

/** A portal account (candidate or client user). */
export async function portalSession(browser, email, password = PASSWORD) {
  const c = client(await context(browser));
  const r = await c.post("/api/portal/auth/sign-in", { email, password });
  if (!r.ok) throw new Error(`Portal sign-in failed for ${email}: ${r.status} ${r.text.slice(0, 200)}`);
  return Object.assign(c, { kind: r.body?.kind, next: r.body?.next });
}

// ---------------------------------------------------------------- fixtures

/** A real PDF with a text layer, rendered from plain CV text. */
export async function pdfFromText(browser, text) {
  const page = await browser.newPage();
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  await page.setContent(`<html><body style="font-family:Arial;font-size:11px;white-space:pre-wrap">${esc}</body></html>`);
  const pdf = await page.pdf({ format: "A4", margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" } });
  await page.close();
  return Buffer.from(pdf);
}
export const pdfFile = (name, buffer) => ({ name, mimeType: "application/pdf", buffer });

export const stamp = () => Date.now().toString(36);
export const sleep = ms => new Promise(r => setTimeout(r, ms));
/** Poll until `fn` returns something truthy (the server works some things after the response). */
export async function until(fn, ms = 8000, every = 250) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return v; await sleep(every); }
}

/** Is the dev server up? */
export async function serverUp() {
  try { const r = await fetch(`${BASE}/`, { redirect: "manual" }); return r.status < 500; } catch { return false; }
}
