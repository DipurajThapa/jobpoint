// UAT auditor (user acceptance testing).
//
// Plays every person's part through the real screens, in a real browser, the
// way they would use the product: typing into the forms and pressing the
// buttons. One story from start to finish:
//
//   an employer sends an enquiry -> the owner makes them a client -> the client
//   sets a password, posts a job -> the owner approves it -> a candidate signs
//   up and uploads a CV -> a recruiter shortlists and submits them -> the client
//   reviews, interviews, offers -> the candidate accepts the commitment -> the
//   client marks them joined. Then the branch where a candidate is not selected.
//
// After each step it checks the next person can see the result on their screen.
// It runs after functional.mjs on the same local database (it reuses the
// administrator and recruiter accounts created there).
import { BASE, OUT, PASSWORD, chromium, clearRateLimits, context, loadState, pdfFromText, recorder, row, rows, count, serverUp, stamp } from "./lib.mjs";
import { CVS, COMPANIES, JDS } from "../portal-seed-data.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const R = recorder("uat");
const { check, step, finding, section, note } = R;
if (!await serverUp()) { console.error(`The dev server is not answering at ${BASE}.`); process.exit(2); }
const state = loadState();
if (!state.admin || !state.recruiter) { console.error("Run scripts/audit/functional.mjs first: the UAT story uses the staff accounts it creates."); process.exit(2); }
clearRateLimits();

const U = stamp(), SHOTS = resolve(OUT, "screens"); mkdirSync(SHOTS, { recursive: true });
const TMP = resolve(OUT, "tmp"); mkdirSync(TMP, { recursive: true });
const browser = await chromium.launch();
const T = 12_000;
const mail = n => `${n}.${U}@example.test`;
const seedJd = JDS.find(j => j.key === "jd-accounts-durgapur"), seedCo = COMPANIES.find(c => c.key === "demo-ferro");
const CLIENT = { name: `Bengal Castings ${U}`, legal: `Bengal Castings Private Limited ${U}`, owner: "Ritu Sen", email: mail("ritu.owner") };
const JOB = `Accounts Executive ${U.toUpperCase()}`;
const CAND = { name: `Tanmoy Kar${U.replace(/\d/g, "")}`.slice(0, 40), email: mail("tanmoy"), phone: "+91 90000 55001" };
const cvFor = async (name, email, phone) => { const base = CVS.find(c => c.key === "acc-01").text, lines = base.split("\n"); lines[0] = name; lines[1] = `${email} | ${phone} | Durgapur, West Bengal`; const file = resolve(TMP, `${name.replace(/\W+/g, "-")}.pdf`); writeFileSync(file, await pdfFromText(browser, lines.join("\n"))); return file; };

