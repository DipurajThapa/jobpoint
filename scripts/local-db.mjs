// Applies drizzle/*.sql to the local Miniflare D1 used by `npm run dev`.
// Sites applies the same files to the hosted D1 on publish; this script only
// touches .wrangler/state (local, git-ignored). Start `npm run dev` once first
// so Miniflare creates the database file.
//   node scripts/local-db.mjs          apply pending migrations
//   node scripts/local-db.mjs --reset  delete local data, then apply all
import { readdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = resolve(import.meta.dirname, "..");
const dir = resolve(root, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
if (!existsSync(dir)) {
  console.error("No local D1 yet. Run `npm run dev`, open the site once, then run this again.");
  process.exit(1);
}
const files = readdirSync(dir).filter(f => f.endsWith(".sqlite") && f !== "metadata.sqlite");
if (files.length !== 1) {
  console.error(`Expected one local D1 file in ${dir}, found ${files.length}.`);
  process.exit(1);
}
const db = new DatabaseSync(resolve(dir, files[0]));
if (process.argv.includes("--reset")) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all();
  db.exec("PRAGMA foreign_keys = OFF");
  for (const { name } of tables) db.exec(`DROP TABLE IF EXISTS "${name}"`);
  db.exec("PRAGMA foreign_keys = ON");
  rmSync(resolve(root, ".wrangler/state/v3/r2"), { recursive: true, force: true });
  console.log(`Reset ${tables.length} local tables and local R2 objects.`);
}
db.exec("CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)");
const applied = new Set(db.prepare("SELECT name FROM d1_migrations").all().map(r => r.name));
const pending = readdirSync(resolve(root, "drizzle")).filter(f => /^\d{4}_.+\.sql$/.test(f)).sort().filter(f => !applied.has(f));
for (const name of pending) {
  const sql = readFileSync(resolve(root, "drizzle", name), "utf8");
  db.exec("BEGIN");
  try {
    for (const statement of sql.split("--> statement-breakpoint")) if (statement.trim()) db.exec(statement);
    db.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(name);
    db.exec("COMMIT");
    console.log(`Applied ${name}`);
  } catch (error) {
    db.exec("ROLLBACK");
    console.error(`Failed ${name}: ${error.message}`);
    process.exit(1);
  }
}
if (!pending.length) console.log("Local D1 is up to date.");
