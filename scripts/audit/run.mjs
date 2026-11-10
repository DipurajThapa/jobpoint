// Runs the three auditors in order against the local dev server and writes
// the results report.
//
//   npm run dev                       (in another terminal; leave it running)
//   node scripts/audit/run.mjs        reset the local database, run all three, write the report
//
// Options:
//   --keep                 do not reset the local database first (the functional auditor needs a fresh one)
//   --only quality,uat     run only these auditors (functional must have run once on this database)
//   --report <file>        where to write the results (default docs/audit/RESULTS_<today>.md)
//
// The auditors create and delete records, so they refuse to run against
// anything but a local server (see lib.mjs).
import { spawnSync } from "node:child_process";
import { BASE, ROOT, serverUp } from "./lib.mjs";

const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const only = value("--only")?.split(",").map(s => s.trim()).filter(Boolean) ?? ["functional", "quality", "uat"];
const keep = args.includes("--keep") || !only.includes("functional");

if (!await serverUp()) { console.error(`The dev server is not answering at ${BASE}. Start it with: npm run dev`); process.exit(2); }
const node = (...a) => spawnSync(process.execPath, ["--no-warnings", ...a], { cwd: ROOT, stdio: "inherit" }).status ?? 1;

if (!keep) {
  console.log("Resetting the local database (.wrangler/state only; nothing hosted is touched)…");
  if (node("scripts/local-db.mjs", "--reset") !== 0) process.exit(2);
} else if (node("scripts/local-db.mjs") !== 0) process.exit(2);

const results = {};
for (const name of ["functional", "quality", "uat"].filter(n => only.includes(n))) {
  console.log(`\n\n################ ${name} auditor ################`);
  results[name] = node(`scripts/audit/${name}.mjs`);
}
const reportArgs = value("--report") ? [value("--report")] : [];
node("scripts/audit/report.mjs", ...reportArgs);
console.log(`\nAuditors finished: ${Object.entries(results).map(([n, code]) => `${n} ${code === 0 ? "all checks passed" : code === 1 ? "has failed checks" : "could not run"}`).join("; ")}.`);
process.exit(Object.values(results).some(code => code > 1) ? 2 : Object.values(results).some(Boolean) ? 1 : 0);