/** One person at their own browser. Records every failed request and script error for the report. */
async function person(who) {
  const ctx = await context(browser), page = await ctx.newPage(), trouble = [];
  page.on("pageerror", e => trouble.push(`script error: ${String(e.message).slice(0, 200)}`));
  page.on("response", r => { if (r.url().startsWith(BASE) && r.status() >= 500) trouble.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`); });
  page.on("dialog", d => d.accept(page.__answer ?? undefined).catch(() => {}));
  page.setDefaultTimeout(T); page.setDefaultNavigationTimeout(45_000);
  const go = async (path, wait = "networkidle") => { await page.goto(path.startsWith("http") ? path : `${BASE}${path}`, { waitUntil: wait }); await ready(page); };
  const shot = name => page.screenshot({ path: resolve(SHOTS, `uat-${name}.png`), fullPage: true }).catch(() => {});
  const text = () => page.evaluate(() => document.body.innerText);
  const notice = async () => (await page.locator("[role=status], .pj-notice, .admin-notice, .wp-notice, .form-message").allInnerTexts().catch(() => [])).join(" | ");
  return { who, ctx, page, go, shot, text, notice, trouble };
}
/**
 * Wait until the page's script has taken over the screen. A person on a normal
 * connection waits a moment too; pressing before that is checked separately
 * (see "forms pressed before the page is ready" in the quality auditor).
 */
const ready = async page => { await page.waitForLoadState("networkidle").catch(() => {}); await page.waitForFunction(() => { const els = [...document.querySelectorAll("form, button, input")]; return !els.length || els.some(e => Object.keys(e).some(k => k.startsWith("__react"))); }, null, { timeout: 10_000 }).catch(() => {}); };
// Every press, tick and keystroke first waits for the page to be ready, as a person would.
{
  const probe = await browser.newPage(), proto = Object.getPrototypeOf(probe.locator("body"));
  for (const action of ["click", "check", "uncheck", "fill", "selectOption", "setInputFiles"]) { const original = proto[action]; proto[action] = async function (...args) { await ready(this.page()); return original.apply(this, args); }; }
  await probe.close();
}
const fill = async (scope, values) => { await ready(scope.page()); for (const [name, value] of Object.entries(values)) { const el = scope.locator(`[name="${name}"]`).first(); await el.waitFor(); const tag = await el.evaluate(e => `${e.tagName}:${e.type ?? ""}`); if (tag === "INPUT:checkbox") { if (value) await el.check(); else await el.uncheck(); } else if (tag.startsWith("SELECT")) await el.selectOption(String(value)); else await el.fill(String(value)); } };
const localTime = days => { const d = new Date(Date.now() + days * 86_400_000); d.setHours(11, 0, 0, 0); const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const today = new Date().toISOString().slice(0, 10);

// ------------------------------------------------------------------ 1. employer enquiry
section("1. An employer sends a hiring enquiry from the website");
const visitor = await person("visitor");
let enquiryRef = "";
await step("U1.1", "the home page opens and the \"Send a hiring requirement\" button opens the enquiry form", async () => {
  await visitor.go("/");
  await visitor.page.getByRole("button", { name: /Send a hiring requirement/ }).first().click();
  await visitor.page.locator("[role=dialog] [name=contactName]").waitFor();
}, { severity: "blocker" });
await step("U1.2", "the employer fills the form and gets a reference number", async () => {
  const d = visitor.page.locator("[role=dialog]");
  await fill(d, { contactName: CLIENT.owner, company: CLIENT.name, email: CLIENT.email, phone: "+91 90000 56001", roleTitle: "Accounts Executive", location: "Durgapur", headcount: 1, details: "One accounts executive with Tally and GST for our Durgapur office, to start next month.", consent: true, terms: true });
  await d.getByRole("button", { name: /Send hiring enquiry/ }).click();
  await d.locator(".form-message").filter({ hasText: /Reference: HE-/ }).waitFor();
  enquiryRef = (await d.locator(".form-message").innerText()).match(/HE-[A-Z0-9]+/)?.[0] ?? "";
  await visitor.shot("01-enquiry-sent");
  return !!enquiryRef && count("employer_enquiries", "email = ?", CLIENT.email) === 1;
}, { severity: "blocker" });
await step("U1.3", "an incomplete enquiry is stopped by the form (required fields)", async () => {
  await visitor.go("/employers");
  await visitor.page.getByRole("button", { name: /Send a hiring requirement/ }).first().click();
  const d = visitor.page.locator("[role=dialog]");
  await d.locator("[name=contactName]").fill("Only A Name");
  await d.getByRole("button", { name: /Send hiring enquiry/ }).click();
  await visitor.page.waitForTimeout(400);
  return await d.locator("[name=company]").evaluate(e => !e.validity.valid) && count("employer_enquiries", "contact_name = 'Only A Name'") === 0;
}, { severity: "medium" });

// ------------------------------------------------------------------ 2. owner: enquiry -> client
section("2. The owner sees the enquiry and makes the employer a client");
const owner = await person("owner");
let acceptLink = "";
await step("U2.1", "the owner opens the console and finds the enquiry with its reference", async () => {
  await owner.go("/signin-with-chatgpt?return_to=%2Fadmin");
  await owner.page.getByRole("button", { name: /^Employer enquiries/ }).click();
  const card = owner.page.locator("article", { hasText: CLIENT.name });
  await card.waitFor();
  await owner.shot("02-owner-enquiries");
  return (await card.innerText()).includes(enquiryRef);
}, { severity: "blocker" });
{
  const card = owner.page.locator("article", { hasText: CLIENT.name });
  const actions = await card.locator("button, a").allInnerTexts().catch(() => []);
  if (!actions.some(a => /client|invite|convert|create/i.test(a))) finding("U2.2", { severity: "medium", kind: "gap", title: "An enquiry cannot be turned into a client from where it is shown", actual: `The enquiry card offers: a status list, a "Client that … became" list (existing clients only) and ${actions.map(a => `"${a.trim()}"`).join(", ") || "Delete"}. To make the employer a client the owner must go to Job portal → Invite a client and retype the company, contact name and email shown on the enquiry, then come back and pick the client in the list. The server already accepts an enquiry id with the invitation, but no screen sends it. There is also nowhere to write notes on an enquiry, and no way to start a role from it.`, expected: "\"Create client from this enquiry\" on the card: opens the invitation form filled in from the enquiry and links the two automatically.", fix: "Add the button in app/admin/admin-client.tsx (enquiries tab) that switches to the portal tab with the InviteClient form prefilled and passes `enquiryId` to client-invite.", where: "app/admin/admin-client.tsx; app/admin/portal-panel.tsx InviteClient" });
}
await step("U2.3", "the owner invites the client from the Job portal tab and gets a one-time sign-in link", async () => {
  await owner.page.getByRole("button", { name: /^Job portal/ }).click();
  await owner.page.getByRole("button", { name: "Invite a client", exact: true }).click();
  const form = owner.page.locator("form", { has: owner.page.locator("[name=ownerEmail]") });
  await fill(form, { displayName: CLIENT.name, legalName: CLIENT.legal, city: "Durgapur", ownerName: CLIENT.owner, ownerEmail: CLIENT.email, minScore: 65 });
  for (const fam of seedCo.params.roleFamilies) await form.locator(`[name=roleFamilies][value="${fam}"]`).check();
  await form.getByRole("button", { name: /Create client and get sign-in link/ }).click();
  await owner.page.getByText(/\/portal\/accept\?token=/).first().waitFor();
  acceptLink = (await owner.text()).match(/https?:\/\/\S+\/portal\/accept\?token=[\w-]+/)?.[0] ?? "";
  await owner.shot("03-owner-client-invited");
  return !!acceptLink && row("SELECT status FROM companies WHERE display_name = ?", CLIENT.name)?.status === "active";
}, { severity: "blocker" });
await step("U2.4", "the owner links the enquiry to the new client and marks it in progress", async () => {
  await owner.page.getByRole("button", { name: /^Employer enquiries/ }).click();
  let card = owner.page.locator("article", { hasText: CLIENT.name }).first();
  const offered = await card.locator("select").nth(1).locator("option").allInnerTexts();
  if (!offered.includes(`Client: ${CLIENT.name}`)) {
    finding("U2.4a", { severity: "low", kind: "defect", title: "A client created a moment ago is missing from the console's lists until the page is reloaded", actual: `Straight after "Create client and get sign-in link", the enquiry's "Client that … became" list offers: ${offered.join(", ")}. The new client is not in it, and it is also missing from "Client this role is for" on the Open roles tab. Reloading the page brings it in.`, expected: "Lists refresh after a client is created.", fix: "Have PortalPanel call the console's refresh() after a successful action (pass it as a prop), in app/admin/admin-client.tsx.", where: "app/admin/admin-client.tsx; app/admin/portal-panel.tsx" });
    await owner.go("/admin");
    await owner.page.getByRole("button", { name: /^Employer enquiries/ }).click();
    card = owner.page.locator("article", { hasText: CLIENT.name }).first();
  }
  await card.locator("select").nth(1).selectOption({ label: `Client: ${CLIENT.name}` });
  await owner.page.getByText("Enquiry linked to the client.").waitFor();
  await card.locator("select").first().selectOption("in_progress");
  await owner.page.getByText("Enquiry status updated.").waitFor();
  const e = row("SELECT status, company_id FROM employer_enquiries WHERE email = ?", CLIENT.email);
  return e.status === "in_progress" && !!e.company_id;
}, { severity: "medium" });
{
  // "Change parameters" should show what is set today.
  await owner.page.getByRole("button", { name: /^Job portal/ }).click().catch(() => {});
  const card = owner.page.locator("article", { hasText: CLIENT.name, has: owner.page.getByRole("button", { name: "Change parameters" }) }).first();
  await card.waitFor().catch(() => {});
  if (await card.count()) {
    await card.getByRole("button", { name: "Change parameters" }).click().catch(() => {});
    const shown = await card.locator("[name=minScore]").inputValue().catch(() => "");
    const ticked = await card.locator("[name=roleFamilies]:checked").count().catch(() => -1);
    if (shown && (shown !== "65" || ticked === 0)) finding("U2.5", { severity: "high", kind: "defect", title: "\"Change parameters\" opens a blank form and saving it replaces the client's rules with defaults", actual: `This client was set up with minimum score 65 and ${seedCo.params.roleFamilies.length} permitted role families. Opening "Change parameters" shows minimum score ${shown} and ${ticked} role families ticked: the form never loads the current values, and nothing on the card shows what they are. Pressing "Save parameters" overwrites everything with what is on the form; live jobs that no longer fit are paused.`, expected: "The form opens showing the client's current rules, so the owner changes one thing and keeps the rest.", fix: "Return each company's current params from adminOverview() (lib/portal/views.ts) and pass them to <ParamsFields defaults={…}/> in app/admin/portal-panel.tsx.", where: "app/admin/portal-panel.tsx ParamsFields; lib/portal/views.ts adminOverview" });
    await card.getByRole("button", { name: "Change parameters" }).click().catch(() => {});
  }
}

// ------------------------------------------------------------------ 3. client: set password, post a job
section("3. The client sets a password, signs in and posts a job");
const client = await person("client");
await step("U3.1", "the client opens the one-time link, sets a password and signs in to the hiring dashboard", async () => {
  await client.go(acceptLink);
  const f = client.page.locator("form");
  await fill(f, { password: PASSWORD, confirm: PASSWORD });
  await f.getByRole("button", { name: "Set password" }).click();
  await client.page.getByRole("link", { name: "Sign in" }).click();
  await client.page.waitForURL(/\/portal\/sign-in/);
  await fill(client.page.locator("form"), { email: CLIENT.email, password: PASSWORD });
  await client.page.getByRole("button", { name: "Sign in" }).click();
  await client.page.waitForURL(/\/company/);
  await client.page.getByRole("heading", { name: "Hiring funnel" }).waitFor();
  await client.shot("04-client-dashboard");
  return (await client.text()).includes(CLIENT.name);
}, { severity: "blocker" });
await step("U3.2", "the one-time link cannot be used a second time", async () => {
  const again = await person("someone with the old link");
  await again.go(acceptLink);
  await fill(again.page.locator("form"), { password: "another long password 99", confirm: "another long password 99" }).catch(() => {});
  await again.page.getByRole("button", { name: "Set password" }).click().catch(() => {});
  await again.page.waitForTimeout(800);
  const t = await again.text(); await again.ctx.close();
  return /invalid|expired|already|not valid/i.test(t);
}, { severity: "high", title: "A used client invitation link still works" });
await step("U3.3", "the client posts a job and submits it for approval", async () => {
  await client.page.getByRole("button", { name: "Jobs", exact: true }).click();
  await client.page.getByRole("button", { name: "Post a job" }).click();
  const f = client.page.locator("form", { has: client.page.locator("[name=text]") });
  await fill(f, { title: JOB, location: "Durgapur", openings: 1, text: seedJd.text });
  await f.getByRole("button", { name: "Create draft" }).click();
  await client.page.getByRole("button", { name: "Submit for approval" }).waitFor();
  await client.shot("05-client-job-draft");
  await client.page.getByRole("button", { name: "Submit for approval" }).click();
  await client.page.getByText(/Submitted/).first().waitFor();
  return row("SELECT status FROM jds WHERE title = ?", JOB)?.status === "pending";
}, { severity: "blocker" });
await step("U3.4", "the client sees the job as waiting for approval", async () => {
  await client.page.getByRole("button", { name: "Jobs", exact: true }).click();
  const item = client.page.locator(".pj-item", { hasText: JOB });
  await item.waitFor();
  const t = await item.innerText();
  if (/Self-service/.test(t)) finding("U3.4a", { severity: "low", kind: "stale-copy", title: "A job waiting for approval is labelled \"Self-service\" to the client", actual: `The client's job card reads: "${t.replace(/\s+/g, " ").slice(0, 160)}". Self-service was removed; every job is managed by Jobboard300.`, expected: "\"Managed by Jobboard300\" on every job, whatever its status.", fix: "The pill reads the service from the overview, which leaves out some jobs; show \"Managed by Jobboard300\" unconditionally in app/company/company-app.tsx Home.", where: "app/company/company-app.tsx" });
  return /Waiting for Jobboard300 approval/.test(t);
}, { severity: "medium" });

