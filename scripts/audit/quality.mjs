// Quality auditor.
//
// Starts at the home page and follows every link it can reach, first as a
// visitor and then signed in as each kind of user (owner, administrator,
// recruiter, client, candidate). For every page and every screen inside the
// signed-in areas it checks:
//   - the page loads (no error page, no error status, no endless redirect);
//   - nothing fails behind it (script errors, failed requests);
//   - every link goes to a page that exists, and every #anchor has a target;
//   - every button does something when pressed (buttons that could change or
//     delete data are listed but not pressed);
//   - images load, the page has one main heading, and it fits a phone screen;
//   - the text does not describe features that have been removed.
//
//   node scripts/audit/quality.mjs       (run after functional.mjs, which creates the accounts)
import { BASE, OUT, PASSWORD, chromium, context, loadState, recorder, serverUp } from "./lib.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const R = recorder("quality");
const { check, finding, section, note } = R;
if (!await serverUp()) { console.error(`The dev server is not answering at ${BASE}.`); process.exit(2); }
const state = loadState();
const SHOTS = resolve(OUT, "screens"); mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch();

// Buttons that change or remove data are recorded, never pressed.
const RISKY = /delete|remove|sign ?out|log ?out|close job|erase|suspend|disable|reset|stop sharing|revoke|withdraw|reject|merge|rewrap|run queue|load sample|payment received|cancel order|dismiss|approve|activate|mark all|new link|report exit|join fast track|take the test|allow sharing|count now|purge|link 25|add .* to the candidate list|invite|get a new link|pass\b|submit/i;
// Wording left over from features that were removed on 10 Nov 2026, or from the demo period.
const STALE = [
  [/read-only demo|submissions (and CV uploads )?are disabled|during the (public )?demo|demo forms are disabled|intake remains disabled/i, "says the site is a read-only demo, but live intake is on", "demo"],
  [/\bunlock(ed|ing|s)?\b/i, "mentions unlocking CVs (self-service was removed)", "unlock"],
  [/anonymous summary|anonymised preview/i, "mentions an anonymous summary shown to employers (automatic release was removed)", "summary"],
  [/self-service/i, "mentions self-service", "self-service"],
  [/released automatically|strong match\(es\)/i, "mentions automatic release of CVs", "release"],
  [/\bquota\b/i, "mentions a quota", "quota"],
  [/matching rules|rules for which CVs you receive/i, "tells the client about matching rules (these are internal in the placement-fee model)", "rules"],
];

const pages = [];        // every page or screen visited
const linkIndex = new Map(); // url -> { status, from: Set }
const controls = [];     // every button seen

const sameOrigin = url => { try { return new URL(url, BASE).origin === BASE; } catch { return false; } };
const clean = url => { const u = new URL(url, BASE); u.hash = ""; return u.pathname + u.search; };

/** Open a page and collect everything that went wrong while it loaded. */
async function visit(page, url, label) {
  const problems = { console: [], pageErrors: [], failed: [] };
  const onConsole = m => { if (m.type() === "error") problems.console.push(m.text().slice(0, 300)); };
  const onError = e => problems.pageErrors.push(String(e.message ?? e).slice(0, 300));
  const onResponse = r => { const u = r.url(); if (sameOrigin(u) && r.status() >= 400 && !/favicon/.test(u)) problems.failed.push(`${r.status()} ${r.request().method()} ${clean(u)}`); };
  page.on("console", onConsole); page.on("pageerror", onError); page.on("response", onResponse);
  let status = 0, error = "";
  try { const r = await page.goto(url.startsWith("http") ? url : `${BASE}${url}`, { waitUntil: "networkidle", timeout: 30_000 }); status = r?.status() ?? 0; }
  catch (e) { error = String(e.message).split("\n")[0].slice(0, 200); }
  await page.waitForTimeout(250);
  const info = await page.evaluate(() => ({
    title: document.title, h1: [...document.querySelectorAll("h1")].map(h => h.textContent.trim()).filter(Boolean),
    text: document.body?.innerText ?? "",
    links: [...document.querySelectorAll("a[href]")].map(a => ({ href: a.getAttribute("href"), text: (a.textContent || a.getAttribute("aria-label") || "").trim().slice(0, 80), target: a.target })),
    ids: [...document.querySelectorAll("[id]")].map(e => e.id),
    broken: [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.currentSrc || i.src),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  })).catch(() => ({ title: "", h1: [], text: "", links: [], ids: [], broken: [], overflow: 0 }));
  page.off("console", onConsole); page.off("pageerror", onError); page.off("response", onResponse);
  const record = { label, url, finalUrl: clean(page.url()), status, error, ...problems, title: info.title, h1: info.h1, links: info.links, ids: info.ids, broken: info.broken, text: info.text, notFound: /page not found|could not be found|404/i.test(`${info.title} ${info.h1.join(" ")}`) };
  pages.push(record);
  return record;
}

