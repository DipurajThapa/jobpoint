// A D1-compatible wrapper over node:sqlite for tests. Applies the repository's
// migrations to an in-memory database so domain logic can be tested with the
// same SQL that runs on Cloudflare D1.
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

class Statement {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...params) { return new Statement(this.db, this.sql, params.map(v => typeof v === "boolean" ? Number(v) : v === undefined ? null : v)); }
  _stmt() { return this.db.prepare(this.sql); }
  async first(column) { const row = this._stmt().get(...this.params); if (!row) return null; return column ? row[column] : { ...row }; }
  async all() { return { results: this._stmt().all(...this.params).map(r => ({ ...r })), success: true, meta: {} }; }
  async run() { const info = this._stmt().run(...this.params); return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } }; }
  _runSync() { const info = this._stmt().run(...this.params); return { success: true, meta: { changes: Number(info.changes) }, results: [] }; }
}

export function createD1(root) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const dir = resolve(root, "drizzle");
  for (const file of readdirSync(dir).filter(f => f.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(resolve(dir, file), "utf8").split("--> statement-breakpoint")) if (statement.trim()) db.exec(statement);
  }
  return {
    raw: db,
    prepare: sql => new Statement(db, sql),
    // D1 runs a batch as one transaction: all statements succeed or none do.
    async batch(statements) {
      db.exec("BEGIN");
      try { const out = statements.map(s => s._runSync()); db.exec("COMMIT"); return out; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    },
    async exec(sql) { db.exec(sql); return { count: 1 }; },
  };
}