// ------------------------------------------------------------------ 4. owner approves; admin assigns the client to a team
section("4. The owner approves the job; the administrator gives the client to a recruiting team");
await step("U4.1", "the owner finds the job under \"Jobs awaiting approval\" and approves it", async () => {
  await owner.go("/admin");
  await owner.page.getByRole("button", { name: /^Job portal/ }).click();
  const card = owner.page.locator("article", { hasText: JOB, has: owner.page.getByRole("button", { name: "Approve and go live" }) }).first();
  await card.waitFor();
  await card.getByRole("button", { name: "Approve and go live" }).click();
  await owner.page.locator(".admin-notice, [role=status]").filter({ hasText: /live/i }).first().waitFor();
  await owner.shot("06-owner-job-approved");
  return row("SELECT status FROM jds WHERE title = ?", JOB)?.status === "live";
}, { severity: "blocker" });
const staffAdmin = await person("administrator");
await step("U4.2", "the administrator signs in to the Working Platform and opens the Recruiting tool", async () => {
  await staffAdmin.go("/platform/sign-in");
  await fill(staffAdmin.page.locator("form"), { email: state.admin, password: PASSWORD });
  await staffAdmin.page.getByRole("button", { name: /sign in/i }).click();
  await staffAdmin.page.waitForURL(u => /\/platform\/?$/.test(new URL(u).pathname));
  await staffAdmin.page.getByRole("link", { name: /Recruiting/ }).first().click();
  await staffAdmin.page.getByRole("heading", { name: "Jobs" }).waitFor();
  return (await staffAdmin.text()).includes(JOB);
}, { severity: "blocker" });
await step("U4.3", "the administrator assigns the new client to the recruiter's team", async () => {
  const sel = staffAdmin.page.getByLabel(`Team for ${CLIENT.name}`);
  const options = await sel.locator("option").allInnerTexts();
  const team = options.find(o => /Kolkata desk/.test(o));
  await sel.selectOption({ label: team });
  await staffAdmin.page.getByText("Client assigned.").waitFor();
  return !!row("SELECT team_id FROM companies WHERE display_name = ?", CLIENT.name)?.team_id;
}, { severity: "blocker" });

// ------------------------------------------------------------------ 5. candidate
section("5. A candidate creates an account, verifies the email and uploads a CV");
const candidate = await person("candidate");
await step("U5.1", "the candidate registers and is shown what to do next", async () => {
  await candidate.go("/portal/register");
  const f = candidate.page.locator("form");
  await fill(f, { name: CAND.name, city: "Durgapur", email: CAND.email, phone: CAND.phone, password: PASSWORD, adult: true, terms: true });
  await f.getByRole("button", { name: "Create account" }).click();
  await candidate.page.getByRole("link", { name: /open the verification link/ }).waitFor();
  return true;
}, { severity: "blocker" });
await step("U5.2", "the candidate verifies the email, signs in and lands on \"My CV and privacy\"", async () => {
  await candidate.page.getByRole("link", { name: /open the verification link/ }).click();
  await candidate.page.getByRole("button", { name: "Verify my email" }).click();
  await candidate.page.getByRole("link", { name: "Sign in" }).click();
  await fill(candidate.page.locator("form"), { email: CAND.email, password: PASSWORD });
  await candidate.page.getByRole("button", { name: "Sign in" }).click();
  await candidate.page.waitForURL(/\/candidate/);
  await candidate.page.getByRole("heading", { name: "Upload your CV" }).waitFor();
  return true;
}, { severity: "blocker" });
{
  const t = await candidate.text();
  if (!/Your data|Download my data|Delete my account/.test(t)) finding("U5.3", { severity: "medium", kind: "gap", title: "A candidate with no CV yet cannot download or delete their data", actual: "Until a CV has been uploaded the candidate page shows only the inbox, tests and the upload form. \"Download my data\" and \"Delete my account\" appear only after a CV is on file, so someone who registered and changed their mind has no way to delete the account.", expected: "\"Your data\" (download, delete) is always shown.", fix: "Render the \"Your data\" card outside the `profile?.profile &&` condition in app/candidate/candidate-app.tsx.", where: "app/candidate/candidate-app.tsx" });
}
await step("U5.4", "the candidate uploads a CV and sees the details read from it", async () => {
  const f = candidate.page.locator("form", { has: candidate.page.locator("[name=resume]") });
  await f.locator("[name=resume]").setInputFiles(await cvFor(CAND.name, CAND.email, CAND.phone));
  await f.locator("[name=consentProfile]").check();
  await f.getByRole("button", { name: "Upload CV" }).click();
  await candidate.page.getByRole("heading", { name: "Details read from your CV" }).waitFor({ timeout: 30_000 });
  await candidate.shot("07-candidate-cv-read");
  const k = row("SELECT id FROM candidates WHERE email = ?", CAND.email);
  CAND.id = k?.id;
  return !!k && count("cvs", "candidate_id = ?", k.id) === 1;
}, { severity: "blocker" });
await step("U5.5", "the candidate corrects the notice period and expected salary, and the change is kept after a reload", async () => {
  const f = candidate.page.locator("form", { has: candidate.page.locator("[name=noticeDays]") });
  await fill(f, { noticeDays: 30, ctcExpected: 4.5 });
  await f.getByRole("button", { name: "Save corrections" }).click();
  await candidate.page.locator(".pj-notice.good").first().waitFor();
  await candidate.go("/candidate");
  await candidate.page.locator("[name=noticeDays]").waitFor();
  return await candidate.page.locator("[name=noticeDays]").inputValue() === "30" && await candidate.page.locator("[name=ctcExpected]").inputValue() === "4.5";
}, { severity: "high", title: "A candidate's corrections to their profile are not kept" });