/** Judge one visited page or screen. */
function judge(p, who, { expectOk = true } = {}) {
  const id = `Q.${who}.${p.label}`.replace(/[^\w./-]+/g, "_").slice(0, 80);
  const where = `${who}: ${p.label} (${p.url})`;
  if (expectOk) check(`${id}.loads`, `${where} loads`, !p.error && p.status > 0 && p.status < 400 && !p.notFound, { severity: "blocker", title: `Page does not load: ${p.label}`, detail: p.error || `status ${p.status}${p.notFound ? ", shows the not-found page" : ""}`, where: p.url });
  const serverErrors = p.failed.filter(f => /^5\d\d/.test(f)), clientErrors = p.failed.filter(f => /^4\d\d/.test(f));
  check(`${id}.requests`, `${where}: no request behind the page fails`, serverErrors.length === 0 && clientErrors.length === 0, { severity: serverErrors.length ? "high" : "medium", title: `Requests fail behind ${p.label}`, detail: [...new Set(p.failed)].slice(0, 6).join("; "), where: p.url });
  const errs = [...p.pageErrors, ...p.console.filter(c => !/Failed to load resource|net::ERR_FAILED|ERR_BLOCKED_BY_CLIENT|fonts\.g/i.test(c))];
  check(`${id}.errors`, `${where}: no script errors`, errs.length === 0, { severity: "medium", title: `Script errors on ${p.label}`, detail: [...new Set(errs)].slice(0, 4).join(" | "), where: p.url });
  if (p.broken.length) finding(`${id}.images`, { severity: "low", title: `Images do not load on ${p.label}`, detail: p.broken.slice(0, 5).join(", "), where: p.url });
  for (const [re, why, key] of STALE) { const m = p.text.match(re); if (m) { const at = p.text.indexOf(m[0]); stale.push({ who, label: p.label, url: p.url, why, key, quote: p.text.slice(Math.max(0, at - 90), at + 110).replace(/\s+/g, " ").trim() }); } }
}
const stale = [];
const redirects = [];

/** Check every link found on the visited pages, using the given session. */
async function checkLinks(ctx, who, found) {
  for (const p of found) for (const l of p.links) {
    if (!l.href || /^(mailto:|tel:|javascript:)/.test(l.href)) continue;
    if (l.href === "#" || l.href === "") { finding(`Q.${who}.placeholder.${p.label}.${l.text}`.slice(0, 90), { severity: "medium", title: `A link goes nowhere: "${l.text}" on ${p.label}`, actual: `href="${l.href}"`, where: p.url }); continue; }
    if (!sameOrigin(new URL(l.href, `${BASE}${p.finalUrl}`).href)) { external.add(`${new URL(l.href, BASE).origin} (from ${p.label}: "${l.text}")`); continue; }
    const abs = new URL(l.href, `${BASE}${p.finalUrl}`), key = `${who} ${abs.pathname}${abs.search}`;
    if (!linkIndex.has(key)) linkIndex.set(key, { who, path: abs.pathname + abs.search, from: [], anchors: new Map() });
    const entry = linkIndex.get(key); entry.from.push(`${p.label}: "${l.text}"`);
    if (abs.hash.length > 1) entry.anchors.set(abs.hash.slice(1), `${p.label}: "${l.text}"`);
  }
  for (const entry of [...linkIndex.values()].filter(e => e.who === who && e.status === undefined)) {
    if (/^\/sign(in|out)-with-chatgpt|\/api\/.*sign-out/.test(entry.path)) { entry.status = "skipped"; continue; }
    const chain = [];
    let url = `${BASE}${entry.path}`, r;
    for (let hop = 0; hop < 8; hop++) {
      r = await ctx.request.fetch(url, { maxRedirects: 0, failOnStatusCode: false });
      chain.push(`${r.status()} ${clean(url)}`);
      const loc = r.headers().location;
      if (!loc || ![301, 302, 303, 307, 308].includes(r.status())) break;
      const next = new URL(loc, url).href;
      if (/\/sign(in|out)-with-chatgpt/.test(next)) { chain.push("-> the hosting platform's owner sign-in"); r = { status: () => 200, headers: () => ({}), text: async () => "" }; break; }
      if (chain.some(c => c.endsWith(` ${clean(next)}`))) { chain.push(`LOOP ${clean(next)}`); break; }
      url = next;
    }
    entry.status = r.status(); entry.chain = chain; entry.final = clean(url);
    const html = (r.headers()["content-type"] ?? "").includes("html") ? await r.text() : "";
    entry.ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
    entry.notFound = /page not found|404/i.test(html.match(/<title>([^<]*)/)?.[1] ?? "");
  }
}
const external = new Set();

