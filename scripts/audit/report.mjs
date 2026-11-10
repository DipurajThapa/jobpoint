// Builds the results report from what the three auditors recorded.
//   node scripts/audit/report.mjs [output.md]
// It reports only what the auditors did and saw in this run. The reasoning
// about what to fix first lives in docs/audit/AUDIT_REPORT_*.md.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { OUT, ROOT } from "./lib.mjs";

const today = new Date().toISOString().slice(0, 10);
const out = resolve(ROOT, process.argv[2] ?? `docs/audit/RESULTS_${today}.md`);
const read = name => existsSync(resolve(OUT, `${name}.json`)) ? JSON.parse(readFileSync(resolve(OUT, `${name}.json`), "utf8")) : null;
const runs = [["functional", "Functional auditor"], ["quality", "Quality auditor"], ["uat", "UAT auditor"]].map(([key, label]) => ({ key, label, data: read(key) })).filter(r => r.data);
if (!runs.length) { console.error("No auditor results found. Run node scripts/audit/run.mjs first."); process.exit(2); }
const pagesData = read("quality-pages");

const ORDER = ["blocker", "high", "medium", "low", "info"], NAME = { blocker: "Blocker", high: "High", medium: "Medium", low: "Low", info: "Note" };
const KIND = { defect: "Defect", gap: "Gap", "stale-copy": "Outdated wording" };
const cell = v => String(v ?? "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, "<br>").trim();
const findings = runs.flatMap(r => r.data.findings.map(f => ({ ...f, from: r.label }))).sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity) || a.id.localeCompare(b.id, "en", { numeric: true }));

const lines = [];
const push = (...xs) => lines.push(...xs);
push(`# Audit results, ${today}`, "",
  "This file is written by `node scripts/audit/report.mjs` from the three auditors' records. It lists what they did and what they saw in this run against the local dev server. The reading of these results, the code-review findings and the order to fix things in are in the audit report beside this file.", "");
push("## Summary", "", "| Auditor | Checks run | Passed | Failed | Findings |", "|---|---|---|---|---|");
for (const r of runs) push(`| ${r.label} | ${r.data.checks.length} | ${r.data.passed} | ${r.data.failed} | ${r.data.findings.length} |`);
push(`| **Total** | **${runs.reduce((n, r) => n + r.data.checks.length, 0)}** | **${runs.reduce((n, r) => n + r.data.passed, 0)}** | **${runs.reduce((n, r) => n + r.data.failed, 0)}** | **${findings.length}** |`, "");
push("| Severity | Findings |", "|---|---|");
for (const s of ORDER) { const n = findings.filter(f => f.severity === s).length; if (n) push(`| ${NAME[s]} | ${n} |`); }
push("");
const q = runs.find(r => r.key === "quality")?.data;
if (q && pagesData) {
  const pressed = pagesData.controls.filter(c => !/^not pressed|disabled|no-name|already selected/.test(c.result)).length;
  push(`The quality auditor opened ${q.pagesVisited} pages and screens, followed ${q.linksChecked} internal links and saw ${q.buttonsSeen} buttons: it pressed ${pressed}, and recorded without pressing ${pagesData.controls.filter(c => c.result.startsWith("not pressed")).length} that submit a form or change data (the functional and UAT auditors use those).`, "");
}

push("## Findings", "", "A failed check and a gap noticed along the way are both listed here. \"Where\" names the file to change.", "");
for (const s of ORDER) {
  const group = findings.filter(f => f.severity === s);
  if (!group.length) continue;
  push(`### ${NAME[s]} (${group.length})`, "");
  for (const f of group) {
    push(`#### ${f.id} · ${f.title}`, "", `- **Found by:** ${f.from}${f.area ? `, in "${f.area}"` : ""} · **Type:** ${KIND[f.kind] ?? f.kind}`);
    if (f.actual) push(`- **What happens:** ${cell(f.actual)}`);
    if (f.detail) push(`- **Detail:** ${cell(f.detail)}`);
    if (f.expected) push(`- **Expected:** ${cell(f.expected)}`);
    if (f.fix) push(`- **How to fix:** ${cell(f.fix)}`);
    if (f.where) push(`- **Where:** ${cell(f.where)}`);
    push("");
  }
}

push("## Every check", "");
for (const r of runs) {
  push(`### ${r.label}`, "");
  let section = null;
  for (const c of r.data.checks) {
    if (c.section !== section) { section = c.section; push("", `**${section}**`, "", "| | Check | Result |", "|---|---|---|"); }
    push(`| ${c.id} | ${cell(c.title)} | ${c.ok ? "Pass" : `**Fail**${c.detail ? `: ${cell(c.detail).slice(0, 300)}` : ""}`} |`);
  }
  push("");
}

if (pagesData) {
  push("## Pages and screens opened", "", "| Who | Page or screen | Address | Status | Problems |", "|---|---|---|---|---|");
  const who = p => runs.find(r => r.key === "quality").data.checks.find(c => c.title.includes(`: ${p.label} (`))?.title.split(":")[0] ?? "";
  for (const p of pagesData.pages) push(`| ${who(p)} | ${cell(p.label)} | ${cell(p.url)} | ${p.status || "—"} | ${cell([...new Set([...p.failed, ...p.pageErrors])].slice(0, 3).join("; ")) || "none"} |`);
  push("", "## Links followed", "", "| Who | Link | Result | Linked from |", "|---|---|---|---|");
  for (const l of pagesData.links.filter(l => typeof l.status === "number").sort((a, b) => a.who.localeCompare(b.who) || a.path.localeCompare(b.path))) push(`| ${l.who} | ${cell(l.path)}${l.anchors.length ? ` (#${l.anchors.join(", #")})` : ""} | ${l.status}${l.chain?.length > 1 ? ` via ${cell(l.chain.join(" → "))}` : ""} | ${cell(l.from[0])} |`);
  push("", "## Buttons", "", "| Who | Screen | Button | What pressing it did |", "|---|---|---|---|");
  const seen = new Set();
  for (const c of pagesData.controls) { const k = `${c.who}|${c.screen}|${c.text}|${c.result}`; if (seen.has(k)) continue; seen.add(k); push(`| ${c.who} | ${cell(c.screen)} | ${cell(c.text)} | ${cell(c.result)} |`); }
  push("");
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${lines.join("\n")}\n`);
console.log(`Wrote ${out}: ${findings.length} findings from ${runs.reduce((n, r) => n + r.data.checks.length, 0)} checks.`);