// ------------------------------------------------------------------ 6. website applicant
section("6. A visitor applies to a published role from the website");
const APPLICANT = { name: `Rupa Ghosh${U.replace(/\d/g, "")}`.slice(0, 40), email: mail("rupa"), phone: "+91 90000 57001" };
let applyRef = "";
await step("U6.1", "the visitor finds the role on the home page and opens it", async () => {
  await visitor.go("/");
  const link = visitor.page.locator(`a[href="/jobs/${state.roleId}"]`).first();
  await link.waitFor();
  await link.click();
  await visitor.page.waitForURL(new RegExp(`/jobs/${state.roleId}`));
  await visitor.page.getByRole("button", { name: "Apply for this role" }).waitFor();
}, { severity: "blocker" });
await step("U6.2", "the visitor fills the application, attaches a CV and gets a reference", async () => {
  const f = visitor.page.locator("form.apply-form");
  await fill(f, { fullName: APPLICANT.name, email: APPLICANT.email, phone: APPLICANT.phone, location: "Durgapur", skills: "Tally, GST, TDS", availability: "30 days", education: "B.Com", experience: "Three years of accounts work in Tally Prime with GST and TDS.", consent: true, adult: true, terms: true, shareConsent: true });
  await f.locator("[name=resume]").setInputFiles(await cvFor(APPLICANT.name, APPLICANT.email, APPLICANT.phone));
  await f.getByRole("button", { name: "Apply for this role" }).click();
  await f.locator(".form-message").filter({ hasText: /Reference: JP-/ }).waitFor({ timeout: 30_000 });
  applyRef = (await f.locator(".form-message").innerText()).match(/JP-[A-Z0-9]+/)?.[0] ?? "";
  await visitor.shot("08-application-sent");
  return !!applyRef && count("applications", "email = ?", APPLICANT.email) === 1;
}, { severity: "blocker" });
await step("U6.3", "the owner finds the applicant by name in the candidate pipeline, with the same reference, and downloads the CV", async () => {
  await owner.go("/admin");
  await owner.page.getByRole("button", { name: /^Candidate pipeline/ }).click();
  await owner.page.getByPlaceholder("Search candidate records").fill(APPLICANT.name);
  const card = owner.page.locator("article", { hasText: APPLICANT.name }).first();
  await card.waitFor();
  const t = await card.innerText();
  const [download] = await Promise.all([owner.page.waitForEvent("download"), card.getByRole("link", { name: /Download CV/ }).click()]);
  await owner.shot("09-owner-applicant");
  return t.includes(applyRef) && t.includes(APPLICANT.email) && /\.pdf$/i.test(download.suggestedFilename());
}, { severity: "blocker" });
await step("U6.4", "the owner can find an applicant by the reference number the applicant was given", async () => {
  await owner.page.getByPlaceholder("Search candidate records").fill(applyRef);
  await owner.page.waitForTimeout(900);
  return await owner.page.locator("article", { hasText: APPLICANT.name }).count() > 0;
}, { severity: "medium", kind: "gap", title: "The owner cannot look an application up by its reference number", actual: "Applicants and employers are told \"Keep this reference for follow-up\" (JP-…, HE-…). Typing the reference into the candidate search finds nothing: the search covers name, email, location, skill and desired role only, and enquiries have no search at all.", expected: "Searching for JP-… or HE-… finds the record.", fix: "In GET /api/admin/records, when the query starts with JP- or HE-, match it against the id prefix (replace(substr(id,1,13),'-','')); add a search box to the enquiries tab.", where: "app/api/admin/records/route.ts; app/admin/admin-client.tsx" });
{
  const t = await owner.text();
  if (!/href="\/platform/.test(await owner.page.content()) && /Recruiting tool/.test(t)) finding("U6.5", { severity: "medium", kind: "gap", title: "The owner console keeps pointing to \"the Recruiting tool\" but has no link to it", actual: "The candidate pipeline and the role list say \"Stages are set in the Recruiting tool\" and \"Work the candidates in the Recruiting tool\". Nothing on the console links to /platform/recruiting, and the owner's console sign-in is a different sign-in from the Working Platform's, so the owner has to know the address and sign in again.", expected: "A \"Recruiting tool\" link in the console's menu and beside each role and applicant (opening that role's pipeline).", fix: "Add links to /platform/recruiting in app/admin/admin-client.tsx (sidebar and the two help lines).", where: "app/admin/admin-client.tsx" });
}

// ------------------------------------------------------------------ 7. recruiter
section("7. The recruiter shortlists and submits the candidate");
const recruiter = await person("recruiter");
const jobCard = () => recruiter.page.locator("article.pj-item", { hasText: JOB }).first();
await step("U7.1", "the recruiter signs in and sees the new client's job", async () => {
  await recruiter.go("/platform/sign-in");
  await fill(recruiter.page.locator("form"), { email: state.recruiter, password: PASSWORD });
  await recruiter.page.getByRole("button", { name: /sign in/i }).click();
  await recruiter.page.waitForURL(u => /\/platform\/?$/.test(new URL(u).pathname));
  await recruiter.go("/platform/recruiting");
  await jobCard().waitFor();
  return true;
}, { severity: "blocker" });
let submittedName = "";
await step("U7.2", "the recruiter opens the job and sees candidates to submit", async () => {
  await jobCard().getByRole("button", { name: "Open" }).click();
  await jobCard().getByRole("heading", { name: "Candidates to submit" }).waitFor();
  await recruiter.page.waitForTimeout(800);
  const names = await jobCard().locator(".pj-note > b").allInnerTexts();
  note(`shortlist shown to the recruiter: ${names.join(", ")}`);
  await recruiter.shot("10-recruiter-shortlist");
  return names.length > 0;
}, { severity: "blocker", title: "A recruiter opens a live job and is shown no candidates" });
await step("U7.3", "the recruiter passes on other candidates (with a reason) until the new candidate is shown", async () => {
  for (let i = 0; i < 8; i++) {
    if (await jobCard().locator(".pj-note", { hasText: CAND.name }).count()) return true;
    const first = jobCard().locator(".pj-note", { has: recruiter.page.getByRole("button", { name: "Pass" }) }).first();
    if (!await first.count()) return false;
    await first.locator("select[name=reason]").selectOption("experience_mismatch");
    await first.getByRole("button", { name: "Pass" }).click();
    await recruiter.page.waitForTimeout(900);
  }
  return await jobCard().locator(".pj-note", { hasText: CAND.name }).count() > 0;
}, { severity: "high", title: "The newly registered candidate never reaches the recruiter's shortlist" });
const candCard = () => jobCard().locator(".pj-note", { hasText: CAND.name }).first();
await step("U7.4", "the recruiter opens the candidate's phone and email, and they match what the candidate entered", async () => {
  await candCard().getByRole("button", { name: /Show phone and email/ }).click();
  await candCard().getByText(/Phone:/).waitFor();
  const t = await candCard().innerText();
  return t.includes(CAND.email) && t.replace(/\s/g, "").includes(CAND.phone.replace(/\s/g, ""));
}, { severity: "blocker", title: "The recruiter is not shown the contact details the candidate entered" });
{
  const t = await candCard().innerText().catch(() => "");
  const links = await candCard().locator("a, button").allInnerTexts().catch(() => []);
  if (t && !links.some(l => /cv|profile|resume/i.test(l))) finding("U7.5", { severity: "high", kind: "gap", title: "A recruiter cannot open a candidate's CV or profile anywhere in the Recruiting tool", actual: `The candidate card shows the name, city, a one-line match summary ("${t.split("\n").find(l => /meets|misses|experience|skill/i.test(l))?.slice(0, 120) ?? "…"}") and the contact button. There is no way to read the CV, the work history, the skills, the notice period or the expected salary, yet the recruiter must write "Why this candidate, notice, CTC, availability" for the client and vouch for the person. The client sees the full profile; the recruiter who submits it does not.`, expected: "\"View CV\" on each shortlisted candidate and each pipeline row: the parsed profile and the original file, recorded in the access log like the contact view.", fix: "Add scoped GET actions `profile` and `cv` to app/api/platform/recruiting/[action]/route.ts (same rule as staffContact: shown to this person for this job, or in the job's pipeline; audited) and a \"View CV\" link in recruiting.tsx.", where: "app/api/platform/recruiting/[action]/route.ts; lib/portal/staff.ts; app/platform/recruiting/recruiting.tsx" });
}
await step("U7.6", "the recruiter writes a note and submits the candidate to the client", async () => {
  await candCard().locator("input[name=note]").fill("Five years in Tally and GST at a steel trader; 30 days notice; expects 4.5 LPA.");
  await candCard().getByRole("button", { name: "Submit to client" }).click();
  await recruiter.page.getByText("Submitted to the client.").waitFor();
  submittedName = CAND.name;
  const pipeRow = jobCard().locator(".pj-note", { hasText: CAND.name }).first();
  await pipeRow.getByText("Submitted by Jobboard300").waitFor();
  await recruiter.shot("11-recruiter-submitted");
  return count("pipeline", "candidate_id = ? AND stage = 'submitted'", CAND.id ?? "") === 1;
}, { severity: "blocker" });
{
  const pipeRow = jobCard().locator(".pj-note", { hasText: CAND.name }).first();
  const t = await pipeRow.innerText().catch(() => ""), controlsHere = await pipeRow.locator("button, a").allInnerTexts().catch(() => []);
  if (t && !controlsHere.some(c => /phone|email|contact/i.test(c)) && !t.includes(CAND.email)) finding("U7.7", { severity: "high", kind: "gap", title: "Once a candidate is submitted, the recruiter can no longer open their phone number or email", actual: "\"Show phone and email\" exists only on the \"Candidates to submit\" cards. The moment the candidate is submitted they move to the Pipeline list, which has no contact button, and they leave the shortlist. From then on, through shortlisting, interview scheduling, offer and joining follow-up, the recruiter has no way on screen to get the number they need to call. (The server would allow it; the screen has no button.)", expected: "\"Show phone and email\" on every pipeline row, with the same access record and daily limit.", fix: "Return `candidateId` from staffPipeline() (lib/portal/staff.ts) and reuse the contact button in the pipeline rows of recruiting.tsx.", where: "app/platform/recruiting/recruiting.tsx; lib/portal/staff.ts staffPipeline" });
  if (t && !t.includes("Five years in Tally")) finding("U7.8", { severity: "low", kind: "gap", title: "The recruiter's own note to the client is not shown back in the Recruiting tool", actual: "After submitting, the pipeline row shows the name and stage only. The note written for the client, the offered salary, the offer date and the joining date are returned by the server but not displayed, so a colleague picking up the job cannot see what the client was told.", expected: "The pipeline row shows the note and the offer and joining details.", fix: "Render recruiterNote, offerCtcInr, offerDate and joiningDate in the pipeline rows of recruiting.tsx.", where: "app/platform/recruiting/recruiting.tsx" });
}