/** Press every safe button on the current screen and see whether anything happens. */
async function pressButtons(page, who, label, restore) {
  // Number the buttons in page order. The same numbering is re-applied after the screen is restored.
  const tag = () => page.evaluate(() => [...document.querySelectorAll("button, [role=button], a:not([href]), summary")].filter(e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; }).map((e, i) => { e.setAttribute("data-audit", String(i)); return { i, tag: e.tagName.toLowerCase(), text: (e.innerText || e.getAttribute("aria-label") || e.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 70), type: e.getAttribute("type") ?? "", inForm: !!e.closest("form"), disabled: e.disabled === true || e.getAttribute("aria-disabled") === "true", selected: e.getAttribute("aria-current") === "page" || e.getAttribute("aria-selected") === "true" || e.getAttribute("aria-pressed") === "true" || /\b(active|selected|current)\b/.test(e.className) }; }));
  const list = await tag();
  for (const b of list) {
    const base = { who, screen: label, text: b.text || `(unnamed ${b.tag})`, kind: b.inForm && b.type !== "button" ? "form submit" : "button" };
    if (!b.text) { controls.push({ ...base, result: "no-name" }); }
    if (b.disabled) { controls.push({ ...base, result: "disabled" }); continue; }
    if (b.selected) { controls.push({ ...base, result: "already selected (the screen being shown)" }); continue; }
    if (base.kind === "form submit") { controls.push({ ...base, result: "not pressed (submits a form; covered by the functional and UAT auditors)" }); continue; }
    if (RISKY.test(b.text)) { controls.push({ ...base, result: "not pressed (changes or removes data)" }); continue; }
    const el = page.locator(`[data-audit="${b.i}"]`).first();
    const same = await el.count() ? (await el.evaluate(e => (e.innerText || e.getAttribute("aria-label") || e.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 70)).catch(() => null)) === b.text : false;
    if (!same) { controls.push({ ...base, result: "not found again after the screen was restored" }); continue; }
    let requests = 0, dialog = "";
    const onReq = q => { if (sameOrigin(q.url()) && !/\.(css|js|png|jpg|svg|woff2?)(\?|$)/.test(q.url())) requests++; };
    const onDialog = async d => { dialog = `${d.type()}: ${d.message().slice(0, 80)}`; await d.dismiss().catch(() => {}); };
    page.on("request", onReq); page.on("dialog", onDialog);
    const before = await page.evaluate(() => { window.__m = 0; window.__o?.disconnect(); window.__o = new MutationObserver(x => { window.__m += x.length; }); window.__o.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); return { url: location.href, y: window.scrollY, active: document.activeElement?.outerHTML.slice(0, 60) }; });
    let failed = "";
    try { await el.click({ timeout: 3000 }); } catch (e) { failed = String(e.message).split("\n")[0].slice(0, 120); }
    await page.waitForTimeout(450);
    const after = await page.evaluate(() => ({ url: location.href, y: window.scrollY, m: window.__m ?? 0, active: document.activeElement?.outerHTML.slice(0, 60) })).catch(() => ({ url: "navigated", y: 0, m: 1, active: "" }));
    page.off("request", onReq); page.off("dialog", onDialog);
    const did = failed ? `could not be pressed (${failed})` : after.url !== before.url ? `goes to ${clean(after.url)}` : dialog ? `asks: ${dialog}` : requests ? "sends a request" : after.m > 0 ? "changes the screen" : Math.abs(after.y - before.y) > 5 ? "scrolls the page" : "NOTHING";
    controls.push({ ...base, result: did });
    if (after.url !== before.url || after.m > 0 || dialog) { await restore(); await tag(); }
  }
}

const shot = (page, name) => page.screenshot({ path: resolve(SHOTS, `${name}.png`), fullPage: true }).catch(() => {});

