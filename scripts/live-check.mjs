// Deployed end-to-end check: the public half of the investor's "deployed test", run against the live site.
//
//   node scripts/live-check.mjs https://<your-site>      writes docs/pilot/LIVE_CHECK_<date>.md
//
// What it does, with clearly fictional records (names start "LIVE CHECK", addresses @example.com):
//   1. Every public page loads; every header, footer and body link really navigates (in a browser).
//   2. An employer enquiry is accepted and given a reference; whether the acknowledgement email went out.
//   3. A general CV registration is accepted; sending it again within 24 hours is refused as a duplicate.
//   4. A deletion request for those fictional records is accepted with a reference (the owner then erases them).
//   5. Access control: private APIs answer 401 without sign-in; a cross-site POST is refused (403).
// The rest of the journey needs signed-in owner, recruiter and client sessions; it is a checklist in
// docs/pilot/DEPLOYED_TEST_RUNBOOK.md, recorded by a person.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = (process.argv[2] ?? "").replace(/\/$/, "");
if (!/^https:\/\//.test(BASE) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) { console.error("Usage: node scripts/live-check.mjs https://<deployed site>"); process.exit(2); }
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
const results = [];
const record = (id, title, ok, detail = "") => { results.push({ id, title, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${id} ${title}${detail ? ` — ${detail}` : ""}`); };
const sameSite = { origin: BASE, referer: `${BASE}/`, "sec-fetch-site": "same-origin" };

// ---------------------------------------------------------------- 1. pages and links
const PAGES = ["/", "/job-seekers", "/employers", "/terms", "/terms/job-seekers", "/terms/employers", "/privacy", "/compliance", "/portal/sign-in", "/portal/register"];
const browser = await chromium.launch();
for (const page of PAGES) {
  const r = await fetch(BASE + page);
  record(`L1${page}`, `${page} loads`, r.ok, `HTTP ${r.status}`);
}
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const errors = [];
let linksChecked = 0;
for (const page of ["/", "/job-seekers", "/employers", "/privacy"]) {
  const p = await ctx.newPage();
  p.on("pageerror", e => errors.push(`${page}: ${e.message}`));
  await p.goto(BASE + page, { waitUntil: "networkidle" });
  const hrefs = [...new Set(await p.locator("header a[href^='/'], footer a[href^='/'], main a[href^='/']").evaluateAll(els => els.filter(e => e.target !== "_blank").map(e => e.getAttribute("href"))))];
  for (const href of hrefs) {
    linksChecked++;
    await p.goto(BASE + page, { waitUntil: "domcontentloaded" });
    const link = p.locator(`a[href="${href}"]`).first();
    if (!await link.isVisible().catch(() => false)) continue;
    await link.click();
    await p.waitForTimeout(1500);
    const want = new URL(href, BASE + page), got = new URL(p.url());
    const ok = got.pathname === want.pathname && (!want.hash || got.hash === want.hash);
    if (!ok) record(`L2 ${page} → ${href}`, "link navigates", false, `ended on ${got.pathname}${got.hash}`);
  }
  await p.close();
}
record("L2", `${linksChecked} links on 4 pages navigate`, !results.some(r => r.id.startsWith("L2 ")));
record("L3", "no script errors on public pages", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();

// ---------------------------------------------------------------- 2. employer enquiry
const enquiry = await fetch(`${BASE}/api/employer-enquiries`, { method: "POST", headers: { "content-type": "application/json", ...sameSite }, body: JSON.stringify({
  contactName: `LIVE CHECK ${stamp}`, company: `LIVE CHECK Pvt Ltd ${stamp}`, email: `live-check-employer-${stamp}@example.com`, phone: "+91 90000 00000",
  details: "Automated deployed test with fictional details. Please delete.", consent: "yes", terms: "yes", source: "live-check",
}) });
const ej = await enquiry.json().catch(() => ({}));
record("E1", "employer enquiry accepted with a reference", enquiry.status === 201 && /^HE-/.test(ej.reference ?? ""), `${enquiry.status} ${ej.reference ?? ej.error ?? ""}`);
record("E2", "the enquiry acknowledgement email was sent", ej.emailed === true, ej.emailed === true ? "" : "not sent: set up email (docs/pilot/EMAIL_SETUP.md) and run again");

// ---------------------------------------------------------------- 3. CV registration and duplicate
const cvPdf = new Blob([`%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\nLIVE CHECK ${stamp}. Accounts executive, Tally, GST, 3 years, Bengaluru.`], { type: "application/pdf" });
const apply = async () => {
  const form = new FormData();
  for (const [k, v] of Object.entries({ fullName: `LIVE CHECK Candidate ${stamp}`, email: `live-check-candidate-${stamp}@example.com`, phone: "+91 90000 00001", location: "Bengaluru", consent: "yes", declaration: "yes", source: "live-check" })) form.set(k, v);
  form.set("resume", cvPdf, "live-check-cv.pdf");
  const r = await fetch(`${BASE}/api/applications`, { method: "POST", headers: sameSite, body: form });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const first = await apply();
record("C1", "a CV registration is accepted with a reference", first.status === 201 && /^JP-/.test(first.body.reference ?? ""), `${first.status} ${first.body.reference ?? first.body.error ?? ""}`);
const again = await apply();
record("C2", "the same CV sent again within 24 hours is refused as a duplicate", again.status === 409, `${again.status} ${again.body.error ?? ""}`.slice(0, 160));

// ---------------------------------------------------------------- 4. deletion request
const del = await fetch(`${BASE}/api/privacy-requests`, { method: "POST", headers: { "content-type": "application/json", ...sameSite }, body: JSON.stringify({ requestType: "deletion", requesterName: `LIVE CHECK ${stamp}`, email: `live-check-candidate-${stamp}@example.com`, details: "Automated deployed test: delete the LIVE CHECK records." }) });
const dj = await del.json().catch(() => ({}));
record("P1", "a deletion request is accepted with a reference", del.status === 201 && /^PR-/.test(dj.reference ?? ""), `${del.status} ${dj.reference ?? dj.error ?? ""}`);

// ---------------------------------------------------------------- 5. access control
for (const path of ["/api/portal/company/dashboard", "/api/portal/candidate/profile", "/api/admin/portal/overview", "/api/admin/records", "/api/platform/recruiting/work"]) {
  const r = await fetch(BASE + path, { redirect: "manual" });
  record(`A1 ${path}`, "private API refuses an anonymous visitor", [401, 403].includes(r.status), `HTTP ${r.status}`);
}
const cross = await fetch(`${BASE}/api/employer-enquiries`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example", "sec-fetch-site": "cross-site" }, body: "{}" });
record("A2", "a cross-site form post is refused", cross.status === 403, `HTTP ${cross.status}`);

// ---------------------------------------------------------------- report
const passed = results.filter(r => r.ok).length;
const dir = resolve(import.meta.dirname, "../docs/pilot");
mkdirSync(dir, { recursive: true });
const file = resolve(dir, `LIVE_CHECK_${new Date().toISOString().slice(0, 10)}.md`);
writeFileSync(file, `# Deployed check, ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC\n\nSite: ${BASE}\n\n**${passed} of ${results.length} passed.** Fictional records created: enquiry ${ej.reference ?? "-"}, CV ${first.body.reference ?? "-"}, deletion request ${dj.reference ?? "-"}. The owner completes the deletion request to erase them.\n\n| | Check | Result | Detail |\n|---|---|---|---|\n${results.map(r => `| ${r.id} | ${r.title} | ${r.ok ? "Pass" : "**Fail**"} | ${String(r.detail).replace(/\|/g, "/")} |`).join("\n")}\n\nThe signed-in half of the journey is in [DEPLOYED_TEST_RUNBOOK.md](DEPLOYED_TEST_RUNBOOK.md).\n`);
console.log(`\n${passed} of ${results.length} passed. Report: ${file}`);
process.exit(passed === results.length ? 0 : 1);