// ------------------------------------------------------------------ 8. client review, interview
section("8. The client reviews the candidate, shortlists and interviews");
const row8 = () => client.page.locator("article.pj-item", { hasText: CAND.name }).first();
await step("U8.1", "the client's overview shows the update from Jobboard300 and one candidate to review", async () => {
  await client.go("/company");
  await client.page.getByRole("heading", { name: "Updates from Jobboard300" }).waitFor();
  await client.shot("12-client-update");
  return /New candidate for/.test(await client.text()) && /1\s*To review/.test((await client.text()).replace(/\n/g, " "));
}, { severity: "high" });
await step("U8.2", "the client opens the pipeline and sees the candidate with the recruiter's note", async () => {
  await client.page.getByRole("button", { name: "Pipeline", exact: true }).click();
  await row8().waitFor();
  return (await row8().innerText()).includes("Five years in Tally");
}, { severity: "blocker" });
await step("U8.3", "the client opens the profile: experience and skills are shown, contact details are held back", async () => {
  await row8().getByRole("button", { name: "Profile" }).click();
  await client.page.getByRole("heading", { name: "Experience" }).waitFor();
  const t = await client.text();
  await client.shot("13-client-profile");
  return /Contact details are shared once you make an offer/.test(t) && !t.includes(CAND.email) && !t.includes("90000 55001");
}, { severity: "blocker", title: "The client sees the candidate's contact details before making an offer" });
await step("U8.4", "the client downloads the CV as a PDF", async () => {
  const [download] = await Promise.all([client.page.waitForEvent("download"), client.page.getByRole("link", { name: /Download CV/ }).click()]);
  return /\.pdf$/.test(download.suggestedFilename());
}, { severity: "high" });
{
  const back = await client.page.getByRole("button", { name: /Back to/ }).innerText().catch(() => "");
  await client.page.getByRole("button", { name: /Back to/ }).click().catch(() => {});
  await client.page.waitForTimeout(500);
  const landed = /Pipeline/.test(await client.page.locator("h2").first().innerText().catch(() => ""));
  if (/dashboard/i.test(back) && landed) finding("U8.5", { severity: "low", kind: "defect", title: "\"Back to dashboard\" on the candidate profile goes to the pipeline", actual: "The button is labelled \"Back to dashboard\" and opens the Pipeline screen (with the job filter cleared).", expected: "Label it \"Back to pipeline\" and keep the job filter.", fix: "Rename the button in app/company/company-app.tsx Candidate and pass the job id back.", where: "app/company/company-app.tsx" });
}
await step("U8.6", "the client moves the candidate to \"Shortlisted\"", async () => {
  await client.page.getByRole("button", { name: "Pipeline", exact: true }).click();
  await row8().getByLabel("Move to stage").selectOption("shortlisted");
  await row8().getByRole("button", { name: "Save" }).click();
  await client.page.getByText(/Moved to “Shortlisted”/).waitFor();
  return row("SELECT stage FROM pipeline WHERE candidate_id = ?", CAND.id)?.stage === "shortlisted";
}, { severity: "blocker" });
await step("U8.7", "the client schedules a first interview", async () => {
  await row8().getByRole("button", { name: "Schedule interview" }).click();
  const f = row8().locator("form");
  await fill(f, { round: "Technical 1", when: localTime(3), mode: "video", location: `https://meet.example/${U}`, interviewer: "R. Sen" });
  await f.getByRole("button", { name: "Schedule" }).click();
  await client.page.getByText("Interview scheduled.").waitFor();
  await row8().getByText("Interviewing").waitFor();
  await client.shot("14-client-interview");
  return count("interviews", "round = 'Technical 1' AND location = ?", `https://meet.example/${U}`) === 1;
}, { severity: "blocker" });
await step("U8.8", "the client records the interview outcome and feedback", async () => {
  await row8().getByRole("button", { name: "Record feedback" }).click();
  const f = row8().locator("form");
  await fill(f, { status: "completed", outcome: "advance", rating: "4", feedback: "Strong on GST; fine on TDS." });
  await f.getByRole("button", { name: "Save feedback" }).click();
  await client.page.getByText("Interview updated.").waitFor();
  await row8().getByText(/completed: advance, 4\/5/).waitFor();
  return true;
}, { severity: "blocker" });
await step("U8.9", "the recruiter's screen shows the stage, the interview and its outcome", async () => {
  await recruiter.go("/platform/recruiting");
  await jobCard().getByRole("button", { name: "Open" }).click();
  const r = jobCard().locator(".pj-note", { hasText: CAND.name }).first();
  await r.getByText("Interviewing").waitFor();
  const t = await r.innerText();
  await recruiter.shot("15-recruiter-interview");
  if (!t.includes("Strong on GST")) finding("U8.9a", { severity: "high", kind: "gap", title: "The client's interview feedback is not shown to the recruiter", actual: `The client wrote feedback ("Strong on GST; fine on TDS.", 4/5) and was told on the form that it is "Shared with Jobboard300 to improve the next shortlist". The recruiter's pipeline row shows only: "${t.split("\n").find(l => /Technical 1/.test(l)) ?? ""}". The feedback text, the rating, the meeting link and the interviewer's name are sent to the recruiter's screen by the server but never displayed.`, expected: "The recruiter sees the feedback, rating, link and interviewer under each interview.", fix: "In app/platform/recruiting/recruiting.tsx, extend the interview line to print location, interviewer, rating and feedback (the Entry type needs those fields).", where: "app/platform/recruiting/recruiting.tsx" });
  return /Technical 1/.test(t) && /completed: advance/.test(t);
}, { severity: "high" });
{
  const r = jobCard().locator(".pj-note", { hasText: CAND.name }).first();
  const acts = await r.locator("button, select, a").evaluateAll(els => els.map(e => e.innerText || e.getAttribute("aria-label") || "")).catch(() => []);
  note(`recruiter's actions on a pipeline row: ${acts.map(a => a.split("\n")[0]).join(" | ")}`);
}