// ------------------------------------------------------------------ 1. visitor
section("1. Public website, as a visitor");
{
  const ctx = await context(browser), page = await ctx.newPage();
  const queue = ["/"], seen = new Set(), visited = [];
  while (queue.length && visited.length < 60) {
    const path = queue.shift(); if (seen.has(path)) continue; seen.add(path);
    const p = await visit(page, path, path);
    visited.push(p); judge(p, "visitor");
    for (const l of p.links) { if (!l.href || /^(mailto:|tel:|#)/.test(l.href)) continue; const abs = new URL(l.href, `${BASE}${p.finalUrl}`); if (abs.origin === BASE && !/^\/(api|signin|signout|admin|platform|candidate|company)/.test(abs.pathname) && !seen.has(abs.pathname + abs.search)) queue.push(abs.pathname + abs.search); }
    if (p.h1.length !== 1 && !p.error && p.status < 400) finding(`Q.visitor.h1.${path}`, { severity: "low", title: `${path} has ${p.h1.length} main headings (expected one)`, detail: p.h1.join(" | "), where: path });
    if (!p.title || /^(untitled|localhost)/i.test(p.title)) finding(`Q.visitor.title.${path}`, { severity: "low", title: `${path} has no page title`, where: path });
  }
  note(`visited ${visited.length} public pages: ${visited.map(v => v.url).join(", ")}`);
  await checkLinks(ctx, "visitor", visited);
  // A deliberately wrong address must give a helpful not-found page, not a blank or an error.
  const lost = await visit(page, "/this-page-does-not-exist", "wrong address");
  check("Q.visitor.404", "a wrong address shows a not-found page with a way back", lost.status === 404 && lost.links.some(l => l.href === "/" || l.href?.startsWith("/#") || l.href === "/jobs"), { severity: "medium", detail: `status ${lost.status}, links: ${lost.links.map(l => l.href).slice(0, 6).join(", ")}` });
  const lostJob = await visit(page, "/jobs/no-such-job", "wrong job address");
  check("Q.visitor.404job", "a wrong job address shows the not-found page", lostJob.status === 404, { severity: "medium", detail: `status ${lostJob.status}` });
  // Buttons on the public pages.
  for (const path of visited.filter(v => v.status === 200).map(v => v.url)) {
    const restore = async () => { await page.keyboard.press("Escape").catch(() => {}); if (clean(page.url()) !== path) await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" }); else await page.reload({ waitUntil: "networkidle" }); };
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await pressButtons(page, "visitor", path, restore);
  }
  // Phone width.
  const phone = await context(browser, { viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true });
  const pp = await phone.newPage();
  for (const path of visited.filter(v => v.status === 200).map(v => v.url)) {
    await pp.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    const overflow = await pp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`Q.phone.${path}`, `${path} fits a 360 px phone screen without sideways scrolling`, overflow <= 2, { severity: "low", title: `${path} scrolls sideways on a phone`, detail: `${overflow}px wider than the screen`, where: path });
  }
  await pp.goto(`${BASE}/`, { waitUntil: "networkidle" }); await shot(pp, "phone-home");
  await phone.close();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" }); await shot(page, "home");
  // Entry points a visitor needs.
  const all = visited.flatMap(v => v.links.map(l => l.href ?? ""));
  if (!all.some(h => /^\/portal\/(sign-in|register)|^\/candidate|^\/company/.test(h))) finding("Q.visitor.portal-link", { severity: "high", kind: "gap", title: "Nothing on the public website links to the candidate or client sign-in", actual: `Across ${visited.length} public pages there is no link to /portal/sign-in, /portal/register, /candidate or /company. A candidate who created an account, or a client invited by Jobboard300, can only get back in by keeping the address from their invitation link or typing it.`, expected: "A \"Sign in\" link in the header or footer (candidates and clients share /portal/sign-in).", fix: "Add `Sign in` → /portal/sign-in to components/public-header.tsx and public-footer.tsx.", where: "components/public-header.tsx; components/public-footer.tsx" });
  const recruiterLink = visited.flatMap(v => v.links).find(l => /recruiter sign-?in/i.test(l.text));
  if (recruiterLink && recruiterLink.href === "/admin") finding("Q.visitor.recruiter-link", { severity: "medium", kind: "defect", title: "\"Recruiter sign-in\" in the footer leads to the owner-only console, not to where recruiters sign in", actual: "The footer link goes to /admin. Only the site owner (or an administrator with two-step sign-in) can open it; a recruiter is sent to the owner's sign-in and then to a not-found page. Recruiters sign in at /platform/sign-in.", expected: "The link goes to /platform/sign-in (the Working Platform).", fix: "Change the href in components/public-footer.tsx to /platform/sign-in.", where: "components/public-footer.tsx" });
  await ctx.close();
}

// ------------------------------------------------------------------ signed-in areas
async function signedIn(kind, email) {
  const ctx = await context(browser);
  if (kind === "owner") await ctx.request.get(`${BASE}/signin-with-chatgpt?return_to=%2Fadmin`);
  else {
    const r = await ctx.request.post(`${BASE}/api/${kind === "staff" ? "platform" : "portal"}/auth/sign-in`, { data: { email, password: PASSWORD }, headers: { origin: BASE } });
    if (!r.ok()) throw new Error(`sign-in failed for ${email}: ${r.status()}`);
  }
  return ctx;
}

/**
 * Walk one signed-in area. `screens` lists how to reach each screen: a path to
 * open, then (for areas that switch screens without changing the address) the
 * buttons to press.
 */
async function walk(who, kind, email, screens) {
  section(`Signed in as ${who}`);
  let ctx; try { ctx = await signedIn(kind, email); } catch (e) { check(`Q.${who}.signin`, `${who} can sign in`, false, { severity: "blocker", detail: e.message }); return; }
  const page = await ctx.newPage(), found = [];
  for (const s of screens) {
    const open = async () => { await page.goto(`${BASE}${s.path}`, { waitUntil: "networkidle" }); for (const press of s.press ?? []) { const b = page.getByRole(press.role ?? "button", { name: press.name, exact: press.exact ?? true }).first(); if (!await b.count()) return `button "${press.name}" not found`; await b.click(); await page.waitForLoadState("networkidle").catch(() => {}); await page.waitForTimeout(300); } return ""; };
    const p = await visit(page, s.path, s.label);
    let missing = "";
    if (s.press?.length) {
      const problems = { failed: [], pageErrors: [], console: [] };
      const onResponse = r => { if (sameOrigin(r.url()) && r.status() >= 400) problems.failed.push(`${r.status()} ${r.request().method()} ${clean(r.url())}`); };
      const onError = e => problems.pageErrors.push(String(e.message ?? e).slice(0, 300));
      page.on("response", onResponse); page.on("pageerror", onError);
      missing = await open();
      page.off("response", onResponse); page.off("pageerror", onError);
      p.failed.push(...problems.failed); p.pageErrors.push(...problems.pageErrors);
      const info = await page.evaluate(() => ({ text: document.body.innerText, links: [...document.querySelectorAll("a[href]")].map(a => ({ href: a.getAttribute("href"), text: a.textContent.trim().slice(0, 80) })) }));
      p.text = info.text; p.links = info.links;
    }
    check(`Q.${who}.${s.label}.reach`, `${who}: the "${s.label}" screen can be reached`, !missing && clean(page.url()).startsWith(s.expect ?? s.path.split("?")[0]), { severity: "blocker", title: `${who} cannot reach "${s.label}"`, detail: missing || `landed on ${clean(page.url())}`, where: s.path });
    judge(p, who);
    if (s.wants) for (const text of s.wants) check(`Q.${who}.${s.label}.shows.${text}`.slice(0, 90), `${who}: "${s.label}" shows "${text}"`, p.text.includes(text), { severity: "medium", title: `"${s.label}" does not show "${text}" for ${who}`, where: s.path });
    found.push(p);
    await shot(page, `${who}-${s.label}`.replace(/[^\w-]+/g, "-").toLowerCase());
    // Email Kit is a self-contained tool with its own end-to-end check (npm run check:platform); here it only has to open.
    if (!s.look) await pressButtons(page, who, s.label, async () => { await open(); });
  }
  await checkLinks(ctx, who, found);
  await ctx.close();
}

if (!state.admin) { check("Q.state", "accounts from the functional auditor are available", false, { severity: "blocker", detail: "Run scripts/audit/functional.mjs first (or scripts/audit/run.mjs)." }); }
else {
  await walk("owner", "owner", null, [
    { path: "/admin", label: "Open roles", wants: ["Post a verified role"] },
    { path: "/admin", label: "Candidate pipeline", press: [{ name: /^Candidate pipeline/, exact: false }], wants: ["Candidate records"] },
    { path: "/admin", label: "Job portal", press: [{ name: /^Job portal/, exact: false }] },
    { path: "/admin", label: "Employer enquiries", press: [{ name: /^Employer enquiries/, exact: false }], wants: ["Employer enquiries"] },
    { path: "/admin", label: "Privacy requests", press: [{ name: /^Privacy requests/, exact: false }] },
    { path: "/admin", label: "Access history", press: [{ name: /^Access history/, exact: false }] },
    { path: "/platform/owner", label: "Platform owner page" },
  ]);
  await walk("administrator", "staff", state.admin, [
    { path: "/platform", label: "Dashboard" },
    { path: "/platform/recruiting", label: "Recruiting", wants: ["Jobs", "Clients"] },
    { path: "/platform/recruiting", label: "Recruiting, a job opened", press: [{ name: "Open" }], wants: ["Pipeline", "Candidates to submit"] },
    { path: "/platform/assessments", label: "Assessments" },
    { path: "/platform/admin", label: "Team access" },
    { path: "/platform/admin/operations", label: "Operations" },
    { path: "/platform/account", label: "My account" },
    { path: "/platform/email-kit", label: "Email Kit", look: true },
  ]);
  await walk("recruiter", "staff", state.recruiter, [
    { path: "/platform", label: "Dashboard" },
    { path: "/platform/recruiting", label: "Recruiting", wants: ["Jobs"] },
    { path: "/platform/recruiting", label: "Recruiting, a job opened", press: [{ name: "Open" }], wants: ["Pipeline", "Candidates to submit"] },
    { path: "/platform/account", label: "My account" },
  ]);
  await walk("client", "portal", state.clientOwner, [
    { path: "/company", label: "Overview", wants: ["Hiring funnel"] },
    { path: "/company", label: "Jobs", press: [{ name: "Jobs" }], wants: ["Your jobs"] },
    { path: "/company", label: "Post a job", press: [{ name: "Jobs" }, { name: "Post a job" }], wants: ["Job description"] },
    { path: "/company", label: "Pipeline", press: [{ name: "Pipeline" }] },
    { path: "/company", label: "Team", press: [{ name: "Team" }], wants: ["Add a colleague"] },
  ]);
  if (state.candidate) await walk("candidate", "portal", state.candidate, [
    { path: "/candidate", label: "My CV and privacy", wants: ["Inbox", "Your data"] },
  ]);

  // Signed-in people going to the wrong place must land somewhere sensible, not in a loop.
  section("Redirects between areas");
  const hops = async (ctx, start) => { const chain = []; let url = `${BASE}${start}`; for (let i = 0; i < 10; i++) { const r = await ctx.request.fetch(url, { maxRedirects: 0, failOnStatusCode: false }); chain.push(`${r.status()} ${clean(url)}`); const loc = r.headers().location; if (!loc) return { chain, loop: false, final: clean(url), status: r.status() }; const next = new URL(loc, url).href; if (/\/sign(in|out)-with-chatgpt/.test(next)) return { chain: [...chain, "-> the hosting platform's owner sign-in (cannot be followed locally)"], loop: false, final: clean(next), status: 200 }; if (chain.some(c => c.endsWith(` ${clean(next)}`))) return { chain: [...chain, `-> ${clean(next)}`], loop: true }; url = next; } return { chain, loop: true }; };
  const cases = [["candidate", "portal", state.candidate, ["/company", "/portal/sign-in", "/admin", "/platform"]], ["client", "portal", state.clientOwner, ["/candidate", "/portal/sign-in", "/admin", "/platform"]], ["recruiter", "staff", state.recruiter, ["/platform/admin", "/platform/admin/operations", "/platform/assessments", "/platform/sign-in", "/admin", "/company"]]];
  for (const [who, kind, email, paths] of cases) {
    if (!email) continue;
    const ctx = await signedIn(kind, email);
    for (const path of paths) { const h = await hops(ctx, path); check(`Q.redirect.${who}.${path}`, `${who} opening ${path} ends somewhere (no redirect loop)`, !h.loop, { severity: "high", title: `Redirect loop for a signed-in ${who} opening ${path}`, detail: h.chain.join(" -> ") }); note(`${who} ${path}: ${h.chain.join(" -> ")}`); redirects.push({ who, path, chain: h.chain, final: h.final, status: h.status }); }
    await ctx.close();
  }
  const nobody = await context(browser);
  for (const path of ["/admin", "/platform", "/platform/recruiting", "/candidate", "/company", "/portal/accept", "/portal/verify", "/portal/reset", "/platform/accept", "/platform/reset", "/test", "/commit", "/test?token=bad", "/commit?token=bad"]) { const h = await hops(nobody, path); check(`Q.redirect.visitor.${path}`, `a visitor opening ${path} ends somewhere (no redirect loop, no server error)`, !h.loop && h.status < 500, { severity: "high", detail: h.chain.join(" -> ") }); redirects.push({ who: "visitor", path, chain: h.chain, final: h.final, status: h.status }); }
  await nobody.close();
}
// ------------------------------------------------------------------ forms before the script loads
section("Forms pressed before the page's script has loaded");
{
  // Every form is drawn by the server and then taken over by a script. On a slow phone
  // connection there is a moment when the form is on screen but the script is not yet
  // running. This submits each form in that state (script switched off) and looks at
  // where the typed values go.
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  await ctx.route(u => !u.toString().startsWith(BASE), r => r.abort());
  const page = await ctx.newPage(), leaks = [], safe = [];
  const forms = [["/portal/sign-in", { email: "someone@example.test", password: "a-secret-password-1" }, "candidate and client sign-in"], ["/portal/register", { name: "Some One", city: "Kolkata", email: "someone@example.test", phone: "9000000000", password: "a-secret-password-1" }, "candidate registration"], ["/portal/reset?token=abc", { password: "a-secret-password-1", confirm: "a-secret-password-1" }, "portal password reset"], ["/portal/accept?token=abc", { password: "a-secret-password-1", confirm: "a-secret-password-1" }, "client invitation: set password"], ["/platform/sign-in", { email: "someone@example.test", password: "a-secret-password-1" }, "staff sign-in"], ["/platform/accept?token=abc", { name: "Some One", password: "a-secret-password-1", confirm: "a-secret-password-1" }, "staff invitation: set password"], ["/platform/reset?token=abc", { password: "a-secret-password-1", confirm: "a-secret-password-1" }, "staff password reset"]];
  for (const [path, values, label] of forms) {
    await page.goto(`${BASE}${path}`, { waitUntil: "load" }).catch(() => {});
    const form = page.locator("form").first();
    if (!await form.count()) { safe.push(`${label}: no form without a valid link`); continue; }
    for (const [name, value] of Object.entries(values)) { const el = form.locator(`[name="${name}"]`).first(); if (await el.count()) await el.fill(value).catch(() => {}); }
    for (const box of await form.locator("input[type=checkbox][required]").all()) await box.check().catch(() => {});
    const method = (await form.getAttribute("method") ?? "get").toLowerCase();
    await Promise.all([page.waitForLoadState("load").catch(() => {}), form.locator("button").first().click().catch(() => {})]);
    await page.waitForTimeout(300);
    const url = page.url();
    if (/a-secret-password-1/.test(decodeURIComponent(url))) leaks.push(`${label} (${path}): form method "${method}" -> ${url.replace(BASE, "").replace(/a-secret-password-1/g, "<the password>")}`);
    else safe.push(`${label}: ${method}`);
  }
  // Signed-in pages: any form with a password field and no method of its own.
  if (state.recruiter) {
    await ctx.request.post(`${BASE}/api/platform/auth/sign-in`, { data: { email: state.recruiter, password: PASSWORD }, headers: { origin: BASE } });
    for (const [path, label] of [["/platform/account", "staff \"My account\""]]) {
      await page.goto(`${BASE}${path}`, { waitUntil: "load" }).catch(() => {});
      const n = await page.locator("form:not([method])").count();
      for (let i = 0; i < n; i++) {
        await page.goto(`${BASE}${path}`, { waitUntil: "load" }).catch(() => {});
        const form = page.locator("form:not([method])").nth(i), secrets = form.locator("input[type=password]");
        if (!await secrets.count()) continue;
        for (const input of await secrets.all()) await input.fill("a-secret-password-1").catch(() => {});
        const name = (await form.locator("button").first().innerText().catch(() => "")).trim();
        await Promise.all([page.waitForLoadState("load").catch(() => {}), form.locator("button").first().click().catch(() => {})]);
        await page.waitForTimeout(300);
        if (/a-secret-password-1/.test(decodeURIComponent(page.url()))) leaks.push(`${label}, form "${name}" (${path}): no method -> ${page.url().replace(BASE, "").replace(/a-secret-password-1/g, "<the password>")}`);
        else safe.push(`${label} "${name}": no leak`);
      }
    }
  }
  note(`safe: ${safe.join("; ")}`);
  check("Q.forms.noscript", "no form puts a password into the page address when it is submitted before the script has loaded", leaks.length === 0, { severity: "high", kind: "defect", title: "Sign-in and password forms put the password in the address bar if submitted before the page finishes loading", actual: `These forms have no method of their own; a script takes over the submit once it has loaded. If the person presses the button first (a slow connection, a script that fails to load, or an extension that blocks scripts), the browser sends the form as a plain GET and the typed password appears in the address, in the browser history, and in the server and proxy logs:\n${leaks.join("\n")}\nThis happened for real during the UAT run when the script was a moment late.`, expected: "A form submitted early does nothing harmful: it posts to an endpoint that handles it, or the button is disabled until the script is ready.", fix: "Give every auth form method=\"post\" and an action that works without script (the staff forms already do this: app/platform/forms.tsx), or render the submit button disabled and enable it in an effect. Files: app/portal/forms.tsx, and the two-step sign-in forms in app/platform/forms.tsx.", where: "app/portal/forms.tsx; app/platform/forms.tsx" });
  await ctx.close();
}

// ------------------------------------------------------------------ results across everything
section("Links, buttons and wording across the whole site");
{
  const entries = [...linkIndex.values()].filter(e => typeof e.status === "number");
  const broken = entries.filter(e => e.status >= 400 || e.notFound), loops = entries.filter(e => e.chain?.some(c => c.startsWith("LOOP")));
  check("Q.links.broken", `every one of the ${entries.length} internal links leads to a page that exists`, broken.length === 0, { severity: "high", title: "Links lead to pages that do not exist", detail: broken.map(e => `${e.path} (${e.status}) from ${e.from[0]}`).slice(0, 12).join("; ") });
  check("Q.links.loops", "no link ends in a redirect loop", loops.length === 0, { severity: "high", detail: loops.map(e => e.chain.join(" -> ")).join("; ") });
  const anchors = entries.flatMap(e => [...e.anchors].filter(([id]) => e.ids?.size && !e.ids.has(id)).map(([id, from]) => `${e.path}#${id} from ${from}`));
  check("Q.links.anchors", "every #anchor link has a matching target on its page", anchors.length === 0, { severity: "medium", title: "Links point at anchors that do not exist", detail: anchors.slice(0, 12).join("; ") });
  const dead = controls.filter(c => c.result === "NOTHING"), stuck = controls.filter(c => c.result.startsWith("could not be pressed")), unnamed = controls.filter(c => c.result === "no-name");
  const pressed = controls.filter(c => !/^not pressed|disabled|no-name|gone/.test(c.result));
  note(`${controls.length} buttons seen; ${pressed.length} pressed; ${controls.filter(c => c.result.startsWith("not pressed")).length} recorded but not pressed`);
  check("Q.buttons.dead", `every button that was pressed (${pressed.length}) does something`, dead.length === 0, { severity: "medium", title: "Buttons that do nothing when pressed", detail: dead.map(c => `${c.who} / ${c.screen} / "${c.text}"`).slice(0, 15).join("; ") });
  check("Q.buttons.blocked", "no button is covered or unreachable", stuck.length === 0, { severity: "medium", title: "Buttons that cannot be pressed (covered by something else, or off screen)", detail: stuck.map(c => `${c.who} / ${c.screen} / "${c.text}": ${c.result}`).slice(0, 10).join("; ") });
  if (unnamed.length) finding("Q.buttons.unnamed", { severity: "low", title: `${unnamed.length} button(s) have no text or label (screen readers announce only "button")`, detail: [...new Set(unnamed.map(c => `${c.who} / ${c.screen}`))].join("; "), fix: "Add aria-label to icon-only buttons." });
  // Stale wording, grouped by what it says.
  const groups = new Map();
  for (const s of stale) { if (!groups.has(s.why)) groups.set(s.why, []); groups.get(s.why).push(s); }
  for (const [why, items] of groups) {
    const legal = items.some(i => /privacy|terms|compliance/.test(i.url)) && /demo/.test(why);
    finding(`Q.stale.${items[0].key}`, { severity: legal ? "high" : "low", kind: "stale-copy", title: `On-screen text ${why}`, actual: items.slice(0, 6).map(i => `${i.who} · ${i.label}: "…${i.quote}…"`).join("\n"), expected: "The wording matches what the product does today.", fix: legal ? "Rewrite the privacy, terms and compliance paragraphs for live intake (lib/demo.ts has DEMO_MODE = false since 9 Nov 2026). These are the notices people agree to when they submit a CV." : "Update the wording on the listed screens.", where: [...new Set(items.map(i => i.url))].join(", ") });
  }
}

writeFileSync(resolve(OUT, "quality-pages.json"), JSON.stringify({ pages: pages.map(p => ({ label: p.label, url: p.url, finalUrl: p.finalUrl, status: p.status, error: p.error, title: p.title, h1: p.h1, failed: p.failed, pageErrors: p.pageErrors, console: p.console, broken: p.broken, links: p.links.length })), links: [...linkIndex.values()].map(e => ({ who: e.who, path: e.path, status: e.status, final: e.final, chain: e.chain, from: e.from.slice(0, 3), anchors: [...e.anchors.keys()] })), controls, redirects, external: [...external] }, null, 2));
const result = R.save({ pagesVisited: pages.length, linksChecked: [...linkIndex.values()].filter(e => typeof e.status === "number").length, buttonsSeen: controls.length });
await browser.close();
process.exit(result.failed ? 1 : 0);