// ------------------------------------------------------------------ 9. offer, commitment, joining
section("9. Selected: offer, the candidate's commitment, joining");
let commitLink = "";
await step("U9.1", "the client makes an offer with the salary", async () => {
  await client.go("/company");
  await client.page.getByRole("button", { name: "Pipeline", exact: true }).click();
  await row8().getByLabel("Move to stage").selectOption("offered");
  const f = row8().locator("form");
  await fill(f, { offerLpa: 4.5 });
  await f.getByRole("button", { name: "Save" }).click();
  await client.page.getByText(/Moved to “Offer made”/).waitFor();
  return Number(row("SELECT offer_ctc_inr FROM pipeline WHERE candidate_id = ?", CAND.id)?.offer_ctc_inr) === 450000;
}, { severity: "blocker" });
await step("U9.2", "after the offer the client's profile view shows the candidate's contact details", async () => {
  await row8().getByRole("button", { name: "Profile" }).click();
  await client.page.getByRole("heading", { name: "Experience" }).waitFor();
  const t = await client.text();
  await client.page.getByRole("button", { name: /Back to/ }).click();
  return t.includes(CAND.email);
}, { severity: "high" });
await step("U9.3", "the recruiter sees the commitment waiting and gets a link to send", async () => {
  await recruiter.go("/platform/recruiting");
  await jobCard().getByRole("button", { name: "Open" }).click();
  const r = jobCard().locator(".pj-note", { hasText: CAND.name }).first();
  await r.getByText(/Offer commitment: sent, not yet accepted/).waitFor();
  await r.getByRole("button", { name: "Get a new link to send" }).click();
  await recruiter.page.getByText(/\/commit\?token=/).first().waitFor();
  commitLink = (await recruiter.text()).match(/https?:\/\/\S+\/commit\?token=[a-f0-9]{64}/)?.[0] ?? "";
  const asLink = await recruiter.page.locator(`a[href*="/commit?token="], input[value*="/commit?token="]`).count();
  if (!asLink) finding("U9.3a", { severity: "medium", kind: "defect", title: "One-time links in the Recruiting tool appear as plain text in a message that the next action wipes", actual: "\"Get a new link to send\", \"Send a test…\" and \"Invite and get link\" put the link at the end of the status line at the top of the page. It cannot be clicked or copied with a button, the recruiter has usually scrolled far below it, and the next thing they press replaces the message. A test link lost this way cannot be issued again (\"This candidate already has this test for this job\").", expected: "A box with the link, a Copy button and (for tests and commitments) \"send again\".", fix: "Reuse the copy box from app/platform/admin/team-access.tsx in recruiting.tsx; add a `test-link` reissue action.", where: "app/platform/recruiting/recruiting.tsx" });
  return !!commitLink;
}, { severity: "high" });
await step("U9.4", "the candidate opens the commitment link, reads it and accepts", async () => {
  const anyone = await person("candidate (from the link)");
  // The link is built for the public site address; open the same path on the server under test.
  const u = new URL(commitLink); await anyone.go(`${u.pathname}${u.search}`);
  await anyone.page.getByRole("heading", { name: "Your commitment for this offer" }).waitFor();
  const acceptBefore = await anyone.page.getByRole("button", { name: "Accept" }).isDisabled();
  await anyone.page.getByRole("checkbox").check();
  await anyone.page.getByRole("button", { name: "Accept" }).click();
  await anyone.page.getByText(/You accepted this on/).waitFor();
  await anyone.shot("16-commitment-accepted"); await anyone.ctx.close();
  return acceptBefore && !!row("SELECT accepted_at FROM candidate_commitments WHERE candidate_id = ?", CAND.id)?.accepted_at;
}, { severity: "high" });
await step("U9.5", "the client records that the offer was accepted, with the joining date", async () => {
  await client.go("/company");
  await client.page.getByRole("button", { name: "Pipeline", exact: true }).click();
  await row8().getByLabel("Move to stage").selectOption("offer_accepted");
  const f = row8().locator("form");
  await fill(f, { joiningDate: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10), competingOffers: "none known" });
  await f.getByRole("button", { name: "Save" }).click();
  await client.page.getByText(/Moved to “Offer accepted”/).waitFor();
  await client.page.getByRole("button", { name: "Overview", exact: true }).click();
  await client.page.getByRole("heading", { name: "Offers accepted, waiting to join" }).waitFor();
  return (await client.text()).includes(CAND.name);
}, { severity: "high" });
await step("U9.6", "the client marks the candidate as joined and the hire appears with its replacement guarantee", async () => {
  await client.page.getByRole("button", { name: "Pipeline", exact: true }).click();
  await row8().getByLabel("Move to stage").selectOption("joined");
  const f = row8().locator("form");
  await fill(f, { joiningDate: today });
  await f.getByRole("button", { name: "Save" }).click();
  await client.page.getByText(/Moved to “Joined”/).waitFor();
  await client.page.getByRole("button", { name: "Overview", exact: true }).click();
  const table = client.page.locator("section", { hasText: "Hires and replacement guarantee" });
  await table.getByText(CAND.name).waitFor();
  await client.shot("17-client-hire");
  const pl = row("SELECT fee_inr, ctc_inr, status FROM placements WHERE candidate_id = ?", CAND.id);
  return /In guarantee/.test(await table.innerText()) && Number(pl.ctc_inr) === 450000 && Number(pl.fee_inr) === Math.round(450000 * 8.33 / 100);
}, { severity: "blocker" });
await step("U9.7", "the owner's Job portal tab lists the placement with the fee", async () => {
  await owner.go("/admin");
  await owner.page.getByRole("button", { name: /^Job portal/ }).click();
  await owner.page.getByRole("heading", { name: /Placements/ }).waitFor();
  const t = await owner.text();
  await owner.shot("18-owner-placement");
  return t.includes(JOB) && /37,?485/.test(t);
}, { severity: "high", title: "The owner's placements list does not show the new placement or its fee" });
await step("U9.8", "the candidate's inbox tells the whole story: put forward, shortlisted, interview, offer, commitment, hired", async () => {
  await candidate.go("/candidate");
  await candidate.page.getByRole("heading", { name: /^Inbox/ }).waitFor();
  const inbox = await candidate.page.locator("section", { has: candidate.page.getByRole("heading", { name: /^Inbox/ }) }).innerText();
  await candidate.shot("19-candidate-inbox");
  const need = [/put forward/i, /shortlisted/i, /Interview for/i, /offer/i, /commitment/i];
  const missing = need.filter(n => !n.test(inbox)).map(String);
  if (missing.length) throw new Error(`missing from the inbox: ${missing.join(", ")}`);
  const clickable = await candidate.page.locator(`section a[href*="/commit?token="]`).count();
  if (!clickable && /\/commit\?token=/.test(inbox)) finding("U9.8a", { severity: "medium", kind: "defect", title: "Links in the candidate's inbox cannot be clicked", actual: "The commitment link and test links arrive in the inbox as part of the message text (\"…staying at least 60 days: https://…/commit?token=…\"). They are shown as plain text; on a phone the candidate must select and copy a 100-character address. The interview's video link is the same.", expected: "Links in inbox messages are clickable, or the message carries an \"Open\" button.", fix: "In app/candidate/candidate-app.tsx Inbox, split the body on URLs and render them as <a>; better, store the link in its own column and render a button.", where: "app/candidate/candidate-app.tsx Inbox; lib/portal/notify.ts" });
  return !inbox.includes("Strong on GST") && !/4\/5/.test(inbox);
}, { severity: "high" });
{
  const emails = count("messages", "channel = 'email'"), wa = rows("SELECT status, COUNT(*) AS n FROM messages WHERE channel = 'whatsapp' GROUP BY status").map(r => `${r.n} ${r.status}`).join(", ");
  const kinds = rows("SELECT DISTINCT channel FROM messages").map(r => r.channel).join(", ");
  if (emails === 0) finding("U9.9", { severity: "blocker", kind: "gap", title: "Nothing is ever sent to a candidate or a client: every update exists only inside the portal", actual: `Every stage change, interview time, offer, commitment link and rejection is written to an inbox that the person sees only if they sign in to the portal. No email is sent for any of them (messages recorded so far, by channel: ${kinds}; emails: 0; WhatsApp: ${wa || "none"} — and no WhatsApp provider is connected, so those are not sent either). A website applicant has no portal account at all, so they are never told anything after the on-screen reference: not that they were put forward, not the interview time and link, not the offer or the commitment link, not that they were not selected. A client is not emailed when a candidate is submitted for review. Email is already wired for sign-up and password links only.`, expected: "Each inbox message is also emailed to the address on the person's record (and to the client's users for client updates), with a link back to the portal; website applicants get the same emails.", fix: "In notifyCandidate()/notifyCompany() (lib/portal/notify.ts) call sendMail() to candidates.email / the company's users and record a row with channel 'email'. Set MAIL_API_KEY and MAIL_FROM in the environment and send one test message (the ZeptoMail request shape is marked unverified in docs/PORTAL.md).", where: "lib/portal/notify.ts; lib/portal/mailer.ts" });
}

// ------------------------------------------------------------------ 10. not selected
section("10. Not selected: the client rejects a second candidate");
let second = "";
await step("U10.1", "the recruiter submits a second candidate for the same job", async () => {
  await recruiter.go("/platform/recruiting");
  await jobCard().getByRole("button", { name: "Open" }).click();
  await jobCard().getByRole("heading", { name: "Candidates to submit" }).waitFor();
  await recruiter.page.waitForTimeout(800);
  const card = jobCard().locator(".pj-note", { has: recruiter.page.getByRole("button", { name: "Submit to client" }) }).first();
  if (!await card.count()) throw new Error("no further candidate with consent is on the shortlist");
  second = (await card.locator("b").first().innerText()).trim();
  await card.locator("input[name=note]").fill("Second option; available immediately.");
  await card.getByRole("button", { name: "Submit to client" }).click();
  await recruiter.page.getByText("Submitted to the client.").waitFor();
  return !!second;
}, { severity: "high" });
if (second) {
  const row10 = () => client.page.locator("article.pj-item", { hasText: second }).first();
  await step("U10.2", "the client cannot reject without choosing a reason", async () => {
    await client.go("/company");
    await client.page.getByRole("button", { name: "Pipeline", exact: true }).click();
    await row10().getByLabel("Move to stage").selectOption("rejected");
    const f = row10().locator("form");
    await f.getByRole("button", { name: "Save" }).click();
    await client.page.waitForTimeout(400);
    return await f.locator("[name=reason]").evaluate(e => !e.validity.valid);
  }, { severity: "high" });
  await step("U10.3", "with a reason the candidate moves to \"Not selected\" and leaves the in-process list", async () => {
    const f = row10().locator("form");
    await fill(f, { reason: "experience_level", note: "Needs more GST exposure" });
    await f.getByRole("button", { name: "Save" }).click();
    await client.page.getByText(/Moved to “Not selected”/).waitFor();
    await client.page.waitForTimeout(500);
    return await client.page.locator("article.pj-item", { hasText: second }).count() === 0;
  }, { severity: "blocker" });
  await step("U10.4", "under \"Closed\" the client sees the outcome and reason but no longer the name, note or profile", async () => {
    await client.page.locator("label", { hasText: "Show" }).locator("select").selectOption("closed");
    const closed = client.page.locator("article.pj-item", { hasText: "Not selected" }).first();
    await closed.waitFor();
    const t = await closed.innerText();
    await client.shot("20-client-closed");
    return /experience level/.test(t) && !t.includes(second) && await closed.getByRole("button", { name: "Profile" }).count() === 0;
  }, { severity: "high" });
  await step("U10.5", "the recruiter sees \"Not selected\" with the client's reason", async () => {
    await recruiter.go("/platform/recruiting");
    await jobCard().getByRole("button", { name: "Open" }).click();
    const r = jobCard().locator(".pj-note", { hasText: second }).first();
    await r.getByText("Not selected").waitFor();
    return /experience level/.test(await r.innerText());
  }, { severity: "high" });
}

// ------------------------------------------------------------------ 11. team, sign-out, privacy, general registration
section("11. Team member, privacy request, general CV registration, sign-out");
await step("U11.1", "the client owner adds a colleague, who sets a password, signs in and sees the same pipeline", async () => {
  await client.go("/company");
  await client.page.getByRole("button", { name: "Team", exact: true }).click();
  const f = client.page.locator("form", { has: client.page.locator("[name=email]") });
  await fill(f, { name: "Anil HR", email: mail("anil.hr") });
  await f.getByRole("button", { name: "Add and get link" }).click();
  const link = await client.page.locator("input[readonly]").inputValue();
  const mate = await person("client team member");
  await mate.go(link);
  await fill(mate.page.locator("form"), { password: PASSWORD, confirm: PASSWORD });
  await mate.page.getByRole("button", { name: "Set password" }).click();
  await mate.page.getByRole("link", { name: "Sign in" }).click();
  await fill(mate.page.locator("form"), { email: mail("anil.hr"), password: PASSWORD });
  await mate.page.getByRole("button", { name: "Sign in" }).click();
  await mate.page.waitForURL(/\/company/);
  await mate.page.getByRole("button", { name: "Pipeline", exact: true }).click();
  await mate.page.locator("label", { hasText: "Show" }).locator("select").selectOption("all");
  await mate.page.getByText(CAND.name).first().waitFor();
  await mate.page.getByRole("button", { name: "Team", exact: true }).click();
  await mate.page.getByRole("heading", { name: "Team" }).waitFor();
  const canInvite = await mate.page.getByRole("button", { name: "Add and get link" }).count();
  await mate.ctx.close();
  return canInvite === 0;
}, { severity: "high" });
await step("U11.2", "a visitor sends a privacy request from the privacy page and the owner sees it", async () => {
  await visitor.go("/privacy");
  const f = visitor.page.locator("form", { has: visitor.page.locator("[name=requestType]") });
  await fill(f, { requestType: "correction", requesterName: APPLICANT.name, email: APPLICANT.email, details: "My phone number has changed." });
  await f.getByRole("button", { name: "Send privacy request" }).click();
  await f.getByText(/request has been received/i).waitFor();
  await owner.go("/admin");
  await owner.page.getByRole("button", { name: /^Privacy requests/ }).click();
  await owner.page.locator("article", { hasText: APPLICANT.name }).first().waitFor();
  return count("privacy_requests", "email = ? AND request_type = 'correction'", APPLICANT.email) === 1;
}, { severity: "high" });
await step("U11.3", "a visitor registers a general CV from \"Upload your CV\" and gets a reference", async () => {
  await visitor.go("/job-seekers");
  await visitor.page.getByRole("button", { name: /Upload your CV/ }).first().click();
  const d = visitor.page.locator("[role=dialog]");
  const g = { name: `Ishita Paul${U.replace(/\d/g, "")}`.slice(0, 40), email: mail("ishita") };
  await fill(d, { fullName: g.name, email: g.email, phone: "+91 90000 58001", location: "Kolkata", desiredRole: "Accounts Executive", skills: "Tally, GST", experience: "Two years of accounts work.", consent: true, adult: true, terms: true, futureConsent: true });
  await d.locator("[name=resume]").setInputFiles(await cvFor(g.name, g.email, "+91 90000 58001"));
  await d.getByRole("button", { name: "Submit my details" }).click();
  await d.locator(".form-message").filter({ hasText: /Reference: JP-/ }).waitFor({ timeout: 30_000 });
  return count("applications", "email = ? AND job_id IS NULL", g.email) === 1;
}, { severity: "high" });
await step("U11.4", "signing out of the client workspace ends the session", async () => {
  await client.go("/company");
  await client.page.getByRole("button", { name: "Sign out" }).click();
  await client.page.waitForURL(/\/portal\/sign-in/);
  await client.go("/company");
  return /\/portal\/sign-in/.test(client.page.url());
}, { severity: "high" });
await step("U11.5", "signing out of the Working Platform ends the session", async () => {
  await recruiter.go("/platform");
  await recruiter.page.getByRole("button", { name: "Sign out" }).click();
  await recruiter.page.waitForURL(/\/platform\/sign-in/);
  await recruiter.go("/platform/recruiting");
  return /\/platform\/sign-in/.test(recruiter.page.url());
}, { severity: "high" });
await step("U11.6", "a wrong password is refused with a clear message, on both sign-in pages", async () => {
  await client.go("/portal/sign-in");
  await fill(client.page.locator("form"), { email: CLIENT.email, password: "definitely the wrong one" });
  await client.page.getByRole("button", { name: "Sign in" }).click();
  await client.page.waitForTimeout(900);
  const a = await client.text();
  await recruiter.go("/platform/sign-in");
  await fill(recruiter.page.locator("form"), { email: state.recruiter, password: "definitely the wrong one" });
  await recruiter.page.getByRole("button", { name: /sign in/i }).click();
  await recruiter.page.waitForTimeout(900);
  const b = await recruiter.text();
  return /incorrect|not correct|wrong|invalid/i.test(a) && /incorrect|not correct|wrong|invalid/i.test(b) && /sign-in/.test(client.page.url()) && /sign-in/.test(recruiter.page.url());
}, { severity: "medium" });
await step("U11.7", "\"Forgot password\" on the portal gives a working reset link and the new password signs in", async () => {
  await client.go("/portal/forgot");
  await fill(client.page.locator("form"), { email: CLIENT.email });
  await client.page.getByRole("button", { name: "Send reset link" }).click();
  await client.page.getByRole("link", { name: /reset link/ }).click();
  const NEW = "copper meadow sunrise 72";
  await fill(client.page.locator("form"), { password: NEW, confirm: NEW });
  await client.page.getByRole("button", { name: "Change password" }).click();
  await client.page.getByRole("link", { name: "Sign in" }).click();
  await fill(client.page.locator("form"), { email: CLIENT.email, password: NEW });
  await client.page.getByRole("button", { name: "Sign in" }).click();
  await client.page.waitForURL(/\/company/);
  return true;
}, { severity: "high" });
{
  for (const [path, label] of [["/portal/register", "Create account"], ["/portal/forgot", "Forgot password"]]) {
    await visitor.go(path);
    const links = await visitor.page.locator("main a, form a, .pj-shell a").evaluateAll(as => as.map(a => a.getAttribute("href")));
    if (!links.some(h => /sign-in/.test(h ?? ""))) finding(`U11.8.${path}`, { severity: "low", kind: "gap", title: `The "${label}" page has no way back to sign-in`, actual: `${path} has no link to /portal/sign-in or to the website (links on the page: ${links.filter(Boolean).join(", ") || "none"}). The logo is not a link either. Someone who opened it by mistake must use the browser's back button.`, expected: "\"Already have an account? Sign in\" and a logo that links home.", fix: "Add the links in app/portal/forms.tsx and app/portal/auth-frame.tsx.", where: "app/portal/forms.tsx; app/portal/auth-frame.tsx" });
  }
}

// ------------------------------------------------------------------ Fast Track and a test, on screen
section("12. Fast Track and a technical test, on screen");
await step("U12.1", "the candidate asks to join Fast Track and is shown the amount and a payment reference", async () => {
  await candidate.go("/candidate");
  await candidate.page.getByRole("button", { name: "Join Fast Track" }).click();
  await candidate.page.getByText(/quote the reference/).first().waitFor();
  return count("orders", "candidate_id = ? AND status = 'awaiting_payment'", CAND.id) === 1;
}, { severity: "high" });
await step("U12.2", "the administrator confirms the payment in the Assessments tool", async () => {
  await staffAdmin.go("/platform/assessments");
  const line = staffAdmin.page.locator("tr", { hasText: CAND.name }).first();
  await line.waitFor();
  staffAdmin.page.__answer = "UPI ref UAT-1";
  await line.getByRole("button", { name: "Payment received" }).click();
  await staffAdmin.page.getByText(/Payment confirmed/).waitFor();
  staffAdmin.page.__answer = undefined;
  return !!row("SELECT fast_track_at FROM candidates WHERE id = ?", CAND.id)?.fast_track_at;
}, { severity: "high" });
await step("U12.3", "the candidate takes a technical test to the end and sees their level", async () => {
  await candidate.go("/candidate");
  await candidate.page.getByRole("button", { name: "Take the test" }).first().click();
  await candidate.page.getByRole("button", { name: "Start the test" }).click();
  for (let i = 0; i < 25; i++) {
    if (await candidate.page.getByText(/You have finished/).count()) break;
    await candidate.page.locator("input[type=radio]").first().check();
    await candidate.page.getByRole("button", { name: "Next" }).click();
    await candidate.page.waitForTimeout(250);
  }
  await candidate.page.getByText(/You have finished/).waitFor();
  await candidate.shot("22-candidate-test-finished");
  return /Your level on this test is/.test(await candidate.text());
}, { severity: "high" });
{
  // With the result on screen and nobody touching anything, the page should be quiet.
  let calls = 0; const seen = new Map();
  const onReq = q => { const u = new URL(q.url()); if (u.pathname.startsWith("/api/")) { calls++; seen.set(u.pathname, (seen.get(u.pathname) ?? 0) + 1); } };
  candidate.page.on("request", onReq);
  await candidate.page.waitForTimeout(5000);
  candidate.page.off("request", onReq);
  check("U12.4", "the finished-test screen is quiet (no requests while nobody is doing anything)", calls <= 4, { severity: "high", kind: "defect", title: "After a test finishes, the candidate's page calls the server in an endless loop", actual: `With "You have finished" on screen and nothing being pressed, the page sent ${calls} requests in 5 seconds (${[...seen].map(([k, v]) => `${v} × ${k}`).join(", ")}), and keeps going until the candidate presses "Back to my tests" or closes the tab. Every candidate who finishes a test in the portal does this; neither address is rate limited.`, expected: "The result is loaded once.", fix: "In app/candidate/candidate-app.tsx the `call` function depends on `v`, and finishing a test reloads `v`, which re-creates `call`, which makes components/test-runner.tsx load again and report \"done\" again. Keep `v` in a ref inside `call` (or make TestRunner call onDone once).", where: "app/candidate/candidate-app.tsx Tests; components/test-runner.tsx" });
  await candidate.page.getByRole("button", { name: "Back to my tests" }).click().catch(() => {});
}

// ------------------------------------------------------------------ 13. deleting an account
section("13. The candidate's \"Delete my account\"");
await step("U13.1", "typing the wrong word does not delete the account, and the candidate stays signed in on their page", async () => {
  await candidate.go("/candidate");
  await candidate.page.getByRole("button", { name: "Delete my account" }).waitFor();
  candidate.page.__answer = "delete please";
  await candidate.page.getByRole("button", { name: "Delete my account" }).click();
  await candidate.page.waitForTimeout(1800);
  const stillThere = row("SELECT status FROM candidates WHERE id = ?", CAND.id)?.status === "active";
  const url = candidate.page.url();
  await candidate.shot("21-candidate-delete-wrong-word");
  if (stillThere && /\/portal\/sign-in/.test(url)) throw new Error("WRONG_WORD_REDIRECT");
  return stillThere;
}, { severity: "high", kind: "defect", title: "\"Delete my account\" sends the candidate to the sign-in page even when nothing was deleted", actual: "The candidate clicked \"Delete my account\" and typed something other than DELETE. The server correctly refused (\"Type DELETE to confirm\"), but the page went to the sign-in screen anyway, exactly as it does after a real deletion. The candidate reasonably believes the account and CV are gone; they are not, and the CV stays shared with employers.", expected: "On a refusal the page stays where it is and shows the message; it leaves only after a successful deletion.", fix: "In app/candidate/candidate-app.tsx make `act` return whether it succeeded and redirect only then.", where: "app/candidate/candidate-app.tsx Privacy" });
candidate.page.__answer = undefined;

// ------------------------------------------------------------------ wrap up
const trouble = [visitor, owner, client, staffAdmin, candidate, recruiter].flatMap(p => p.trouble.map(t => `${p.who}: ${t}`));
check("U14.1", "no server error or script error happened on any screen during the whole story", trouble.length === 0, { severity: "high", title: "Server or script errors occurred during the end-to-end story", detail: [...new Set(trouble)].slice(0, 10).join("; ") });
note(`story: client "${CLIENT.name}", job "${JOB}", candidate "${CAND.name}"${submittedName ? " (hired)" : ""}, second candidate "${second}" (not selected)`);
const result = R.save({ story: { client: CLIENT.name, job: JOB, candidate: CAND.name, second, enquiryRef, applyRef } });
await browser.close();
process.exit(result.failed ? 1 : 0);
