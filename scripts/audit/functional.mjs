// Functional auditor.
//
// Makes every kind of entry the product accepts, then checks three things for
// each one: (1) the server accepted it, (2) the row is really in the database
// with the values sent, and (3) the people who need it can read it back, and
// the people who must not cannot.
//
// It walks the whole hiring workflow: enquiry -> client -> job -> approval ->
// candidates (website form and portal) -> recruiter shortlist -> submission ->
// client review -> interviews -> offer -> commitment -> joining -> placement,
// and every way out of it: not selected, withdrawn, offer declined, did not
// join, left inside the guarantee, consent withdrawn, account deleted.
//
//   node scripts/audit/functional.mjs          (dev server running, local DB migrated)
//
// It is written to start from an empty local database (run.mjs resets it).
import { BASE, PASSWORD, chromium, client, clearRateLimits, context, count, ownerSession, pdfFile, pdfFromText, portalSession, recorder, row, rows, saveState, serverUp, staffSession, stamp, tables, until } from "./lib.mjs";
import { COMPANIES, CVS, JDS } from "../portal-seed-data.mjs";

const R = recorder("functional");
const { check, step, finding, section, note } = R;
if (!await serverUp()) { console.error(`The dev server is not answering at ${BASE}. Start it with npm run dev.`); process.exit(2); }

const S = stamp();
const browser = await chromium.launch();
const fresh = async () => client(await context(browser));
// A visitor who never signs in. Anything that would sign the caller in uses a throwaway context instead.
const anon = await fresh();
const mail = name => `${name}.${S}@example.test`;
const cvText = key => CVS.find(c => c.key === key)?.text ?? (() => { throw new Error(`No seed CV ${key}`); })();
const today = new Date().toISOString().slice(0, 10);
const inDays = n => new Date(Date.now() + n * 86_400_000).toISOString();

clearRateLimits();

// ------------------------------------------------------------------ 0. schema
section("0. Database and schema");
{
  const t = tables();
  check("F0.1", "the local database has the migrated tables", t.length > 30, { severity: "blocker", detail: `${t.length} tables` });
  for (const name of ["applications", "employer_enquiries", "privacy_requests", "jobs", "jds", "candidates", "cvs", "companies", "pipeline", "pipeline_events", "interviews", "placements", "messages", "audit_events", "candidate_commitments"])
    check(`F0.2.${name}`, `table ${name} exists`, t.includes(name), { severity: "blocker", title: `Table ${name} is missing from the migrated schema` });
}

// ------------------------------------------------------------------ 1. staff set-up
section("1. Owner and staff set-up");
const owner = await ownerSession(browser);
const ADMIN = { email: mail("asha.admin"), name: "Asha Admin" };
await step("F1.1", "the site owner creates the first Working Platform administrator", async () => {
  const existing = count("platform_users", "role='admin' AND status='active'");
  if (existing) { const a = row("SELECT email FROM platform_users WHERE role='admin' AND status='active' ORDER BY created_at LIMIT 1"); throw new Error(`an administrator already exists (${a.email}); run with a reset database`); }
  const r = await owner.post("/api/platform/owner", { action: "create-admin", name: ADMIN.name, email: ADMIN.email, password: PASSWORD });
  if (!r.ok) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
}, { severity: "blocker" });
check("F1.2", "the administrator is stored with a hashed password", (() => { const u = row("SELECT role, status, password_hash FROM platform_users WHERE email = ?", ADMIN.email); return u?.role === "admin" && u.status === "active" && u.password_hash && !String(u.password_hash).includes(PASSWORD); })(), { severity: "blocker" });
const admin = await staffSession(browser, ADMIN.email);

async function inviteStaff(name, access) {
  const email = mail(name.toLowerCase().replace(/\s+/g, "."));
  const r = await admin.post("/api/platform/admin/users", { email, name, access });
  if (!r.body?.link) throw new Error(`invite ${name}: ${r.status} ${r.text.slice(0, 200)}`);
  const accept = await (await fresh()).post("/api/platform/auth/accept", { token: new URL(r.body.link).searchParams.get("token"), name, password: PASSWORD });
  if (!accept.ok) throw new Error(`accept ${name}: ${accept.status} ${accept.text.slice(0, 200)}`);
  return { id: r.body.id, email, name };
}
let recruiterU, outsiderU, viewerU, teamId, otherTeamId;
await step("F1.3", "the administrator invites two recruiters and a view-only member, who accept their one-time links", async () => {
  recruiterU = await inviteStaff("Noor Recruiter", { recruiting: "edit" });
  outsiderU = await inviteStaff("Rina Outsider", { recruiting: "edit" });
  viewerU = await inviteStaff("Vik Viewer", { recruiting: "view" });
}, { severity: "blocker" });
await step("F1.4", "the administrator creates two teams and adds a recruiter to each", async () => {
  const mk = async name => (await admin.post("/api/platform/admin/operations", { action: "team.create", name })).body?.id;
  teamId = await mk(`Kolkata desk ${S}`); otherTeamId = await mk(`Franchise East ${S}`);
  if (!teamId || !otherTeamId) throw new Error("team.create returned no id");
  for (const [t, u] of [[teamId, recruiterU.id], [teamId, viewerU.id], [otherTeamId, outsiderU.id]]) { const r = await admin.post("/api/platform/admin/operations", { action: "team.assign", id: t, userId: u }); if (!r.ok) throw new Error(`team.assign ${r.status} ${r.text.slice(0, 120)}`); }
  return count("platform_team_members", "team_id IN (?, ?)", teamId, otherTeamId) === 3;
}, { severity: "high" });
const recruiter = await staffSession(browser, recruiterU.email), outsider = await staffSession(browser, outsiderU.email), viewer = await staffSession(browser, viewerU.email);

// ------------------------------------------------------------------ 2. employer enquiry
section("2. Employer enquiry (public form) -> owner console");
const ENQ = { contactName: "Meera Banerjee", company: `Demo Ferro Alloys ${S}`, email: mail("meera.owner"), phone: "+91 90000 20001", details: "We need two accounts executives with Tally and GST experience for our Durgapur works office.", consent: "yes", terms: "yes", whatsappConsent: "yes" };
let enquiryId;
let callSlot;
await step("F2.1", "an employer sends a short enquiry (no job description) and asks for a call at a free time", async () => {
  const slots = (await anon.get("/api/employer-enquiries")).body?.slots ?? [];
  callSlot = slots[3];
  if (!callSlot) throw new Error("no call times are offered");
  const day = new Date(Date.parse(callSlot) + 5.5 * 3_600_000).getUTCDay(), hour = new Date(Date.parse(callSlot) + 5.5 * 3_600_000).getUTCHours();
  if (day === 0 || hour < 10 || hour >= 18) throw new Error(`a call time outside Monday to Saturday, 10:00 to 18:00 India time was offered: ${callSlot}`);
  const r = await anon.post("/api/employer-enquiries", { ...ENQ, meetingAt: callSlot, source: "LinkedIn", medium: "social", campaign: "Durgapur-Accounts", referrer: "www.linkedin.com", landing: "/employers" });
  if (r.status !== 201 || !/^HE-/.test(r.body?.reference ?? "")) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
}, { severity: "blocker" });
{
  const e = row("SELECT * FROM employer_enquiries WHERE email = ?", ENQ.email);
  enquiryId = e?.id;
  check("F2.2", "the enquiry row holds every field that was typed", !!e && e.contact_name === ENQ.contactName && e.company === ENQ.company && e.phone === ENQ.phone && e.details === ENQ.details && e.status === "new" && !!e.terms_version && Number(e.whatsapp_consent) === 1 && e.meeting_at === callSlot && e.meeting_status === "requested", { severity: "blocker", detail: JSON.stringify(e ?? null).slice(0, 300) });
  const list = await owner.get("/api/admin/records");
  const seen = list.body?.enquiries?.find(q => q.id === enquiryId);
  check("F2.2a", "where the enquiry came from (campaign tags, referring site, first page) is stored with it", e?.source === "linkedin" && e.medium === "social" && e.campaign === "durgapur-accounts" && e.referrer === "www.linkedin.com" && e.landing === "/employers", { severity: "medium", detail: JSON.stringify({ source: e?.source, medium: e?.medium, campaign: e?.campaign, referrer: e?.referrer, landing: e?.landing }) });
  check("F2.3", "the owner console lists the enquiry with the same details", !!seen && seen.company === ENQ.company && seen.details === ENQ.details && seen.meetingAt === callSlot && seen.whatsappConsent === true, { severity: "high" });
  check("F2.4", "an anonymous visitor cannot read enquiries", (await anon.get("/api/admin/records")).status === 401, { severity: "blocker", title: "Enquiry and candidate records are readable without signing in" });
  const bad = await anon.post("/api/employer-enquiries", { ...ENQ, email: "not-an-email" });
  check("F2.5", "an enquiry with an invalid email is refused with a message", bad.status === 400 && !!bad.body?.error, { severity: "medium" });
  const noTick = await anon.post("/api/employer-enquiries", { ...ENQ, email: mail("x"), consent: undefined });
  const noTerms = await anon.post("/api/employer-enquiries", { ...ENQ, email: mail("x2"), terms: undefined });
  check("F2.6", "an enquiry without either required tick (contact consent, terms for employers) is refused", noTick.status === 400 && noTerms.status === 400, { severity: "medium", detail: `${noTick.status}/${noTerms.status}` });
  const badPhone = await anon.post("/api/employer-enquiries", { ...ENQ, email: mail("x3"), phone: "abc" });
  check("F2.6e", "a phone number that is not a phone number is refused", badPhone.status === 400, { severity: "medium", detail: `status ${badPhone.status}` });
  const again = (await anon.get("/api/employer-enquiries")).body?.slots ?? [];
  const clash = await anon.post("/api/employer-enquiries", { ...ENQ, email: mail("clash"), meetingAt: callSlot });
  check("F2.6a", "a call time that has been asked for is no longer offered, and cannot be booked twice", !again.includes(callSlot) && clash.status === 409 && count("employer_enquiries", "meeting_at = ?", callSlot) === 1, { severity: "high", detail: `still offered: ${again.includes(callSlot)}, second booking -> ${clash.status}` });
  const noWa = await anon.post("/api/employer-enquiries", { ...ENQ, email: mail("nowa"), company: `No WhatsApp ${S}`, whatsappConsent: undefined });
  const nw = row("SELECT whatsapp_consent, ack_whatsapp, ack_email, meeting_status FROM employer_enquiries WHERE email = ?", mail("nowa"));
  check("F2.6b", "without the WhatsApp tick no WhatsApp message is queued, and an enquiry without a call is stored as such", noWa.status === 201 && Number(nw?.whatsapp_consent) === 0 && nw.ack_whatsapp === "no_consent" && nw.meeting_status === "none", { severity: "high", detail: JSON.stringify(nw ?? null) });
  check("F2.6c", "the acknowledgement email's outcome is recorded on the enquiry (sent, or not sent because email is not set up)", ["sent", "not_configured"].includes(e?.ack_email) || ["sent", "not_configured"].includes(row("SELECT ack_email FROM employer_enquiries WHERE id = ?", enquiryId)?.ack_email), { severity: "medium", detail: `ack_email = ${row("SELECT ack_email FROM employer_enquiries WHERE id = ?", enquiryId)?.ack_email}` });
  const confirm = await owner.patch(`/api/admin/records/enquiries/${enquiryId}`, { meetingStatus: "confirmed" });
  check("F2.6d", "the owner confirms the call and it is stored", confirm.ok && row("SELECT meeting_status FROM employer_enquiries WHERE id = ?", enquiryId)?.meeting_status === "confirmed", { severity: "medium", detail: `status ${confirm.status}` });
  const st = await owner.patch(`/api/admin/records/enquiries/${enquiryId}`, { status: "contacted" });
  check("F2.7", "the owner moves the enquiry to 'contacted' and it is stored", st.ok && row("SELECT status FROM employer_enquiries WHERE id = ?", enquiryId)?.status === "contacted", { severity: "medium" });
}

// ------------------------------------------------------------------ 3. client onboarding
section("3. Enquiry -> client account -> client signs in");
const seedCo = COMPANIES.find(c => c.key === "demo-ferro"), seedOther = COMPANIES.find(c => c.key !== "demo-ferro");
let companyId, otherCompanyId, clientOwner, otherClient;
async function inviteClient(seed, ownerEmail, ownerName, extra = {}) {
  const r = await owner.post("/api/admin/portal/client-invite", { displayName: `${seed.displayName} ${S}`, legalName: `${seed.legalName} ${S}`, city: seed.city, ownerEmail, ownerName, guaranteeDays: 60, nonSolicitMonths: 12, feePercent: 8.33, feeTerms: "Payable within 30 days of joining", params: seed.params, ...extra });
  if (!r.body?.link) throw new Error(`client-invite ${r.status} ${r.text.slice(0, 300)}`);
  const accept = await anon.post("/api/portal/auth/accept", { token: new URL(r.body.link).searchParams.get("token"), password: PASSWORD });
  if (!accept.ok) throw new Error(`client accept ${accept.status} ${accept.text.slice(0, 200)}`);
  return row("SELECT cu.company_id AS id FROM company_users cu JOIN portal_accounts a ON a.id = cu.account_id WHERE a.email = ?", ownerEmail)?.id;
}
await step("F3.1", "the owner turns the enquiry into a client and the client owner sets a password from the one-time link", async () => {
  companyId = await inviteClient(seedCo, ENQ.email, ENQ.contactName, { enquiryId });
  return !!companyId;
}, { severity: "blocker" });
{
  const co = row("SELECT * FROM companies WHERE id = ?", companyId ?? "");
  check("F3.2", "the client is stored active with its fee, guarantee and non-solicitation terms", co?.status === "active" && Number(co.fee_percent) === 8.33 && Number(co.guarantee_days) === 60 && Number(co.non_solicit_months) === 12, { severity: "high", detail: JSON.stringify(co ?? null).slice(0, 300) });
  check("F3.3", "the enquiry remembers the client it became", row("SELECT company_id FROM employer_enquiries WHERE id = ?", enquiryId ?? "")?.company_id === companyId, { severity: "medium" });
  await step("F3.4", "a second client is set up (to prove one client cannot see another's data)", async () => { otherCompanyId = await inviteClient(seedOther, mail("other.owner"), "Other Owner"); return !!otherCompanyId; }, { severity: "high" });
  await step("F3.5", "the client owner signs in and lands on the hiring dashboard", async () => {
    clientOwner = await portalSession(browser, ENQ.email); otherClient = await portalSession(browser, mail("other.owner"));
    const d = await clientOwner.get("/api/portal/company/dashboard");
    return clientOwner.next === "/company" && d.ok && d.body.company.status === "active" && d.body.terms.feePercent === 8.33;
  }, { severity: "blocker" });
  const reuse = await owner.post("/api/admin/portal/client-invite", { displayName: "Dup", legalName: "Dup Ltd", ownerEmail: ENQ.email, params: seedCo.params });
  check("F3.6", "inviting a second client with an email that already has an account is refused clearly", reuse.status === 409 && !!reuse.body?.error, { severity: "medium", detail: `${reuse.status} ${reuse.text.slice(0, 120)}` });
  check("F3.7", "after the refusal no half-made company is left behind", count("companies", "display_name = 'Dup'") === 0, { severity: "high", title: "A refused client invitation leaves an orphan company row" });
  await step("F3.8", "the administrator assigns each client to a recruiting team", async () => {
    const a = await admin.post("/api/platform/recruiting/assign-team", { companyId, teamId }), b = await admin.post("/api/platform/recruiting/assign-team", { companyId: otherCompanyId, teamId: otherTeamId });
    return a.ok && b.ok && row("SELECT team_id FROM companies WHERE id = ?", companyId).team_id === teamId;
  }, { severity: "high" });
}

// ------------------------------------------------------------------ 4. client posts a job
section("4. Client posts a job -> Jobboard300 approves -> it reaches the recruiter");
const seedJd = JDS.find(j => j.key === "jd-accounts-durgapur");
let jdId;
await step("F4.1", "the client creates a job draft from a job description", async () => {
  const r = await clientOwner.post("/api/portal/company/jd-create", { title: seedJd.title, text: seedJd.text, location: seedJd.location, workMode: seedJd.workMode, openings: 1 });
  jdId = r.body?.id; if (!jdId) throw new Error(`${r.status} ${r.text.slice(0, 300)}`);
}, { severity: "blocker" });
{
  const jd = row("SELECT * FROM jds WHERE id = ?", jdId ?? "");
  check("F4.2", "the draft is stored against the right client with the text and openings", jd?.company_id === companyId && jd.status === "draft" && jd.raw_text.includes("Tally") && Number(jd.openings) === 1, { severity: "high", detail: JSON.stringify({ status: jd?.status, openings: jd?.openings, service: jd?.service }) });
  const req = JSON.parse(jd?.requirements ?? "{}");
  check("F4.3", "requirements were read from the job description (must-have skills, years, city)", (req.mustHave?.length ?? 0) > 0 && (req.hard?.cities?.length ?? 0) > 0, { severity: "medium", detail: JSON.stringify({ mustHave: req.mustHave?.map(m => m.name), cities: req.hard?.cities, minYears: req.minYears }) });
  check("F4.4", "another client cannot open this job", (await otherClient.get(`/api/portal/company/jd?id=${jdId}`)).status === 404, { severity: "blocker", title: "A client can read another client's job" });
  const sub = await clientOwner.post("/api/portal/company/jd-submit", { jdId });
  check("F4.5", "the client submits the job for approval", sub.ok && row("SELECT status FROM jds WHERE id = ?", jdId)?.status === "pending", { severity: "blocker", detail: `${sub.status} ${sub.text.slice(0, 200)}` });
  const ov = await owner.get("/api/admin/portal/overview");
  check("F4.6", "the owner console lists the job as waiting for approval", !!ov.body?.pendingJds?.some(j => j.id === jdId), { severity: "high" });
  const early = await recruiter.get(`/api/platform/recruiting/candidates?jd=${jdId}`);
  note(`recruiter reading candidates for a pending job -> ${early.status}`);
  const ok = await owner.post("/api/admin/portal/jd-decide", { jdId, approve: true, note: "" });
  check("F4.7", "the owner approves the job and it goes live", ok.ok && row("SELECT status FROM jds WHERE id = ?", jdId)?.status === "live", { severity: "blocker", detail: `${ok.status} ${ok.text.slice(0, 200)}` });
  if (/released automatically/i.test(ok.body?.message ?? "")) finding("F4.7a", { severity: "low", kind: "stale-copy", title: "Approving a job still says CVs \"will be released automatically\"", actual: ok.body.message, expected: "Self-service release was removed on 10 Nov 2026; a recruiter submits each candidate.", fix: "Change the message in app/api/admin/portal/[action]/route.ts (case \"jd-decide\") to \"Job is live. It now appears in the Recruiting tool.\"", where: "app/api/admin/portal/[action]/route.ts" });
  const w = await recruiter.get("/api/platform/recruiting/work");
  check("F4.8", "the team's recruiter now sees the live job", !!w.body?.jobs?.some(j => j.id === jdId), { severity: "blocker" });
  check("F4.9", "a recruiter on another team does not see it", !(await outsider.get("/api/platform/recruiting/work")).body?.jobs?.some(j => j.id === jdId), { severity: "blocker", title: "A recruiter outside the client's team can see its job" });
  const dash = await clientOwner.get("/api/portal/company/dashboard");
  check("F4.10", "the client sees the job as live", dash.body?.jds?.find(j => j.id === jdId)?.status === "live", { severity: "high" });
  const told = (dash.body?.notices ?? []).some(n => /approved|live/i.test(`${n.title} ${n.body}`));
  if (!told) finding("F4.11", { severity: "medium", kind: "gap", title: "The client is not told when their job is approved or sent back", actual: "No update appears in the client's \"Updates from Jobboard300\" after the owner approves (or rejects) a job; the client must open Jobs to notice the status changed.", expected: "A notice such as \"Your job Accounts Executive is live\" (or \"needs changes: <note>\").", fix: "Call notifyCompany() from decideJd() in lib/portal/company.ts for both outcomes.", where: "lib/portal/company.ts decideJd" });
}

// ------------------------------------------------------------------ 5. candidates
section("5. Candidates: portal sign-up with CV, and the website application form");
const seedCvs = CVS.filter(c => c.format !== "scanned" && c.text && seedJd.relevance?.[c.key] >= 1).sort((a, b) => seedJd.relevance[b.key] - seedJd.relevance[a.key]).slice(0, 9);
note(`seed CVs graded good or excellent for this job: ${seedCvs.map(c => c.key).join(", ")}`);
// Two seed CVs carry the same name; give each person a distinct one so the screens can be told apart.
const seenNames = new Map();
const nameOf = cv => { const base = cv.text.split("\n")[0].trim(); if (!seenNames.has(cv.key)) seenNames.set(cv.key, [...seenNames.values()].some(n => n.toLowerCase() === base.toLowerCase()) ? `${base} Dey` : base); return seenNames.get(cv.key); };
const textOf = cv => cv.text.replace(cv.text.split("\n")[0], nameOf(cv));
const candidates = [];
async function portalCandidate(cv, i) {
  const name = nameOf(cv), email = mail(`cand${i}`);
  const reg = await anon.post("/api/portal/auth/register", { kind: "candidate", email, password: PASSWORD, name, phone: `+91 90000 3${String(1000 + i)}`, city: "Durgapur", adult: true, terms: true });
  if (reg.status !== 201 || !reg.body?.devLink) throw new Error(`register ${reg.status} ${reg.text.slice(0, 200)}`);
  const ver = await anon.post("/api/portal/auth/verify", { token: new URL(reg.body.devLink).searchParams.get("token") });
  if (!ver.ok) throw new Error(`verify ${ver.status} ${ver.text.slice(0, 200)}`);
  const session = await portalSession(browser, email);
  const up = await session.form("/api/portal/candidate/upload", { resume: pdfFile(`${cv.key}.pdf`, await pdfFromText(browser, textOf(cv))), consentProfile: "yes", consentShare: "yes" });
  if (up.status !== 201) throw new Error(`upload ${up.status} ${up.text.slice(0, 200)}`);
  const id = row("SELECT k.id FROM candidates k JOIN portal_accounts a ON a.id = k.account_id WHERE a.email = ?", email)?.id;
  return { id, name, email, session, key: cv.key, via: "portal", parse: up.body.status };
}
await step("F5.1", `${Math.min(6, seedCvs.length)} candidates register on the portal, verify their email and upload a CV`, async () => {
  for (const [i, cv] of seedCvs.slice(0, 6).entries()) candidates.push(await portalCandidate(cv, i));
  return candidates.length >= 3;
}, { severity: "blocker" });
{
  const c = candidates[0];
  if (c) {
    const k = row("SELECT * FROM candidates WHERE id = ?", c.id);
    check("F5.2", "the candidate record holds the name, email and phone given at sign-up", k?.display_name === c.name && k.email === c.email && !!k.phone && k.status === "active", { severity: "high", detail: JSON.stringify({ name: k?.display_name, email: k?.email, phone: k?.phone, status: k?.status }) });
    const cv = row("SELECT * FROM cvs WHERE candidate_id = ? AND is_primary = 1", c.id);
    check("F5.3", "the CV file is recorded with a private storage key and was read into a profile", !!cv?.r2_key && count("cv_profiles", "cv_id = ?", cv.id) >= 1, { severity: "blocker", detail: JSON.stringify({ status: cv?.status, file: cv?.file_name }) });
    const consents = rows("SELECT purpose, action FROM candidate_consents WHERE candidate_id = ?", c.id).map(r => `${r.purpose}:${r.action}`);
    check("F5.4", "each consent ticked at upload is in the consent ledger", consents.includes("profile_processing:granted") && consents.includes("share_with_companies:granted"), { severity: "high", detail: consents.join(", ") });
    const p = await c.session.get("/api/portal/candidate/profile");
    check("F5.5", "the candidate reads back the profile parsed from their own CV", p.ok && p.body.status === "parsed" && (p.body.profile?.skills?.length ?? 0) > 0 && p.body.sharing === true, { severity: "high", detail: `status ${p.body?.status}, ${p.body?.profile?.skills?.length} skills` });
    const other = candidates[1];
    if (other) {
      const exp = await other.session.get("/api/portal/candidate/export");
      check("F5.6", "one candidate's data export contains nothing of another candidate", exp.ok && !exp.text.includes(c.email) && !exp.text.includes(c.name), { severity: "blocker", title: "A candidate's export leaks another candidate's data" });
    }
    const inbox = await c.session.get("/api/portal/candidate/inbox");
    check("F5.7", "the candidate's inbox confirms the CV was received", (inbox.body?.messages ?? []).some(m => /cv/i.test(m.title)), { severity: "medium", detail: (inbox.body?.messages ?? []).map(m => m.title).join(" | ") });
    check("F5.8", "a client user cannot use the candidate area's API", (await clientOwner.get("/api/portal/candidate/profile")).status === 403, { severity: "blocker" });
  }
}

// The website form: a role-specific application and a general registration.
let roleId, webApp, webGeneral;
await step("F5.9", "the owner posts and publishes a public role for the same client", async () => {
  // Only an authorised vacancy of a client with a signed mandate is published (pilot rule).
  const unmandated = await owner.post("/api/admin/jobs", { title: "Unauthorised role", company: "Confidential client", companyId, location: "Durgapur", employmentType: "Full-time", workMode: "On-site", sector: "Accounts", description: "A role nobody at the employer has authorised yet; it must not be published on the website.", status: "published" });
  check("F5.9a", "a role for a client without a signed mandate is saved as a draft, not published", unmandated.status === 201 && /not published/i.test(unmandated.body?.message ?? "") && !(await anon.get("/api/jobs")).body?.jobs?.some(j => j.id === unmandated.body?.id), { severity: "high", detail: unmandated.body?.message ?? unmandated.text.slice(0, 120) });
  const mandate = await owner.post("/api/admin/portal/mandate", { companyId, signedOn: new Date().toISOString().slice(0, 10), reference: "mandate-audit.pdf" });
  check("F5.9b", "the owner records the client's signed mandate", mandate.ok && !!row("SELECT mandate_signed_on FROM companies WHERE id = ?", companyId)?.mandate_signed_on, { severity: "high", detail: `${mandate.status}` });
  const r = await owner.post("/api/admin/jobs", { authorisedBy: "Ritu Sen, HR manager (audit)", authorisedOn: new Date().toISOString().slice(0, 10), title: "Junior Accountant", company: "Confidential client", companyId, location: "Durgapur", employmentType: "Full-time", workMode: "On-site", sector: "Accounts", description: "Junior Accountant for a Durgapur manufacturing client. Day-to-day accounting in Tally Prime, GST returns, TDS and bank reconciliation.", requirements: "B.Com graduate with 1-4 years of experience. Must have Tally and GST. Good knowledge of MS Excel.", status: "published" });
  roleId = r.body?.id; if (!roleId) throw new Error(`${r.status} ${r.text.slice(0, 300)}`);
}, { severity: "blocker" });
{
  const pub = await anon.get("/api/jobs");
  check("F5.10", "the published role appears in the public job search", !!pub.body?.jobs?.some(j => j.id === roleId), { severity: "blocker" });
  const page = await anon.get(`/jobs/${roleId}`);
  check("F5.11", "the role's public page loads", page.status === 200 && page.text.includes("Junior Accountant"), { severity: "blocker", detail: `status ${page.status}` });
  const vac = row("SELECT status, company_id FROM jds WHERE id = ?", roleId ?? "");
  check("F5.12", "the public role is one vacancy record: a live client job with the same id", vac?.company_id === companyId && vac.status === "live", { severity: "high", detail: JSON.stringify(vac ?? null) });
  check("F5.13", "the recruiter sees the public role in the Recruiting tool", !!(await recruiter.get("/api/platform/recruiting/work")).body?.jobs?.some(j => j.id === roleId), { severity: "high" });
}
async function websiteApply(cv, fields) {
  const name = nameOf(cv);
  const base = { fullName: name, email: fields.email, phone: "+91 90000 41001", declaration: "yes", consent: "yes", whatsappConsent: "yes", source: "naukri", campaign: "nov-accounts", resume: pdfFile(`${cv.key}.pdf`, await pdfFromText(browser, textOf(cv))) };
  const r = await anon.form("/api/applications", { ...base, ...fields });
  return { r, name, email: fields.email };
}
await step("F5.14", "a visitor applies to the public role with a CV and ticks 'share my CV for this role'", async () => {
  const out = await websiteApply(seedCvs[6] ?? seedCvs[0], { email: mail("web.applicant"), jobId: roleId, shareConsent: "yes" });
  if (out.r.status !== 201 || !/^JP-/.test(out.r.body?.reference ?? "")) throw new Error(`${out.r.status} ${out.r.text.slice(0, 300)}`);
  webApp = out;
}, { severity: "blocker" });
if (webApp) {
  const a = row("SELECT * FROM applications WHERE email = ?", webApp.email);
  webApp.appId = a?.id;
  check("F5.15", "the application row holds what was typed, the consents and the terms version", !!a && a.full_name === webApp.name && a.job_id === roleId && a.phone === "+91 90000 41001" && Number(a.whatsapp_consent) === 1 && Number(a.share_consent) === 1 && Number(a.consent) === 1 && !!a.terms_version && !!a.resume_key, { severity: "blocker", detail: JSON.stringify({ job: a?.job_id, share: a?.share_consent, terms: a?.terms_version, resume: !!a?.resume_key }) });
  check("F5.15c", "where the applicant came from is stored with the application", a?.source === "naukri" && a.campaign === "nov-accounts", { severity: "medium", detail: JSON.stringify({ source: a?.source, campaign: a?.campaign }) });
  check("F5.15a", "the short form (name, email, phone, CV, one agreement tick) is accepted, and the city is read from the CV", webApp.r.status === 201 && !!webApp.r.body?.title && (row("SELECT k.current_city FROM candidates k JOIN candidate_sources s ON s.candidate_id = k.id WHERE s.ref_id = ?", a?.id ?? "")?.current_city ?? "") !== "", { severity: "high", detail: JSON.stringify({ title: webApp.r.body?.title, city: row("SELECT k.current_city FROM candidates k JOIN candidate_sources s ON s.candidate_id = k.id WHERE s.ref_id = ?", a?.id ?? "")?.current_city }) });
  const acks = rows("SELECT m.channel, m.status FROM messages m JOIN candidate_sources s ON s.candidate_id = m.recipient_id WHERE s.ref_id = ? AND m.kind = 'application.received'", a?.id ?? "").map(m => `${m.channel}:${m.status}`);
  check("F5.15b", "the acknowledgement is recorded: an email, and a WhatsApp message because the box was ticked", acks.some(x => x.startsWith("email:")) && acks.some(x => x.startsWith("whatsapp:")) && !!row("SELECT k.whatsapp_consent_at FROM candidates k JOIN candidate_sources s ON s.candidate_id = k.id WHERE s.ref_id = ?", a?.id ?? "")?.whatsapp_consent_at, { severity: "high", detail: acks.join(", ") });
  const cv = await owner.get(`/api/admin/resumes/${a?.id}`);
  check("F5.16", "the owner downloads the same CV file that was uploaded", cv.status === 200 && cv.text.startsWith("%PDF-"), { severity: "blocker", detail: `status ${cv.status}` });
  check("F5.17", "nobody else can download it", (await anon.get(`/api/admin/resumes/${a?.id}`)).status === 401 && (await recruiter.get(`/api/admin/resumes/${a?.id}`)).status === 401, { severity: "blocker", title: "A website applicant's CV can be downloaded without owner sign-in" });
  const src = row("SELECT candidate_id FROM candidate_sources WHERE kind = 'website_application' AND ref_id = ?", a?.id ?? "");
  webApp.id = src?.candidate_id;
  check("F5.18", "the applicant joined the shared candidate list (one person record)", !!src?.candidate_id && row("SELECT status FROM candidates WHERE id = ?", src.candidate_id)?.status === "active", { severity: "high", title: "A website application is not linked into the candidate list, so recruiters never see the applicant" });
  const rec = (await owner.get("/api/admin/records")).body?.applications?.find(x => x.id === a?.id);
  check("F5.19", "the owner console's candidate pipeline shows the application, its role and that it is in the candidate list", !!rec && rec.roleTitle === "Junior Accountant" && rec.hasResume === true && rec.inCandidateList === true, { severity: "high", detail: JSON.stringify(rec ? { role: rec.roleTitle, hasResume: rec.hasResume, inList: rec.inCandidateList } : null) });
  const listed = async () => ((await admin.get(`/api/platform/recruiting/candidates?jd=${roleId}`)).body?.candidates ?? []);
  const shortlist = await until(async () => (await listed()).some(c => c.candidate_id === webApp.id), 5000);
  const before = (await listed()).length, waiting = count("score_queue");
  // Characterise the failure: does the owner console's "Run queue" button bring them in?
  const run = shortlist ? null : await owner.post("/api/admin/portal/run-queue", {});
  const after = await listed();
  check("F5.20", "the applicant appears in the Recruiting tool's shortlist for the role they applied to, without anyone pressing a button", !!shortlist, { severity: "blocker", title: "Website applicants and newly published roles do not reach the recruiter until the owner presses \"Run scoring now\"",
    actual: `After a visitor applied to the published role, the Recruiting tool showed ${before} candidate(s) for it ("No more candidates for this job right now") while ${waiting} scoring job(s) sat in the queue. The application form and the owner's "Post a verified role" form only add work to the scoring queue; nothing runs it. It ran only when the owner opened Owner console → Job portal → "Run scoring now" (${run?.status}), after which the role listed ${after.length} candidate(s)${after.some(c => c.candidate_id === webApp.id) ? ", including the applicant" : ", still without the applicant"}. A portal candidate's CV upload also drains the queue, so on a quiet day applicants can wait indefinitely.`,
    expected: "An application to a role is visible to that role's recruiter within seconds, and a newly published role lists its matching candidates at once.",
    fix: "Call drainQueue(db, portalSecret(), 300) at the end of POST /api/applications (after linkWebsiteApplication), in POST/PATCH /api/admin/jobs after vacancyForRole/syncRoleStatus, and as a bounded fallback at the start of GET /api/platform/recruiting/candidates when score_queue has rows for that job.",
    where: "app/api/applications/route.ts; app/api/admin/jobs/route.ts; app/api/platform/recruiting/[action]/route.ts; lib/portal/queue.ts" });
  check("F5.20b", "after the queue is run the applicant is ranked for the role they applied to", after.some(c => c.candidate_id === webApp.id), { severity: "blocker", detail: `${after.length} ranked: ${after.map(c => c.display_name).join(", ")}`, title: "A website applicant is never ranked for the role they applied to" });
  const again = await websiteApply(seedCvs[6] ?? seedCvs[0], { email: webApp.email, jobId: roleId, shareConsent: "yes" });
  check("F5.21", "sending the same application again within a day is refused and the first CV is kept", again.r.status === 409 && count("applications", "email = ?", webApp.email) === 1, { severity: "medium", detail: `status ${again.r.status}` });
}
await step("F5.22", "a visitor registers a general profile (no role) and allows future contact and sharing", async () => {
  const out = await websiteApply(seedCvs[7] ?? seedCvs[1], { email: mail("web.general"), shareConsent: "yes", whatsappConsent: "", location: "Bengaluru" });
  if (out.r.status !== 201) throw new Error(`${out.r.status} ${out.r.text.slice(0, 300)}`);
  webGeneral = out;
  const a = row("SELECT id, job_id, future_consent FROM applications WHERE email = ?", out.email);
  webGeneral.appId = a.id; webGeneral.id = row("SELECT candidate_id FROM candidate_sources WHERE ref_id = ?", a.id)?.candidate_id;
  const place = row("SELECT current_city, preferred_cities FROM candidates WHERE id = ?", webGeneral.id ?? "");
  if (place?.current_city === "Bengaluru" || !String(place?.preferred_cities ?? "").includes("Bengaluru")) throw new Error(`"where you would like to work" must be kept as a preferred city, with the current city read from the CV: ${JSON.stringify(place)}`);
  const said = rows("SELECT purpose FROM candidate_consents WHERE candidate_id = ? AND action = 'granted'", webGeneral.id ?? "").map(r => r.purpose);
  if (!said.includes("profile_processing") || !said.includes("recruiter_sharing")) throw new Error(`the consents given on the general form are not in the ledger: ${said.join(", ")}`);
  const wa = rows("SELECT status, status_detail FROM messages WHERE recipient_id = ? AND channel = 'whatsapp'", webGeneral.id ?? "");
  if (wa.some(m => m.status === "queued")) throw new Error("a WhatsApp message was queued for someone who did not tick the WhatsApp box");
  return a.job_id === null && Number(a.future_consent) === 1 && !!webGeneral.id;
}, { severity: "high" });
{
  const noCv = await anon.form("/api/applications", { fullName: "No Cv", email: mail("nocv"), phone: "+91 90000 41009", declaration: "yes", consent: "yes", futureConsent: "yes" });
  check("F5.23", "an application without a CV is refused with a clear message", noCv.status === 400 && /CV/i.test(noCv.body?.error ?? ""), { severity: "medium", detail: `${noCv.status} ${noCv.text.slice(0, 120)}` });
  const fake = await anon.form("/api/applications", { fullName: "Fake File", email: mail("fake"), phone: "+91 90000 41010", declaration: "yes", consent: "yes", futureConsent: "yes", resume: { name: "cv.pdf", mimeType: "application/pdf", buffer: Buffer.from("this is not a pdf") } });
  check("F5.24", "a file that only claims to be a PDF is refused", fake.status === 400, { severity: "high", detail: `status ${fake.status}` });
  const closed = await anon.form("/api/applications", { fullName: "Late", email: mail("late"), phone: "+91 90000 41011", declaration: "yes", consent: "yes", jobId: "no-such-role", resume: pdfFile("cv.pdf", await pdfFromText(browser, cvText(seedCvs[0].key))) });
  check("F5.25", "an application to a role that does not exist or is closed is refused", closed.status === 410, { severity: "medium", detail: `status ${closed.status}` });
}

// ------------------------------------------------------------------ 6. privacy request
section("6. Privacy request (public form) -> owner console");
let privacyId;
{
  const pr = await anon.post("/api/privacy-requests", { requestType: "access", requesterName: "Meera Banerjee", email: ENQ.email, details: "Please send me a copy of the data you hold." });
  const p = row("SELECT * FROM privacy_requests WHERE email = ? AND request_type = 'access'", ENQ.email);
  privacyId = p?.id;
  check("F6.1", "a privacy request is stored as typed", pr.status === 201 && p?.requester_name === "Meera Banerjee" && p.status === "new" && p.details.includes("copy of the data"), { severity: "high" });
  check("F6.2", "the owner console lists it", !!(await owner.get("/api/admin/privacy-requests")).body?.requests?.some(x => x.id === privacyId), { severity: "high" });
  const close = await owner.patch(`/api/admin/privacy-requests/${privacyId}`, { status: "completed", resolutionNote: "Copy sent.", identityVerified: false });
  check("F6.3", "the owner cannot close a request without confirming identity was verified", close.status === 400, { severity: "high", detail: `status ${close.status} ${close.text.slice(0, 100)}` });
  const done = await owner.patch(`/api/admin/privacy-requests/${privacyId}`, { status: "completed", resolutionNote: "Copy sent by email after a call-back.", identityVerified: true });
  check("F6.4", "with identity confirmed the outcome is stored", done.ok && row("SELECT status, resolution_note FROM privacy_requests WHERE id = ?", privacyId)?.status === "completed", { severity: "medium", detail: `status ${done.status}` });
  if (!("reference" in (pr.body ?? {}))) finding("F6.5", { severity: "low", kind: "gap", title: "A privacy request gives the person no reference number", actual: "The application and enquiry forms return a reference (JP-…, HE-…). The privacy form returns only \"Your request has been received\".", expected: "A reference the person can quote when following up, and that the owner can search for.", fix: "Return `PR-<id prefix>` from app/api/privacy-requests/route.ts and show it in the owner console's Privacy requests list.", where: "app/api/privacy-requests/route.ts" });
}

// ------------------------------------------------------------------ 7. recruiter shortlist and submission
section("7. Recruiter: shortlist, contact, pass, submit to the client");
const cand = id => candidates.find(c => c.id === id);
let shortlist = [], fullList = [];
await step("F7.1", "matching ran: the administrator sees a ranked list for the client's job, with scores", async () => {
  const r = await until(async () => { const x = await admin.get(`/api/platform/recruiting/candidates?jd=${jdId}`); return (x.body?.candidates?.length ?? 0) >= 3 ? x : null; }, 8000);
  fullList = r?.body?.candidates ?? [];
  note(`ranked list: ${fullList.map(c => `${c.display_name} ${Math.round(c.score)} ${Number(c.hard_pass) ? "pass" : "miss"} share=${c.can_share}`).join(" | ")}`);
  return fullList.length >= 3 && "score" in fullList[0];
}, { severity: "blocker", title: "Candidates with a parsed CV and consent do not appear in the recruiter's ranked list for a live job" });
{
  const r = await recruiter.get(`/api/platform/recruiting/candidates?jd=${jdId}`);
  shortlist = r.body?.candidates ?? [];
  check("F7.2", "a recruiter sees at most three candidates at a time and no scores", r.ok && shortlist.length > 0 && shortlist.length <= 3 && shortlist.every(c => !("score" in c)), { severity: "high", detail: `${shortlist.length} shown` });
  const scored = shortlist.filter(c => /^\s*\d{2,3}\s*\(likely/.test(String(c.explanation ?? "")));
  check("F7.2b", "the one-line summary a recruiter sees does not contain the score either", scored.length === 0, { severity: "medium", kind: "defect", title: "Recruiters are shown the match score after all, inside the summary line", actual: `Recruiters and team managers are meant to see the three best candidates without scores (the score fields are removed for them). The summary line under each name still begins with the score and its range, for example: "${String(scored[0]?.explanation ?? "").slice(0, 110)}".`, expected: "For anyone but an administrator the summary starts at the evidence (\"meets 5 of 5 must-have requirements…\").", fix: "In staffCandidates() (lib/portal/staff.ts) strip the leading score from `explanation` for non-admins, or have the matcher store the score and the sentence separately.", where: "lib/portal/staff.ts staffCandidates; lib/portal/match.ts" });
  check("F7.2c", "a recruiter sees a band (strong, good, partial or weak match) in place of the score", shortlist.every(c => ["Strong match", "Good match", "Partial match", "Weak match"].includes(c.band)), { severity: "medium", detail: shortlist.map(c => c.band).join(", ") });
  check("F7.3", "a recruiter on another team cannot read this job's candidates or pipeline", (await outsider.get(`/api/platform/recruiting/candidates?jd=${jdId}`)).status === 404 && (await outsider.get(`/api/platform/recruiting/pipeline?jd=${jdId}`)).status === 404, { severity: "blocker", title: "A recruiter outside the team can read a client's candidates" });
  check("F7.4", "a view-only member can read the shortlist but cannot submit", (await viewer.get(`/api/platform/recruiting/candidates?jd=${jdId}`)).ok && (await viewer.post("/api/platform/recruiting/submit", { jdId, candidateId: shortlist[0]?.candidate_id, note: "x" })).status === 403, { severity: "high" });
}
const A = shortlist[0], B = shortlist[1], C = shortlist[2];
if (A) {
  const before = count("audit_events", "kind='access' AND action='contact_view'");
  const ct = await recruiter.post("/api/platform/recruiting/contact", { jdId, candidateId: A.candidate_id });
  const known = cand(A.candidate_id);
  check("F7.5", "the recruiter opens a shortlisted candidate's phone and email, and they are the ones the candidate gave", ct.ok && (!known || ct.body.email === known.email) && !!ct.body.phone, { severity: "blocker", detail: JSON.stringify(ct.body).slice(0, 200), title: "The recruiter cannot retrieve the contact details the candidate entered" });
  check("F7.6", "every contact view is written to the access record", count("audit_events", "kind='access' AND action='contact_view'") === before + 1, { severity: "high" });
  const noNote = await recruiter.post("/api/platform/recruiting/submit", { jdId, candidateId: A.candidate_id, note: " " });
  check("F7.7", "submitting without a recruiter's note is refused", noNote.status === 400, { severity: "medium", detail: `status ${noNote.status}` });
  const sub = await recruiter.post("/api/platform/recruiting/submit", { jdId, candidateId: A.candidate_id, note: "Strong Tally and GST work history; 30 days notice; expects 4.2 LPA." });
  check("F7.8", "the recruiter submits the candidate to the client", sub.status === 201 && !!sub.body?.id, { severity: "blocker", detail: `${sub.status} ${sub.text.slice(0, 200)}` });
  A.pipelineId = sub.body?.id;
  const p = row("SELECT * FROM pipeline WHERE id = ?", A.pipelineId ?? "");
  check("F7.9", "the pipeline row is stored: right client, job, candidate, stage 'submitted', the note, and who submitted", p?.company_id === companyId && p.jd_id === jdId && p.candidate_id === A.candidate_id && p.stage === "submitted" && p.recruiter_note.includes("Tally") && String(p.created_by).includes(recruiterU.id), { severity: "blocker", detail: JSON.stringify(p ? { stage: p.stage, by: p.created_by } : null) });
  check("F7.10", "the submission is in the pipeline history", count("pipeline_events", "pipeline_id = ? AND stage = 'submitted'", A.pipelineId ?? "") === 1, { severity: "medium" });
  const dup = await recruiter.post("/api/platform/recruiting/submit", { jdId, candidateId: A.candidate_id, note: "again" });
  check("F7.11", "the same candidate cannot be submitted to the same job twice", [404, 409].includes(dup.status) && count("pipeline", "jd_id = ? AND candidate_id = ?", jdId, A.candidate_id) === 1, { severity: "high", detail: `status ${dup.status}` });
  const next = (await recruiter.get(`/api/platform/recruiting/candidates?jd=${jdId}`)).body?.candidates ?? [];
  check("F7.12", "after a submission the next best candidate takes the free place", !next.some(c => c.candidate_id === A.candidate_id) && next.length === Math.min(3, fullList.length - 1), { severity: "medium", detail: `${next.length} shown of ${fullList.length - 1} left` });
  if (known) {
    const inbox = await known.session.get("/api/portal/candidate/inbox");
    check("F7.13", "the candidate is told their profile was put forward", (inbox.body?.messages ?? []).some(m => /put forward/i.test(m.title)), { severity: "high", detail: (inbox.body?.messages ?? []).map(m => m.title).join(" | ") });
  }
}
if (C) {
  const noReason = await recruiter.post("/api/platform/recruiting/pass", { jdId, candidateId: C.candidate_id, reason: "" });
  const pass = await recruiter.post("/api/platform/recruiting/pass", { jdId, candidateId: C.candidate_id, reason: "salary_mismatch" });
  check("F7.14", "passing on a candidate needs a reason, and the reason is stored", noReason.status === 400 && pass.ok && row("SELECT reason, staff_id FROM shortlist_passes WHERE jd_id = ? AND candidate_id = ?", jdId, C.candidate_id)?.reason === "salary_mismatch", { severity: "medium" });
  const seen = (await admin.get(`/api/platform/recruiting/candidates?jd=${jdId}`)).body?.candidates?.find(c => c.candidate_id === C.candidate_id);
  check("F7.15", "the administrator sees why the recruiter passed", seen?.passed === "salary_mismatch", { severity: "low" });
  const undo = await recruiter.post("/api/platform/recruiting/unpass", { jdId, candidateId: C.candidate_id });
  const backOnList = (await recruiter.get(`/api/platform/recruiting/candidates?jd=${jdId}`)).body?.candidates?.some(c => c.candidate_id === C.candidate_id);
  check("F7.16", "a recruiter can undo a pass: the candidate returns to the shortlist", undo.ok && !!backOnList, { severity: "medium", detail: `${undo.status} ${undo.text.slice(0, 120)}` });
  await recruiter.post("/api/platform/recruiting/pass", { jdId, candidateId: C.candidate_id, reason: "salary_mismatch" });
}

// ------------------------------------------------------------------ 8. client review and interviews
section("8. Client: review the submission, shortlist, interviews and feedback");
let entry;
if (A?.pipelineId) {
  const pv = await clientOwner.get(`/api/portal/company/pipeline?jd=${jdId}`);
  entry = pv.body?.pipeline?.find(e => e.id === A.pipelineId);
  check("F8.1", "the client sees the submitted candidate with the recruiter's note", !!entry && entry.stage === "submitted" && entry.recruiterNote.includes("Tally") && entry.name === A.display_name, { severity: "blocker", detail: JSON.stringify(entry ? { name: entry.name, stage: entry.stage } : null), title: "A submitted candidate does not appear in the client's pipeline" });
  const dash = await clientOwner.get("/api/portal/company/dashboard");
  check("F8.2", "the client's dashboard counts one candidate to review and shows the update from Jobboard300", dash.body?.overview?.funnel?.submitted === 1 && (dash.body?.notices ?? []).some(n => /new candidate/i.test(n.title)), { severity: "high", detail: JSON.stringify(dash.body?.overview?.funnel) });
  check("F8.3", "the other client sees nothing of this pipeline", ((await otherClient.get("/api/portal/company/pipeline")).body?.pipeline ?? []).length === 0 && (await otherClient.get(`/api/portal/company/candidate?ref=${entry?.ref}`)).status !== 200, { severity: "blocker", title: "One client can see another client's candidates" });
  const prof = await clientOwner.get(`/api/portal/company/candidate?ref=${entry?.ref}`);
  const known = cand(A.candidate_id);
  check("F8.4", "the client opens the candidate's profile (experience, skills) before interviewing", prof.ok && (prof.body.profile?.skills?.length ?? 0) > 0, { severity: "blocker", detail: `status ${prof.status} ${prof.text.slice(0, 160)}` });
  check("F8.5", "before an offer the client is not given the candidate's phone or email", prof.ok && prof.body.contactsHidden === true && !prof.text.includes(known?.email ?? "@@none@@") && !/90000 3\d{4}|900003\d{4}/.test(prof.text), { severity: "blocker", title: "The client can see the candidate's contact details before making an offer (bypass risk)", detail: JSON.stringify(prof.body?.profile?.contact ?? null) });
  const dl = await clientOwner.get(`/api/portal/company/download?ref=${entry?.ref}`);
  check("F8.6", "the client downloads the CV as a PDF", dl.status === 200 && dl.text.startsWith("%PDF-"), { severity: "high", detail: `status ${dl.status} ${dl.status === 200 ? "" : dl.text.slice(0, 200)}` });
  check("F8.7", "the download is written to the audit record and the candidate is told", count("audit_events", "action = 'cv.downloaded'") >= 1 && (!known || ((await known.session.get("/api/portal/candidate/inbox")).body?.messages ?? []).some(m => /downloaded your CV/i.test(m.title))), { severity: "medium" });

  const skip = await clientOwner.post("/api/portal/company/pipeline-stage", { pipelineId: A.pipelineId, stage: "offered" });
  check("F8.8", "a stage cannot be skipped (submitted straight to offer is refused)", skip.status === 400 && /cannot move/.test(skip.body?.error ?? ""), { severity: "high", detail: `${skip.status} ${skip.text.slice(0, 120)}` });
  const early = await clientOwner.post("/api/portal/company/interview-schedule", { pipelineId: A.pipelineId, round: "Technical 1", scheduledAt: inDays(2), mode: "video" });
  check("F8.9", "an interview cannot be scheduled before the candidate is shortlisted", early.status === 400, { severity: "medium", detail: `status ${early.status}` });
  const sl = await clientOwner.post("/api/portal/company/pipeline-stage", { pipelineId: A.pipelineId, stage: "shortlisted", note: "Good profile" });
  check("F8.10", "the client shortlists the candidate", sl.ok && row("SELECT stage FROM pipeline WHERE id = ?", A.pipelineId)?.stage === "shortlisted", { severity: "blocker", detail: `${sl.status} ${sl.text.slice(0, 120)}` });
  check("F8.11", "the recruiter sees the new stage", (await recruiter.get(`/api/platform/recruiting/pipeline?jd=${jdId}`)).body?.pipeline?.find(e => e.id === A.pipelineId)?.stage === "shortlisted", { severity: "high" });
  if (known) check("F8.12", "the candidate is told they were shortlisted", ((await known.session.get("/api/portal/candidate/inbox")).body?.messages ?? []).some(m => /shortlist/i.test(`${m.title} ${m.body}`)), { severity: "medium" });

  // Round 1, scheduled by the client.
  const when1 = inDays(3);
  const iv1 = await clientOwner.post("/api/portal/company/interview-schedule", { pipelineId: A.pipelineId, round: "Technical 1", scheduledAt: when1, mode: "video", location: "https://meet.example/abc", interviewer: "S. Dutta" });
  const i1 = row("SELECT * FROM interviews WHERE id = ?", iv1.body?.id ?? "");
  check("F8.13", "the client schedules round 1; the interview is stored with round, time, mode, link and interviewer", iv1.status === 201 && i1?.round === "Technical 1" && i1.scheduled_at === when1 && i1.mode === "video" && i1.location === "https://meet.example/abc" && i1.interviewer === "S. Dutta" && i1.status === "scheduled", { severity: "blocker", detail: `${iv1.status} ${iv1.text.slice(0, 160)}` });
  check("F8.14", "scheduling the first interview moves the candidate to 'Interviewing'", row("SELECT stage FROM pipeline WHERE id = ?", A.pipelineId)?.stage === "interview", { severity: "high" });
  if (known) { const m = ((await known.session.get("/api/portal/candidate/inbox")).body?.messages ?? []).find(x => /^Interview for/.test(x.title)); check("F8.15", "the candidate is told the round, the India time and the link", !!m && m.body.includes("India time") && m.body.includes("https://meet.example/abc"), { severity: "high", detail: m?.body ?? "no message" }); }
  check("F8.16", "the recruiter sees the scheduled interview", !!(await recruiter.get(`/api/platform/recruiting/pipeline?jd=${jdId}`)).body?.pipeline?.find(e => e.id === A.pipelineId)?.interviews?.some(i => i.id === iv1.body?.id), { severity: "high" });
  check("F8.17", "the client's dashboard lists it under upcoming interviews", !!(await clientOwner.get("/api/portal/company/dashboard")).body?.overview?.upcoming?.some(i => i.id === iv1.body?.id), { severity: "medium" });
  const past = await clientOwner.post("/api/portal/company/interview-schedule", { pipelineId: A.pipelineId, round: "Past round", scheduledAt: "2020-01-01T10:00:00.000Z", mode: "phone" });
  if (past.status === 201) {
    finding("F8.18", { severity: "medium", title: "An interview can be scheduled in the past", actual: "Scheduling an interview for 1 Jan 2020 is accepted (201); the candidate is messaged about an interview that has already passed and it lands straight in \"Interviews waiting for feedback\".", expected: "A date in the past is refused (\"Choose a time in the future\"). Recording a past interview is a different action.", fix: "In scheduleInterview() (lib/portal/client.ts) reject `when < now - 5 min`; add `min` to both datetime-local inputs.", where: "lib/portal/client.ts scheduleInterview" });
    await clientOwner.post("/api/portal/company/interview-record", { interviewId: past.body.id, status: "cancelled" });
  }
  const fb = await clientOwner.post("/api/portal/company/interview-record", { interviewId: iv1.body?.id, status: "completed", outcome: "advance", rating: 4, feedback: "Solid on GST reconciliation; weaker on TDS sections." });
  const f1 = row("SELECT status, outcome, rating, feedback FROM interviews WHERE id = ?", iv1.body?.id ?? "");
  check("F8.19", "the client records round 1 as completed: outcome, rating and feedback are stored", fb.ok && f1?.status === "completed" && f1.outcome === "advance" && Number(f1.rating) === 4 && f1.feedback.includes("GST"), { severity: "blocker", detail: `${fb.status} ${JSON.stringify(f1 ?? null)}` });
  const staffView = (await recruiter.get(`/api/platform/recruiting/pipeline?jd=${jdId}`)).body?.pipeline?.find(e => e.id === A.pipelineId)?.interviews?.find(i => i.id === iv1.body?.id);
  check("F8.20", "the recruiter can read the client's interview feedback", !!staffView && staffView.feedback?.includes("GST"), { severity: "high", detail: JSON.stringify(staffView ?? null).slice(0, 200) });
  if (known) check("F8.21", "the candidate never sees the interviewer's feedback or rating", !(await known.session.get("/api/portal/candidate/inbox")).text.includes("weaker on TDS") && !(await known.session.get("/api/portal/candidate/export")).text.includes("weaker on TDS"), { severity: "blocker", title: "Interview feedback leaks to the candidate" });

  // Round 2, scheduled by the recruiter for the client.
  const iv2 = await recruiter.post("/api/platform/recruiting/interview", { pipelineId: A.pipelineId, round: "HR", scheduledAt: inDays(5), mode: "in_person", location: "Works office, Durgapur", interviewer: "M. Banerjee" });
  check("F8.22", "the recruiter schedules round 2 (multiple interview levels are supported)", iv2.status === 201 && count("interviews", "pipeline_id = ?", A.pipelineId) >= 2, { severity: "high", detail: `${iv2.status} ${iv2.text.slice(0, 120)}` });
  check("F8.23", "the client is told that Jobboard300 scheduled it", ((await clientOwner.get("/api/portal/company/dashboard")).body?.notices ?? []).some(n => /Interview scheduled/i.test(n.title)), { severity: "medium" });
  // Things a recruiter would need next.
  const staffRecord = await recruiter.post("/api/platform/recruiting/interview-record", { interviewId: iv2.body?.id, status: "completed", outcome: "advance" });
  if (staffRecord.status === 404) finding("F8.24", { severity: "high", kind: "gap", title: "Jobboard300 staff cannot record what happened at an interview", actual: "Only the client can mark an interview completed, cancelled or no-show and record the outcome (`interview-record` exists on the client API only; the Recruiting tool has no such action or button). If the client tells the recruiter the result by phone, the recruiter cannot enter it, and the interview stays \"scheduled\" forever in both screens.", expected: "A recruiter with Edit access records the outcome on the client's behalf (marked as recorded by Jobboard300), exactly as they can already schedule on the client's behalf.", fix: "Add `interview-record` to app/api/platform/recruiting/[action]/route.ts calling recordInterview() through a staff wrapper (pipelineJob scope check), and a \"Record outcome\" button beside each scheduled interview in recruiting.tsx.", where: "app/api/platform/recruiting/[action]/route.ts; app/platform/recruiting/recruiting.tsx; lib/portal/staff.ts" });
  const resched = await clientOwner.post("/api/portal/company/interview-reschedule", { interviewId: iv2.body?.id, scheduledAt: inDays(6) });
  if (resched.status === 404) finding("F8.25", { severity: "high", kind: "gap", title: "An interview cannot be rescheduled", actual: "There is no reschedule action for the client or for staff. The only way to change the time is to mark the interview \"Cancelled\" (client only) and schedule a new one. The candidate then has two messages and is never told the first one was cancelled.", expected: "Change date, time, mode or link on a scheduled interview; the candidate and the other side get one \"rescheduled to …\" message.", fix: "Add `interview-reschedule` (client and staff) that updates scheduled_at/mode/location on a `scheduled` interview and calls notifyCandidate + notifyCompany.", where: "lib/portal/client.ts; both pipeline screens" });
  const rec2 = await clientOwner.post("/api/portal/company/interview-record", { interviewId: iv2.body?.id, status: "cancelled" });
  const told = known ? ((await known.session.get("/api/portal/candidate/inbox")).body?.messages ?? []).some(m => /cancel/i.test(`${m.title} ${m.body}`)) : true;
  if (rec2.ok && !told) finding("F8.26", { severity: "high", kind: "gap", title: "The candidate is not told when an interview is cancelled", actual: "The client marks an interview \"Cancelled\". It is stored, but the candidate's inbox still shows only \"Interview for … HR, <date>\". Nothing tells them it is off, and the recruiter gets no update either.", expected: "Cancelling sends the candidate \"Your HR interview on <date> has been cancelled; your recruiter will contact you\" and adds a line to the recruiter's view.", fix: "In recordInterview() (lib/portal/client.ts), when status is `cancelled`, call notifyCandidate(..., \"interview.cancelled\", …).", where: "lib/portal/client.ts recordInterview" });
  // Round 2 again, and an outcome of "do not proceed".
  const iv3 = await clientOwner.post("/api/portal/company/interview-schedule", { pipelineId: A.pipelineId, round: "HR", scheduledAt: inDays(6), mode: "phone" });
  await clientOwner.post("/api/portal/company/interview-record", { interviewId: iv3.body?.id, status: "completed", outcome: "advance", rating: 5, feedback: "Clear communicator." });
  entry = (await clientOwner.get(`/api/portal/company/pipeline?jd=${jdId}`)).body?.pipeline?.find(e => e.id === A.pipelineId);
}

// A second candidate, to test "interview outcome: do not proceed" and rejection.
let Bentry;
if (B) {
  const sub = await recruiter.post("/api/platform/recruiting/submit", { jdId, candidateId: B.candidate_id, note: "Good GST exposure; immediate joiner." });
  B.pipelineId = sub.body?.id;
  if (B.pipelineId) {
    await clientOwner.post("/api/portal/company/pipeline-stage", { pipelineId: B.pipelineId, stage: "shortlisted" });
    const iv = await clientOwner.post("/api/portal/company/interview-schedule", { pipelineId: B.pipelineId, round: "Technical 1", scheduledAt: inDays(4), mode: "video", location: "https://meet.example/xyz" });
    const up = await clientOwner.post("/api/portal/company/interview-schedule", { pipelineId: B.pipelineId, round: "Technical 2", scheduledAt: inDays(7), mode: "video" });
    const recReject = await clientOwner.post("/api/portal/company/interview-record", { interviewId: iv.body?.id, status: "completed", outcome: "reject", rating: 2, feedback: "Could not explain ITC reconciliation." });
    const after = row("SELECT stage FROM pipeline WHERE id = ?", B.pipelineId)?.stage;
    check("F8.27", "'Do not proceed' tells the screen to mark the candidate Not selected (and can do it in the same step)", after !== "interview" || recReject.body?.suggest === "rejected", { severity: "high", detail: JSON.stringify(recReject.body ?? {}).slice(0, 160) });
    const noReason = await clientOwner.post("/api/portal/company/pipeline-stage", { pipelineId: B.pipelineId, stage: "rejected" });
    check("F8.28", "rejecting a candidate needs a reason code", noReason.status === 400 && /reason/i.test(noReason.body?.error ?? ""), { severity: "high", detail: `status ${noReason.status}` });
    const rej = await clientOwner.post("/api/portal/company/pipeline-stage", { pipelineId: B.pipelineId, stage: "rejected", reason: "skills_gap", note: "ITC reconciliation" });
    const pr = row("SELECT stage, stage_reason FROM pipeline WHERE id = ?", B.pipelineId);
    check("F8.29", "the client rejects the candidate; stage and reason are stored", rej.ok && pr?.stage === "rejected" && pr.stage_reason.startsWith("skills_gap"), { severity: "blocker", detail: `${rej.status} ${JSON.stringify(pr ?? null)}` });
    check("F8.30", "rejection cancels the candidate's interviews that were still scheduled", row("SELECT status FROM interviews WHERE id = ?", up.body?.id ?? "")?.status === "cancelled", { severity: "medium" });
    const known = cand(B.candidate_id);
    if (known) {
      const msgs = (await known.session.get("/api/portal/candidate/inbox")).body?.messages ?? [];
      const m = msgs.find(x => /not to take your application further|not selected|unsuccessful/i.test(`${x.title} ${x.body}`));
      check("F8.31", "the candidate is told the outcome", !!m, { severity: "high", detail: msgs.map(x => x.title).join(" | "), title: "A rejected candidate is never told" });
      check("F8.32", "the candidate is told the outcome only: never the reason code, the rating or the feedback", !!m && !/skills_gap|skills gap|ITC|rating/i.test(JSON.stringify(msgs)), { severity: "blocker", title: "The rejection reason or feedback is shown to the candidate" });
    }
    Bentry = (await clientOwner.get("/api/portal/company/pipeline")).body?.pipeline?.find(e => e.id === B.pipelineId);
    check("F8.33", "after rejection the client no longer sees the candidate's name, note or CV", !!Bentry && Bentry.available === false && Bentry.name.startsWith("Candidate ") && Bentry.recruiterNote === "" && [403, 404, 410].includes((await clientOwner.get(`/api/portal/company/candidate?ref=${Bentry.ref}`)).status), { severity: "high", detail: JSON.stringify(Bentry ? { name: Bentry.name, available: Bentry.available } : null) });
    const staffEntry = (await recruiter.get(`/api/platform/recruiting/pipeline?jd=${jdId}`)).body?.pipeline?.find(e => e.id === B.pipelineId);
    check("F8.34", "the recruiter sees the rejection and its reason", staffEntry?.stage === "rejected" && /skills_gap/.test(staffEntry.stageReason), { severity: "high", detail: JSON.stringify(staffEntry ? { stage: staffEntry.stage, reason: staffEntry.stageReason } : null) });
    const told = await until(async () => count("staff_updates") > 0 && ((await recruiter.get("/api/platform/recruiting/work")).body?.changes?.items?.length ?? 0) > 0, 300);
    check("F8.35", "recruiters see what the client did, in a What changed list", told, { severity: "medium" });
    // Re-open.
    const reopenByClient = (Bentry?.next ?? []).length;
    const reopen = await recruiter.post("/api/platform/recruiting/stage", { pipelineId: B.pipelineId, stage: "shortlisted", note: "Client agreed to a second look" });
    note(`re-open a rejected candidate: client next=[${Bentry?.next}] (${reopenByClient}), staff -> ${reopen.status} ${reopen.text.slice(0, 120)}`);
    const staffNext = staffEntry?.next ?? [];
    if (!reopen.ok && !staffNext.length) finding("F8.36", { severity: "medium", kind: "gap", title: "A rejected or withdrawn candidate cannot be brought back for the same job", actual: `The stage rules allow "Not selected" → "Shortlisted", but both screens hide every action once a candidate is closed (the client's view returns no next stages; the Recruiting tool the same), and the API then refuses with: ${reopen.text.slice(0, 160)}`, expected: "Either a working \"Reconsider\" action for staff (with a note, telling the candidate), or remove the unreachable transition from the rules so the code says what the product does.", fix: "pipelineView() sets `next: hidden ? [] : NEXT[stage]`; for staff (temporary=false) the entry is not hidden, so check why the staff call is refused, then decide: expose \"Reconsider\" to staff only, or delete `rejected: [\"shortlisted\"]` / `withdrawn: [\"shortlisted\"]` from NEXT.", where: "lib/portal/client.ts NEXT, pipelineView" });
    else if (reopen.ok) {
      check("F8.36", "staff can bring a rejected candidate back to 'Shortlisted' and the client sees them again", ((await clientOwner.get("/api/portal/company/pipeline")).body?.pipeline?.find(e => e.id === B.pipelineId)?.available) === true, { severity: "medium" });
      await clientOwner.post("/api/portal/company/pipeline-stage", { pipelineId: B.pipelineId, stage: "withdrawn", reason: "candidate_withdrew" });
    }
  }
}

// ------------------------------------------------------------------ 9. offer, commitment, joining, placement
section("9. Selected: offer -> commitment -> offer accepted -> joined -> placement and fee");
let placementId;
if (A?.pipelineId && entry) {
  const known = cand(A.candidate_id);
  const badCtc = await clientOwner.post("/api/portal/company/pipeline-stage", { pipelineId: A.pipelineId, stage: "offered", offerCtcInr: 12 });
  check("F9.1", "an offer with an implausible salary is refused", badCtc.status === 400, { severity: "medium", detail: `status ${badCtc.status}` });
  const off = await clientOwner.post("/api/portal/company/pipeline-stage", { pipelineId: A.pipelineId, stage: "offered", offerCtcInr: 420000, offerDate: today, note: "Offer letter sent" });
  const p1 = row("SELECT stage, offer_ctc_inr, offer_date FROM pipeline WHERE id = ?", A.pipelineId);
  check("F9.2", "the client makes an offer; the offered salary and date are stored", off.ok && p1?.stage === "offered" && Number(p1.offer_ctc_inr) === 420000 && p1.offer_date === today, { severity: "blocker", detail: `${off.status} ${off.text.slice(0, 160)} ${JSON.stringify(p1 ?? null)}` });
  const noCtc = row("SELECT offer_ctc_inr FROM pipeline WHERE id = ?", A.pipelineId);
  void noCtc;
  const com = row("SELECT id, accepted_at, body FROM candidate_commitments WHERE pipeline_id = ?", A.pipelineId);
  check("F9.3", "the offer creates the candidate's written commitment", !!com && com.accepted_at === null && com.body.includes(seedJd.title), { severity: "high" });
  const prof = await clientOwner.get(`/api/portal/company/candidate?ref=${entry.ref}`);
  const shown = prof.body?.profile?.contact ?? {};
  check("F9.4", "from the offer stage the client is given a phone number and an email for the candidate", prof.ok && prof.body.contactsHidden === false && !!shown.email && !!shown.phone, { severity: "high", detail: JSON.stringify({ hidden: prof.body?.contactsHidden, contact: shown }).slice(0, 240), title: "At offer stage the client still cannot get the candidate's contact details" });
  const rec = row("SELECT email, phone FROM candidates WHERE id = ?", A.candidate_id);
  if (prof.ok && rec?.email && shown.email !== rec.email) finding("F9.4a", { severity: "medium", kind: "defect", title: "The client and the recruiter are given different contact details for the same candidate", actual: `At offer stage the client is shown the email and phone printed in the CV text (${shown.email}, ${shown.phone}). The recruiter's "Show phone and email" shows the ones on the person's record (${rec.email}, ${rec.phone}), which are the verified sign-up details. If the CV has no email or phone, or an old one, the client gets a blank or a dead contact at the moment they need to send the offer.`, expected: "One source of truth: the contact details on the candidate record (verified email first), falling back to the CV only when the record has none.", fix: "In unlockedCandidate() (lib/portal/views.ts) overlay candidates.email / candidates.phone onto profile.contact when contacts are not hidden, the same way staffContact() already does.", where: "lib/portal/views.ts unlockedCandidate; lib/portal/staff.ts staffContact" });
  let commitLink;
  if (known) {
    const m = ((await known.session.get("/api/portal/candidate/inbox")).body?.messages ?? []).find(x => /commitment/i.test(x.title));
    // The link is its own field on the message (a path on this site, shown as a button), so it is right on any address.
    commitLink = m?.link ? `${BASE}${m.link}` : m?.body.match(/https?:\/\/\S+\/commit\?token=[a-f0-9]+/)?.[0];
    check("F9.5", "the candidate's inbox carries the offer and the commitment link", !!m && !!commitLink, { severity: "high", detail: m?.body ?? "no message" });
    if (commitLink && !commitLink.startsWith(BASE)) note(`commitment link host: ${new URL(commitLink).origin} (SITE_URL), not the server that issued it`);
  }
  const re = await recruiter.post("/api/platform/recruiting/commitment-link", { pipelineId: A.pipelineId });
  const fresh = re.body?.link;
  check("F9.6", "the recruiter can issue a fresh commitment link to send by hand", re.ok && /\/commit\?token=[a-f0-9]{64}$/.test(fresh ?? ""), { severity: "medium", detail: `${re.status} ${re.text.slice(0, 160)}` });
  if (commitLink && fresh) {
    const oldToken = new URL(commitLink).searchParams.get("token");
    check("F9.7", "issuing a new link stops the old one working", (await anon.get(`/api/portal/public/commitment?token=${oldToken}`)).status === 404, { severity: "medium" });
    const inboxAfter = known ? ((await known.session.get("/api/portal/candidate/inbox")).body?.messages ?? []) : [];
    const freshToken = new URL(fresh ?? "", BASE).searchParams.get("token") ?? "";
    check("F9.7a", "after a new commitment link is issued, the candidate's inbox carries the new link", !known || inboxAfter.some(m => (m.link ?? "").includes(freshToken)), { severity: "medium" });
  }
  if (fresh) {
    const token = new URL(fresh).searchParams.get("token");
    const read = await anon.get(`/api/portal/public/commitment?token=${token}`);
    const page = await anon.get(`/commit?token=${token}`);
    check("F9.8", "the candidate opens the commitment page without an account and reads the text", read.ok && read.body.body.includes("60 days") && page.status === 200, { severity: "high", detail: `api ${read.status}, page ${page.status}` });
    const noTick = await anon.post("/api/portal/public/commitment-accept", { token, agree: false });
    const acc = await anon.post("/api/portal/public/commitment-accept", { token, agree: true });
    check("F9.9", "the candidate accepts the commitment (ticking is required) and the acceptance is stored with its time", noTick.status === 400 && acc.ok && !!row("SELECT accepted_at FROM candidate_commitments WHERE pipeline_id = ?", A.pipelineId)?.accepted_at, { severity: "high", detail: `${noTick.status}/${acc.status} ${acc.text.slice(0, 160)}` });
    check("F9.10", "the recruiter sees the commitment as accepted", (await recruiter.get(`/api/platform/recruiting/pipeline?jd=${jdId}`)).body?.pipeline?.find(e => e.id === A.pipelineId)?.commitment === "accepted", { severity: "medium" });
  }
  const noDate = await clientOwner.post("/api/portal/company/pipeline-stage", { pipelineId: A.pipelineId, stage: "offer_accepted" });
  const joinOn = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
  const accd = await clientOwner.post("/api/portal/company/pipeline-stage", { pipelineId: A.pipelineId, stage: "offer_accepted", joiningDate: joinOn, lastWorkingDay: new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10), competingOffers: "one other offer at 4.5 LPA" });
  const p2 = row("SELECT stage, joining_date, last_working_day, competing_offers FROM pipeline WHERE id = ?", A.pipelineId);
  check("F9.11", "'Offer accepted' needs the expected joining date; it and the drop-out signals are stored", noDate.status === 400 && accd.ok && p2?.stage === "offer_accepted" && p2.joining_date === joinOn && !!p2.last_working_day && p2.competing_offers.includes("4.5"), { severity: "high", detail: `${noDate.status}/${accd.status} ${JSON.stringify(p2 ?? null)}` });
  const dash = await clientOwner.get("/api/portal/company/dashboard");
  const j = dash.body?.overview?.joining?.find(x => x.id === A.pipelineId);
  check("F9.12", "the client's dashboard lists the offer under 'waiting to join' with a follow-up checkpoint", !!j && !!j.checkpoint?.label, { severity: "medium", detail: JSON.stringify(j ?? null).slice(0, 200) });
  const staffJoining = (await recruiter.get("/api/platform/recruiting/work")).text;
  if (!/joining|check-?in|checkpoint/i.test(staffJoining)) finding("F9.13", { severity: "medium", kind: "gap", title: "The joining follow-up (T-30/14/7/1 calls) is shown to the client but not to the recruiter who makes the calls", actual: "The client dashboard shows \"Offers accepted, waiting to join\" with the next check-in and says \"Jobboard300 can do this for you\". The Recruiting tool has no list of upcoming joinings, no joining date, no last working day and no competing-offer note; the staff stage form does not even collect last working day or other offers.", expected: "A \"Joining soon\" list in the Recruiting tool with the same checkpoints, and the same fields on the staff \"Offer accepted\" form.", fix: "Return `joining` (from clientOverview-style query, scoped by visibility()) in staffWork(); render it in recruiting.tsx; add lastWorkingDay and competingOffers inputs to the staff stage form (the API already accepts them).", where: "lib/portal/staff.ts staffWork; app/platform/recruiting/recruiting.tsx" });
  const future = await clientOwner.post("/api/portal/company/pipeline-stage", { pipelineId: A.pipelineId, stage: "joined", joiningDate: joinOn });
  check("F9.14", "'Joined' with a future date is refused", future.status === 400, { severity: "medium", detail: `status ${future.status}` });
  const joined = await clientOwner.post("/api/portal/company/pipeline-stage", { pipelineId: A.pipelineId, stage: "joined", joiningDate: today });
  const pl = row("SELECT * FROM placements WHERE pipeline_id = ?", A.pipelineId);
  placementId = pl?.id;
  const fee = Math.round(420000 * 8.33 / 100);
  check("F9.15", "marking 'Joined' creates the placement with joining date, salary, fee and guarantee end", joined.ok && !!pl && pl.joined_on === today && Number(pl.ctc_inr) === 420000 && Math.abs(Number(pl.fee_inr) - fee) <= 1 && pl.guarantee_ends_on === new Date(Date.parse(today) + 60 * 86_400_000).toISOString().slice(0, 10) && pl.status === "active", { severity: "blocker", detail: `${joined.status} ${JSON.stringify(pl ? { joined: pl.joined_on, ctc: pl.ctc_inr, fee: pl.fee_inr, until: pl.guarantee_ends_on } : null)} expected fee ${fee}` });
  const ov = await owner.get("/api/admin/portal/overview");
  const seen = ov.body?.clientWork?.placements?.find(x => x.id === placementId);
  check("F9.16", "the owner console lists the placement with the fee to invoice", !!seen && Math.abs(Number(seen.fee_inr) - fee) <= 1, { severity: "high", detail: JSON.stringify(seen ?? null).slice(0, 200) });
  check("F9.17", "the client sees the hire inside the replacement guarantee", !!(await clientOwner.get("/api/portal/company/dashboard")).body?.overview?.placements?.find(x => x.id === placementId)?.inGuarantee, { severity: "high" });
  if (known) check("F9.18", "the candidate is told they were hired", ((await known.session.get("/api/portal/candidate/inbox")).body?.messages ?? []).some(m => /joined|hired|congrat/i.test(`${m.title} ${m.body}`)), { severity: "medium", detail: ((await known.session.get("/api/portal/candidate/inbox")).body?.messages ?? []).map(m => m.title).join(" | ") });

  // What happens to the job and to everyone else once the only opening is filled?
  const jdAfter = row("SELECT status, openings FROM jds WHERE id = ?", jdId);
  const stillListed = (await recruiter.get("/api/platform/recruiting/work")).body?.jobs?.find(x => x.id === jdId);
  if (jdAfter?.status === "live") finding("F9.19", { severity: "high", kind: "gap", title: "A job stays live after its only opening is filled", actual: `The job has ${jdAfter.openings} opening and 1 person joined. It is still "live": it stays in the recruiter's job list (${stillListed ? `"${stillListed.in_process} in process · ${stillListed.joined} joined"` : "listed"}), recruiters can keep submitting new candidates to it, and (for a public role) the website keeps taking applications. Nobody is prompted to close it.`, expected: "When joined = openings: mark the job \"Filled\" (or prompt the client and recruiter to close it), stop new submissions, and take the public listing down.", fix: "After the placement insert in moveStage(), compare COUNT(joined) with jds.openings; if filled, set jds.status='closed' (or a new 'filled'), call syncRoleStatus for a public role, and notify the client and team. Show \"n of m filled\" on both job lists.", where: "lib/portal/client.ts moveStage (stage === \"joined\")" });
  const lateSubmit = C ? await admin.post("/api/platform/recruiting/submit", { jdId, candidateId: C.candidate_id, note: "Submitted after the opening was filled" }) : null;
  if (lateSubmit?.status === 201) { C.pipelineId = lateSubmit.body.id; note("a new candidate was accepted into a job whose only opening is already filled (see F9.19)"); }
  const others = rows("SELECT id, stage FROM pipeline WHERE jd_id = ? AND id != ?", jdId, A.pipelineId);
  note(`other candidates on the filled job: ${others.map(o => o.stage).join(", ") || "none"}`);
  if (others.some(o => ["submitted", "shortlisted", "interview", "offered"].includes(o.stage))) finding("F9.20", { severity: "medium", kind: "gap", title: "Candidates still in process are left hanging when someone else is hired", actual: "After a hire fills the job, other candidates on that job stay at their stage (submitted, shortlisted, interviewing…) indefinitely. Nobody is asked to close them out and they are not told \"position filled\". The reason code `position_filled` exists but nothing uses it automatically.", expected: "On filling the last opening, offer the client/recruiter one action: \"Close the remaining n candidates as Not selected (position filled)\", which tells each candidate.", fix: "Add a `jd-fill` action that moves every open pipeline row on the job to `rejected` with reason `position_filled` through moveStage() (so notifications and history fire).", where: "lib/portal/client.ts" });
  check("F9.21", "after joining, no further stage change is possible for this candidate", (await clientOwner.post("/api/portal/company/pipeline-stage", { pipelineId: A.pipelineId, stage: "rejected", reason: "other" })).status === 400, { severity: "medium" });
  saveState({ hiredPipelineId: A.pipelineId });
}

// ------------------------------------------------------------------ 10. other ways out
section("10. Other outcomes: offer declined, did not join, withdrawn, early exit, replacement");
const D = fullList.find(c => ![A, B, C].filter(Boolean).some(x => x.candidate_id === c.candidate_id) && Number(c.can_share));
async function fastTo(candidateRow, stage) {
  const sub = await admin.post("/api/platform/recruiting/submit", { jdId: roleId, candidateId: candidateRow.candidate_id, note: "For the junior role." });
  if (sub.status !== 201) throw new Error(`submit ${sub.status} ${sub.text.slice(0, 200)}`);
  const id = sub.body.id, move = (s, extra = {}) => clientOwner.post("/api/portal/company/pipeline-stage", { pipelineId: id, stage: s, ...extra });
  await move("shortlisted");
  if (stage === "shortlisted") return id;
  const o = await move("offered", { offerCtcInr: 300000 }); if (!o.ok) throw new Error(`offer ${o.status} ${o.text.slice(0, 160)}`);
  if (stage === "offered") return id;
  const a = await move("offer_accepted", { joiningDate: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10) }); if (!a.ok) throw new Error(`accept ${a.status} ${a.text.slice(0, 160)}`);
  return id;
}
// The public role (same client) is used for these branches so each candidate has a fresh pipeline entry.
const roleList = (await admin.get(`/api/platform/recruiting/candidates?jd=${roleId}`)).body?.candidates ?? [];
note(`candidates ranked for the public role: ${roleList.map(c => `${c.display_name}(share=${c.can_share})`).join(", ")}`);
const pool = roleList.filter(c => Number(c.can_share) && !Number(c.in_pipeline));
void D;
if (pool[0]) await step("F10.1", "offer declined: reason required, stored, candidate closed for the client, interviews cancelled", async () => {
  const id = await fastTo(pool[0], "offered");
  const no = await clientOwner.post("/api/portal/company/pipeline-stage", { pipelineId: id, stage: "offer_declined" });
  const yes = await clientOwner.post("/api/portal/company/pipeline-stage", { pipelineId: id, stage: "offer_declined", reason: "better_offer", note: "Joined a competitor" });
  const p = row("SELECT stage, stage_reason FROM pipeline WHERE id = ?", id);
  return no.status === 400 && yes.ok && p.stage === "offer_declined" && p.stage_reason.startsWith("better_offer");
}, { severity: "high" });
if (pool[1]) await step("F10.2", "did not join: from 'Offer accepted', reason required and stored; counted on the client's dashboard", async () => {
  const id = await fastTo(pool[1], "offer_accepted");
  const yes = await clientOwner.post("/api/portal/company/pipeline-stage", { pipelineId: id, stage: "no_show", reason: "unreachable" });
  const p = row("SELECT stage FROM pipeline WHERE id = ?", id);
  const m = (await clientOwner.get("/api/portal/company/dashboard")).body?.overview?.metrics;
  if (count("placements", "pipeline_id = ?", id) !== 0) throw new Error("a placement was created for someone who did not join");
  return yes.ok && p.stage === "no_show" && m?.noShows >= 1;
}, { severity: "high" });
if (pool[2]) await step("F10.3", "withdrawn after shortlisting: reason required and stored", async () => {
  const id = await fastTo(pool[2], "shortlisted");
  const yes = await recruiter.post("/api/platform/recruiting/stage", { pipelineId: id, stage: "withdrawn", reason: "candidate_withdrew", note: "Took another job" });
  return yes.ok && row("SELECT stage FROM pipeline WHERE id = ?", id).stage === "withdrawn";
}, { severity: "high" });
if (pool[4]) {
  // An offer recorded without a salary, taken through to joining.
  const sub = await admin.post("/api/platform/recruiting/submit", { jdId: roleId, candidateId: pool[4].candidate_id, note: "For the junior role." });
  const id = sub.body?.id, move = (stage, extra = {}) => clientOwner.post("/api/portal/company/pipeline-stage", { pipelineId: id, stage, ...extra });
  await move("shortlisted"); const offer = await move("offered"); await move("offer_accepted", { joiningDate: today }); const joined = await move("joined", { joiningDate: today });
  const pl = row("SELECT ctc_inr, fee_inr, fee_percent FROM placements WHERE pipeline_id = ?", id ?? "");
  if (offer.ok && joined.ok && pl && pl.fee_inr == null) finding("F10.3b", { severity: "high", kind: "defect", title: "A placement can be recorded with no salary and therefore no fee, and it cannot be corrected afterwards", actual: `The offered salary is optional on both the client's and the recruiter's "Offer made" form, and "Joined" asks only for a date. An offer saved without a salary and then marked joined produced a placement with salary ${pl.ctc_inr === null ? "empty" : pl.ctc_inr} and fee ${pl.fee_inr === null ? "empty" : pl.fee_inr} (at ${pl.fee_percent}%). No screen can edit a placement's salary or fee later: the owner console changes only its status and note. The fee is the whole revenue of the placement-fee model.`, expected: "The salary is required before a candidate can be marked \"Joined\" (ask for it on the Joined form if it was not given at offer), and the owner can correct a placement's salary and fee with a reason.", fix: "In moveStage() (lib/portal/client.ts) refuse `joined` when offer_ctc_inr is null unless the request carries it; add the field to both Joined forms; add a `placement-edit` owner action that updates ctc_inr and recomputes fee_inr, with an audit entry.", where: "lib/portal/client.ts moveStage; app/company/company-app.tsx StageForm; app/platform/recruiting/recruiting.tsx; app/api/admin/portal/[action]/route.ts" });
  else check("F10.3b", "a candidate cannot be marked joined without a salary on record", !joined.ok || (pl && pl.fee_inr != null), { severity: "high", detail: `offer ${offer.status}, joined ${joined.status}, ${JSON.stringify(pl ?? null)}` });
}
{
  // A candidate still at "submitted" cannot be withdrawn.
  const fresh = (await admin.get(`/api/platform/recruiting/candidates?jd=${roleId}`)).body?.candidates?.find(c => Number(c.can_share) && !Number(c.in_pipeline));
  if (fresh) {
    const sub = await admin.post("/api/platform/recruiting/submit", { jdId: roleId, candidateId: fresh.candidate_id, note: "Just submitted." });
    const w = await recruiter.post("/api/platform/recruiting/stage", { pipelineId: sub.body?.id, stage: "withdrawn", reason: "candidate_withdrew" });
    if (w.status === 400) finding("F10.4", { severity: "medium", kind: "gap", title: "A candidate who has just been submitted cannot be withdrawn", actual: `From "Submitted by Jobboard300" the only moves are "Shortlisted" or "Not selected". If the candidate calls the recruiter to pull out before the client has reviewed them, the recruiter cannot record a withdrawal (${w.body?.error ?? w.status}); the only option is to wait for the client or mis-record it as the client's rejection.`, expected: "\"Withdrawn\" (candidate withdrew / position closed) is available from every open stage, including Submitted and Offer accepted.", fix: "Add \"withdrawn\" to NEXT.submitted and NEXT.offer_accepted in lib/portal/client.ts.", where: "lib/portal/client.ts NEXT" });
    saveState({ submittedPipelineId: sub.body?.id });
  }
}
if (placementId) {
  const badDate = await clientOwner.post("/api/portal/company/placement-exit", { placementId, leftOn: "2020-01-01", note: "x" });
  const exit = await clientOwner.post("/api/portal/company/placement-exit", { placementId, leftOn: today, note: "Left without notice" });
  const pl = row("SELECT status, left_on, note FROM placements WHERE id = ?", placementId);
  check("F10.5", "the client reports an early exit; inside the guarantee it becomes 'replacement due'", badDate.status === 400 && exit.ok && exit.body.inGuarantee === true && pl?.status === "left_in_guarantee" && pl.left_on === today, { severity: "high", detail: `${badDate.status}/${exit.status} ${JSON.stringify(pl ?? null)}` });
  const ov = (await owner.get("/api/admin/portal/overview")).body?.clientWork?.placements?.find(x => x.id === placementId);
  check("F10.6", "the owner console shows the placement as left inside the guarantee", ov?.status === "left_in_guarantee", { severity: "high" });
  const flagged = (await admin.get(`/api/platform/recruiting/candidates?jd=${roleId}`)).body?.candidates?.find(c => c.candidate_id === A.candidate_id);
  check("F10.7", "the early exit is marked for staff on the candidate's later shortlists", !flagged || Number(flagged.early_exits) >= 1, { severity: "medium", detail: flagged ? `early_exits ${flagged.early_exits}` : "candidate not ranked for the other role" });
  const jdNow = row("SELECT status FROM jds WHERE id = ?", jdId)?.status;
  const staffSees = (await recruiter.get("/api/platform/recruiting/work")).text;
  if (!/replacement/i.test(staffSees)) finding("F10.8", { severity: "high", kind: "gap", title: "A replacement that is due is not tracked anywhere a recruiter works", actual: `The client reports an exit inside the guarantee and is told "Jobboard300 will contact you about a replacement". After that: the recruiter sees nothing in the Recruiting tool, the job (status "${jdNow}") is not re-opened or flagged, nobody is notified, and the only trace is a status on the owner console's placements table, where the owner can manually set "replaced". A replacement hire is not linked to the placement it replaces, and its fee is calculated again as if it were a new placement.`, expected: "An exit inside the guarantee creates a visible replacement task for the client's team: the job re-opens (or a linked replacement job is created), the new hire is linked to the original placement, and its fee is zero or as the contract says.", fix: "In reportPlacementExit(): when inGuarantee, re-open the job (status 'live', openings += 1 or a `replacement_for` column on pipeline/placements), notify the team, and in moveStage('joined') set fee_inr = 0 and mark the old placement 'replaced' when the new placement has `replacement_for`.", where: "lib/portal/client.ts reportPlacementExit, moveStage" });
  const st = await owner.post("/api/admin/portal/placement-status", { placementId, status: "replaced", note: "Replacement joined" });
  check("F10.9", "the owner records the placement as replaced", st.ok && row("SELECT status FROM placements WHERE id = ?", placementId)?.status === "replaced", { severity: "medium", detail: `status ${st.status}` });
}

// ------------------------------------------------------------------ 11. assessments and Fast Track
section("11. Assessments: question banks, Fast Track order, technical test, invited test");
let invitedEntry;
{
  const answerAll = async (answer, first) => { let stepNow = first, n = 0; while (stepNow?.state === "question" && n < 40) { stepNow = await answer(); n++; } return { last: stepNow, n }; };
  const load = await admin.post("/api/platform/assessments/sample-load", {});
  const banks = (await admin.get("/api/platform/assessments/banks")).body?.banks ?? [];
  check("F11.1", "the administrator loads the sample question banks and they are stored live", load.status === 201 && banks.length >= 2 && count("question_banks", "status = 'active'") >= 2 && count("bank_questions") >= 40, { severity: "high", detail: `${load.status} ${banks.map(b => `${b.kind}:${b.title}`).join(", ")}` });
  check("F11.2", "a recruiter without the Assessments tool cannot open the banks", (await recruiter.get("/api/platform/assessments/banks")).status === 403, { severity: "high" });
  const set = await admin.post("/api/platform/assessments/fast-track-settings", { priceInr: 499, payNote: "Pay by UPI to jobboard300@example and quote your reference." });
  check("F11.3", "the administrator sets the Fast Track price and payment instructions", set.ok && row("SELECT value FROM portal_settings WHERE key = 'fast_track_price_inr'")?.value === "499", { severity: "medium", detail: `status ${set.status}` });
  const person = candidates.find(c => c.id !== A?.candidate_id) ?? candidates[0];
  if (person) {
    // Pilot rule (11 Nov 2026): Fast Track is not offered, and a paid test never changes selection.
    const reqFt = await person.session.post("/api/portal/candidate/fasttrack-request", {});
    check("F11.4", "Fast Track is not offered during the pilot: the request is refused and no order is stored", reqFt.status === 409 && reqFt.body?.code === "NOT_OFFERED" && !row("SELECT id FROM orders WHERE candidate_id = ? AND kind = 'fast_track'", person.id), { severity: "high", detail: `${reqFt.status} ${reqFt.text.slice(0, 120)}` });
    const tests = (await person.session.get("/api/portal/candidate/tests")).body;
    const early = await person.session.post("/api/portal/candidate/test-start", { bankId: banks.find(b => b.kind === "technical")?.id });
    check("F11.6", "the candidate's test page does not offer Fast Track, and a technical test cannot be started", tests?.fastTrackOffered === false && tests?.fastTrack === false && !early.ok, { severity: "high", detail: `offered ${tests?.fastTrackOffered}, start -> ${early.status}` });
  }
  // A test sent by a recruiter for a job, taken through a one-time link with no account.
  const spare = ((await admin.get(`/api/platform/recruiting/candidates?jd=${jdId}`)).body?.candidates ?? []).find(c => Number(c.can_share) && !Number(c.in_pipeline) && Number(c.hard_pass));
  if (spare) {
    const sub = await admin.post("/api/platform/recruiting/submit", { jdId, candidateId: spare.candidate_id, note: "Second candidate for the role." });
    invitedEntry = { id: sub.body?.id, candidate_id: spare.candidate_id, name: spare.display_name };
    const none = (await recruiter.get(`/api/platform/recruiting/pipeline?jd=${jdId}`)).body?.tests;
    const recruiterOpt = await recruiter.post("/api/platform/recruiting/job-aptitude", { jdId, on: true });
    const opt = await admin.post("/api/platform/recruiting/job-aptitude", { jdId, on: true });
    check("F11.13", "only a manager or administrator records that the client opted for the aptitude test", none?.aptitudeOpted === false && recruiterOpt.status === 403 && opt.ok && Number(row("SELECT aptitude_test FROM jds WHERE id = ?", jdId).aptitude_test) === 1, { severity: "medium", detail: `${recruiterOpt.status}/${opt.status}` });
    const offered = (await recruiter.get(`/api/platform/recruiting/pipeline?jd=${jdId}`)).body?.tests?.banks ?? [];
    const inv = offered[0] ? await recruiter.post("/api/platform/recruiting/test-invite", { pipelineId: invitedEntry.id, bankId: offered[0].id }) : null;
    check("F11.14", "the recruiter sends the aptitude test to a candidate in the pipeline and gets a one-time link", inv?.status === 201 && /\/test\?token=[a-f0-9]{64}$/.test(inv.body?.link ?? ""), { severity: "high", detail: `${inv?.status} ${inv?.text.slice(0, 160)} banks offered: ${offered.length}` });
    if (inv?.body?.link) {
      const token = new URL(inv.body.link).searchParams.get("token");
      const page = await anon.get(`/test?token=${token}`), ready = await anon.get(`/api/portal/public/test?token=${token}`);
      const start = await anon.post("/api/portal/public/test-start", { token });
      const run = await answerAll(async () => (await anon.post("/api/portal/public/test-answer", { token, choice: 1 })).body, start.body);
      const t = row("SELECT status, final_level, band FROM adaptive_tests WHERE candidate_id = ? AND jd_id = ?", spare.candidate_id, jdId);
      check("F11.15", "the candidate takes the test from the link without an account; the result is stored", page.status === 200 && ready.body?.state === "ready" && run.last?.state === "done" && t?.status === "completed", { severity: "high", detail: `page ${page.status}, ready ${ready.body?.state}, last ${run.last?.state}, ${JSON.stringify(t ?? null)}` });
      const staffE = (await recruiter.get(`/api/platform/recruiting/pipeline?jd=${jdId}`)).body?.pipeline?.find(e => e.id === invitedEntry.id);
      check("F11.16", "the recruiter sees the result on the pipeline", staffE?.tests?.[0]?.status === "completed" && staffE.tests[0].level === t?.final_level, { severity: "high", detail: JSON.stringify(staffE?.tests ?? null) });
      const clientText = (await clientOwner.get(`/api/portal/company/pipeline?jd=${jdId}`)).text + (await clientOwner.get("/api/portal/company/dashboard")).text;
      check("F11.17", "the client never sees test levels or bands", !/final_level|"band"|"level"/.test(clientText), { severity: "blocker", title: "Test levels are exposed to the client" });
      const dupInv = await recruiter.post("/api/platform/recruiting/test-invite", { pipelineId: invitedEntry.id, bankId: offered[0].id });
      check("F11.18", "the same test cannot be sent twice for the same job", dupInv.status === 409, { severity: "low", detail: `status ${dupInv.status}` });
    }
    if (!new URL(inv?.body?.link ?? `${BASE}/x`).origin.startsWith(BASE)) finding("F11.19", { severity: "high", kind: "defect", title: "Test and commitment links always point at one hard-coded address", actual: `Links sent to candidates are built from a constant (lib/site.ts SITE_URL = ${new URL(inv?.body?.link ?? "http://x").origin}), not from the site that issued them. Staff invitation and client invitation links use the request's own address. On any other address (a custom domain such as jobboard300.com, a preview, a local run) every test link and commitment link sends the candidate to the wrong site, where the token does not exist.`, expected: "Candidate links use the same origin as the request, or one configured public URL that is set per environment.", fix: "Pass the request origin into inviteToTest(), createCommitment() and reissueCommitmentLink() (as linkUrl() does for staff links), or read SITE_URL from an environment variable with the constant as the fallback.", where: "lib/site.ts; lib/portal/adaptive.ts inviteToTest; lib/portal/commitment.ts" });
  }
}

// ------------------------------------------------------------------ 12. consent, deletion
section("12. Consent withdrawal and deletion flow through to every screen");
{
  // A candidate with an open pipeline entry withdraws sharing consent.
  const open = rows("SELECT p.id, p.jd_id, p.candidate_id, p.candidate_ref, p.stage FROM pipeline p WHERE p.company_id = ? AND p.stage IN ('submitted','shortlisted','interview') ORDER BY p.jd_id = ? DESC", companyId, roleId).map(p => ({ ...p, known: cand(p.candidate_id) })).find(p => p.known && p.id !== invitedEntry?.id);
  if (open) {
    // "Hide my profile from this employer" while that employer already has the profile.
    const clientName = `${seedCo.displayName} ${S}`;
    const hide = await open.known.session.post("/api/portal/candidate/block", { name: clientName, block: true });
    const stillOpen = await clientOwner.get(`/api/portal/company/candidate?ref=${open.candidate_ref}`);
    if (hide.ok && stillOpen.status === 200) finding("F12.0", { severity: "high", kind: "defect", title: "\"Hide my profile from this employer\" does not take the profile away from an employer who already has it", actual: `A candidate in this client's pipeline typed the client's name under "Hide my profile from specific companies" and was told: "${hide.body?.message ?? ""}". The client can still open the candidate's full profile and download the CV (${stillOpen.status}), and the pipeline entry stays open. The hide only stops future submissions.`, expected: "Hiding from an employer who already has the profile ends that employer's access at once and closes the open pipeline entry as withdrawn, the same as withdrawing consent for that one employer; or the screen says plainly that it only applies from now on and offers \"Stop sharing\" for the rest.", fix: "In the `block` action (app/api/portal/candidate/[action]/route.ts) also set unlocks.access_revoked_at for that company, close its open pipeline rows (withdrawn / candidate_withdrew) and notify the company, reusing the per-company part of withdrawSharing().", where: "app/api/portal/candidate/[action]/route.ts block; lib/portal/consent.ts" });
    else check("F12.0", "hiding from an employer who already has the profile ends that employer's access", !hide.ok || stillOpen.status !== 200, { severity: "high", detail: `hide ${hide.status}, profile ${stillOpen.status}` });
    await open.known.session.post("/api/portal/candidate/block", { name: clientName, block: false });
    const iv = open.stage === "submitted" ? null : await clientOwner.post("/api/portal/company/interview-schedule", { pipelineId: open.id, round: "Technical 1", scheduledAt: inDays(3), mode: "phone" });
    const w = await open.known.session.post("/api/portal/candidate/consent", { purpose: "share_with_companies", grant: false });
    const pv = (await clientOwner.get("/api/portal/company/pipeline")).body?.pipeline?.find(e => e.id === open.id);
    check("F12.1", "a candidate turns sharing off: the client at once loses the name, the note and the profile", w.ok && pv?.available === false && /withdrew consent/i.test(pv.name) && (await clientOwner.get(`/api/portal/company/candidate?ref=${open.candidate_ref}`)).status !== 200, { severity: "blocker", detail: `${w.status} ${JSON.stringify(pv ? { name: pv.name, available: pv.available } : null)}`, title: "After a candidate withdraws consent the client can still see their profile" });
    const p = row("SELECT stage, stage_reason FROM pipeline WHERE id = ?", open.id);
    check("F12.2", "their open pipeline entries are closed as 'Withdrawn (consent withdrawn)' and scheduled interviews cancelled", p?.stage === "withdrawn" && p.stage_reason === "consent_withdrawn" && (!iv?.body?.id || row("SELECT status FROM interviews WHERE id = ?", iv.body.id)?.status === "cancelled"), { severity: "high", detail: JSON.stringify(p ?? null) });
    check("F12.3", "the withdrawal is in the consent ledger", rows("SELECT action FROM candidate_consents WHERE candidate_id = ? AND purpose = 'share_with_companies' ORDER BY at DESC LIMIT 1", open.candidate_id)[0]?.action === "withdrawn", { severity: "high" });
    if (count("pipeline_events", "pipeline_id = ? AND stage = 'withdrawn'", open.id) === 0) finding("F12.4", { severity: "low", kind: "defect", title: "A consent withdrawal changes the pipeline stage without writing the pipeline history", actual: "The entry moves to \"Withdrawn\" but no pipeline_events row is written, so the stage history (used for hiring-speed figures and any later dispute) shows the candidate still at their earlier stage, and the client and recruiter get no update that the candidate left the process.", expected: "Every stage change writes a history row and tells the recruiter.", fix: "In withdrawSharing() (lib/portal/consent.ts) insert a pipeline_events row (stage 'withdrawn', actor 'candidate') for each row it closes, and notify the client and team.", where: "lib/portal/consent.ts withdrawSharing" });
    // The candidate changes their mind.
    const back = await open.known.session.post("/api/portal/candidate/consent", { purpose: "share_with_companies", grant: true });
    await owner.post("/api/admin/portal/run-queue", {});
    const other = open.jd_id === jdId ? roleId : jdId;
    const again = await admin.post("/api/platform/recruiting/submit", { jdId: other, candidateId: open.candidate_id, note: "Candidate asked to be considered again." });
    const ranked = ((await admin.get(`/api/platform/recruiting/candidates?jd=${other}`)).body?.candidates ?? []).find(c => c.candidate_id === open.candidate_id);
    if (back.ok && !again.ok && again.status !== 409) finding("F12.5", { severity: "high", kind: "defect", title: "A candidate who withdrew consent once can never be put forward to that client again, even after allowing sharing again", actual: `The candidate clicked "Stop sharing now", then "Allow sharing". Their page says sharing is On and they are ranked again for the client's other job (${ranked ? `shown, can_share=${ranked.can_share}` : "not ranked"}), but submitting them is refused for ever: ${again.status} "${again.body?.error ?? ""}". Nothing on the recruiter's card warns of this before they write the note and press Submit.`, expected: "A fresh grant of consent makes the person submittable again (a new sharing record, the old one kept as history), or the shortlist says plainly \"withdrew consent for this client on <date>\" and offers no Submit button.", fix: "In submitByRecruiter() (lib/portal/client.ts), when unlocks.access_revoked_at is set but consent is active again (granted after the revocation), clear access_revoked_at (or insert a new unlock) and continue; add `revoked_for_client` to submissionCandidates() so the card can say so.", where: "lib/portal/client.ts submitByRecruiter; lib/portal/consent.ts" });
    else check("F12.5", "after allowing sharing again the candidate can be submitted to that client", again.status === 201 || again.status === 409, { severity: "high", detail: `${again.status} ${again.text.slice(0, 160)}` });
  }
  // Account deletion.
  const victim = candidates.find(c => count("pipeline", "candidate_id = ?", c.id) === 0) ?? candidates[candidates.length - 1];
  if (victim) {
    const wrong = await victim.session.post("/api/portal/candidate/delete", { confirm: "delete" });
    const exp = await victim.session.get("/api/portal/candidate/export");
    check("F12.6", "the candidate downloads their data before deleting", exp.ok && exp.text.includes("consents"), { severity: "medium" });
    const del = await victim.session.post("/api/portal/candidate/delete", { confirm: "DELETE" });
    const k = row("SELECT status, display_name, email, phone FROM candidates WHERE id = ?", victim.id);
    check("F12.7", "deleting the account needs the word DELETE, then removes the name, email, phone and CV records", wrong.status === 400 && del.ok && (!k || (k.status !== "active" && !k.email && !k.phone && k.display_name !== victim.name)) && count("cvs", "candidate_id = ?", victim.id) === 0, { severity: "blocker", detail: `${wrong.status}/${del.status} ${JSON.stringify(k ?? null)}`, title: "Deleting a candidate account leaves personal data behind" });
    const leftovers = tables().flatMap(t => { try { return rows(`SELECT * FROM "${t}"`).some(r => JSON.stringify(r).includes(victim.email)) ? [t] : []; } catch { return []; } });
    check("F12.8", "after deletion the person's email is in no table at all", leftovers.length === 0, { severity: "blocker", detail: `found in: ${leftovers.join(", ")}`, title: "A deleted candidate's email remains in the database" });
    const back = await (await fresh()).post("/api/portal/auth/sign-in", { email: victim.email, password: PASSWORD });
    check("F12.9", "the deleted account can no longer sign in", back.status === 401 || back.status === 403, { severity: "high", detail: `status ${back.status}` });
    check("F12.10", "the deleted candidate no longer appears in any recruiter's ranked list", !((await admin.get(`/api/platform/recruiting/candidates?jd=${jdId}`)).body?.candidates ?? []).some(c => c.candidate_id === victim.id), { severity: "high" });
    victim.deleted = true;
  }
  // Verified deletion request for a website applicant (no login).
  if (webGeneral?.appId) {
    const pr = await anon.post("/api/privacy-requests", { requestType: "deletion", requesterName: webGeneral.name, email: webGeneral.email, details: "Please delete my data." });
    const id = row("SELECT id FROM privacy_requests WHERE email = ? AND request_type = 'deletion'", webGeneral.email)?.id;
    const done = await owner.patch(`/api/admin/privacy-requests/${id}`, { status: "completed", resolutionNote: "Verified by call-back; erased.", identityVerified: true, erase: true });
    const leftovers = tables().flatMap(t => { try { return rows(`SELECT * FROM "${t}"`).some(r => t !== "privacy_requests" && JSON.stringify(r).includes(webGeneral.email)) ? [t] : []; } catch { return []; } });
    check("F12.11", "a verified deletion request erases a website applicant everywhere (application, candidate record, CV)", pr.status === 201 && done.ok && count("applications", "id = ?", webGeneral.appId) === 0 && leftovers.length === 0, { severity: "blocker", detail: `${done.status} ${done.text.slice(0, 160)} leftovers: ${leftovers.join(", ")}`, title: "A verified deletion request does not erase all of the person's data" });
    check("F12.12", "the erased applicant's CV can no longer be downloaded", (await owner.get(`/api/admin/resumes/${webGeneral.appId}`)).status === 404, { severity: "high" });
  }
}

// ------------------------------------------------------------------ 13. editing and closing a job
section("13. Editing a live job, and closing a job");
{
  // "Save changes" exactly as the client's job editor sends it, with nothing changed.
  const before = row("SELECT title, status, requirements FROM jds WHERE id = ?", jdId);
  const r0 = JSON.parse(before.requirements), names = xs => (xs ?? []).map(x => x.name).join(", ");
  const editorPayload = { title: r0.title, mustHave: names(r0.mustHave), niceToHave: names(r0.niceToHave), minYears: r0.minYears, maxYears: r0.maxYears, educationLevel: r0.educationLevel || null,
    hard: { cities: (r0.hard?.cities ?? []).join(", "), remote: !!r0.hard?.remote, allowRelocation: !!r0.hard?.allowRelocation, mandatorySkills: names(r0.hard?.mandatorySkills), maxNoticeDays: r0.hard?.maxNoticeDays ?? null, ctcMinInr: r0.hard?.ctcMinInr ?? null, ctcMaxInr: r0.hard?.ctcMaxInr ?? null } };
  const inProcess = count("pipeline", "jd_id = ? AND stage IN ('submitted','shortlisted','interview','offered','offer_accepted')", jdId);
  const save = await clientOwner.post("/api/portal/company/jd-update", { jdId, requirements: editorPayload });
  const after = row("SELECT status, requirements FROM jds WHERE id = ?", jdId), r1 = JSON.parse(after.requirements);
  const listed = !!(await recruiter.get("/api/platform/recruiting/work")).body?.jobs?.some(j => j.id === jdId);
  if (save.ok && before.status === "live" && after.status !== "live") finding("F13.1", { severity: "high", kind: "defect", title: "Pressing \"Save changes\" on a live job takes it offline and hides it, and its candidates, from recruiters", actual: `The client opened a live job with ${inProcess} candidate(s) in process and pressed "Save changes" without changing anything. The job went from "live" to "${after.status}" (not to "waiting for approval": the client must also find and press "Submit for approval", then the owner must approve again). While it is a draft the job is ${listed ? "still" : "no longer"} listed in the Recruiting tool, so recruiters cannot open its pipeline, schedule interviews or update stages for the candidates already in process, and new submissions are refused. The save also uses up one of the three requirement changes allowed in 30 days. The screen only says "Editing a live job sends it back to Jobboard300 for approval".`, expected: "Saving with no change does nothing. A real change to a live job goes straight to \"waiting for approval\" (one step), the job stays visible to its recruiters with its pipeline workable, and the client confirms before it happens.", fix: "In updateJdRequirements() (lib/portal/company.ts): return early when the sanitised requirements equal the stored ones; set status 'pending' (not 'draft') for a job that was live and notify the owner; in staffWork() (lib/portal/staff.ts) keep listing jobs that have open pipeline rows whatever their status.", where: "lib/portal/company.ts updateJdRequirements; lib/portal/staff.ts staffWork; app/company/company-app.tsx JdEditor" });
  else check("F13.1", "saving a live job without changes leaves it live", save.ok && after.status === "live", { severity: "high", detail: `${save.status} ${save.text.slice(0, 160)}` });
  const lost = ["location", "workMode", "roleFamily"].filter(k => r0[k] && r0[k] !== r1[k]).map(k => `${k}: "${r0[k]}" -> "${r1[k] ?? ""}"`);
  if ((r0.hard?.seniority?.length ?? 0) && !(r1.hard?.seniority?.length ?? 0)) lost.push(`seniority: [${r0.hard.seniority}] -> []`);
  if ((r0.educationFields?.length ?? 0) && !(r1.educationFields?.length ?? 0)) lost.push(`educationFields: [${r0.educationFields}] -> []`);
  if (save.ok && lost.length) finding("F13.2", { severity: "high", kind: "defect", title: "Saving the job editor silently erases details it does not show", actual: `After a save with nothing changed, the stored requirements lost: ${lost.join("; ")}. The editor has no field for these, sends the form without them, and the server rebuilds the requirements from what was sent. Location and seniority are hard filters for matching, so the ranking for the job changes without anyone having chosen that.`, expected: "A save changes only the fields on the form; everything else is kept.", fix: "In updateJdRequirements() merge the input over the stored requirements ({ ...stored, ...input, hard: { ...stored.hard, ...input.hard } }) before sanitising; also update jds.title when the title field changes.", where: "lib/portal/company.ts updateJdRequirements; lib/portal/jd.ts sanitisePortalRequirements; app/company/company-app.tsx JdEditor.save" });
  // Put the job back live for the closing checks.
  if (after.status !== "live") { await clientOwner.post("/api/portal/company/jd-submit", { jdId }); await owner.post("/api/admin/portal/jd-decide", { jdId, approve: true }); }
  check("F13.3", "after re-submission and approval the job is live again and back in the Recruiting tool", row("SELECT status FROM jds WHERE id = ?", jdId)?.status === "live" && !!(await recruiter.get("/api/platform/recruiting/work")).body?.jobs?.some(j => j.id === jdId), { severity: "high" });

  // The client closes a job that still has people in process.
  const openRows = rows("SELECT p.id, p.candidate_id, p.candidate_ref, p.stage FROM pipeline p WHERE p.jd_id = ? AND p.stage IN ('submitted','shortlisted','interview','offered','offer_accepted')", jdId);
  const msgsBefore = count("messages");
  const close = await clientOwner.post("/api/portal/company/jd-close", { jdId });
  check("F13.4", "the client closes the job; it is stored closed", close.ok && row("SELECT status FROM jds WHERE id = ?", jdId)?.status === "closed", { severity: "high", detail: `status ${close.status}` });
  if (close.ok && openRows.length) {
    const still = rows("SELECT stage FROM pipeline WHERE jd_id = ? AND stage IN ('submitted','shortlisted','interview','offered','offer_accepted')", jdId).length;
    const cv = (await clientOwner.get("/api/portal/company/pipeline")).body?.pipeline?.find(e => e.id === openRows[0].id);
    const profile = await clientOwner.get(`/api/portal/company/candidate?ref=${openRows[0].candidate_ref}`);
    const staff = await recruiter.get(`/api/platform/recruiting/pipeline?jd=${jdId}`), staffListed = !!(await recruiter.get("/api/platform/recruiting/work")).body?.jobs?.some(j => j.id === jdId);
    const reopen = await clientOwner.post("/api/portal/company/jd-submit", { jdId });
    if (still) finding("F13.5", { severity: "high", kind: "gap", title: "Closing a job strands the candidates who were in process on it, and a closed job cannot be re-opened", actual: `The client closed a job with ${openRows.length} candidate(s) in process (one click and a "Close this job?" prompt). Afterwards: ${still} pipeline entr${still === 1 ? "y keeps its" : "ies keep their"} open stage for ever; ${msgsBefore === count("messages") ? "no message is sent to the candidates or to Jobboard300" : "some messages were sent"}; the job is ${staffListed ? "still" : "no longer"} in the recruiter's job list (the list holds only live, pending and paused jobs), so staff cannot open that pipeline from the screen; the client still sees the candidate under "In process" with ${cv?.next?.length ?? 0} stage action(s) and a "Profile" button that now answers ${profile.status} "${profile.body?.error ?? ""}". The job also disappears from the client's own job list, and trying to re-open it answers ${reopen.status} "${reopen.body?.error ?? ""}".`, expected: "Closing asks what to do with the open candidates and by default closes each as \"Withdrawn (position closed)\", telling the candidate and the recruiter. Closed jobs stay visible (read-only, under a \"Closed\" filter) to the client and to staff, and can be re-opened through approval.", fix: "In jd-close (app/api/portal/company/[action]/route.ts) and syncRoleStatus() (lib/portal/vacancy.ts): move open pipeline rows to 'withdrawn' / 'position_closed' through moveStage() so history and notifications fire, and notify the team. Allow submitJd() from 'closed'. Add a status filter to staffWork(), companyDashboard() and clientOverview() instead of excluding closed jobs.", where: "app/api/portal/company/[action]/route.ts jd-close; lib/portal/vacancy.ts; lib/portal/staff.ts staffWork; lib/portal/views.ts companyDashboard" });
    note(`after client close: staff pipeline api -> ${staff.status}, listed=${staffListed}, client profile -> ${profile.status}, reopen -> ${reopen.status}`);
  }
  // The owner closes and re-publishes a public role.
  const closeRole = await owner.patch(`/api/admin/jobs/${roleId}`, { status: "closed" });
  check("F13.6", "the owner closes the public role: it leaves the website, stays on the recruiter's list only as closed (read-only), and its page stops loading", closeRole.ok && !(await anon.get("/api/jobs")).body?.jobs?.some(j => j.id === roleId) && ((await recruiter.get("/api/platform/recruiting/work")).body?.jobs ?? []).filter(j => j.id === roleId).every(j => j.status === "closed") && row("SELECT status FROM jds WHERE id = ?", roleId)?.status === "closed" && (await anon.get(`/jobs/${roleId}`)).status === 404, { severity: "high", detail: `status ${closeRole.status}` });
  const reopenRole = await owner.patch(`/api/admin/jobs/${roleId}`, { status: "published" });
  const st = row("SELECT status FROM jds WHERE id = ?", roleId)?.status;
  check("F13.7", "a closed public role can be published again and returns to the Recruiting tool", reopenRole.ok && st === "live" && !!(await anon.get("/api/jobs")).body?.jobs?.some(j => j.id === roleId), { severity: "medium", detail: `${reopenRole.status} jds.status=${st}` });
}

// ------------------------------------------------------------------ 14. access control spot checks
section("14. Who can reach what");
{
  const nobody = await fresh();
  const gets = ["/api/admin/jobs", "/api/admin/records", "/api/admin/privacy-requests", "/api/admin/portal/overview", "/api/platform/recruiting/work", "/api/platform/admin/users", "/api/platform/admin/operations", "/api/platform/assessments/banks", "/api/platform/email-kit/state", "/api/portal/company/dashboard", "/api/portal/company/pipeline", "/api/portal/company/team", "/api/portal/candidate/profile", "/api/portal/candidate/inbox", "/api/portal/candidate/export"];
  const open = [];
  for (const p of gets) { const r = await nobody.get(p); if (![401, 403, 404].includes(r.status)) open.push(`${p} -> ${r.status}`); }
  check("F14.1", "every private API refuses a visitor who is not signed in", open.length === 0, { severity: "blocker", detail: open.join("; "), title: "A private API answers without sign-in" });
  const live = candidates.find(c => !c.deleted);
  const cross = [];
  for (const [who, c] of [["candidate", live?.session], ["client", clientOwner], ["recruiter", recruiter]]) {
    if (!c) continue;
    for (const p of ["/api/admin/records", "/api/admin/portal/overview", "/api/platform/admin/users", "/api/platform/admin/operations"]) { const r = await c.get(p); if (![401, 403, 404].includes(r.status)) cross.push(`${who} ${p} -> ${r.status}`); }
  }
  check("F14.2", "a candidate, a client and a recruiter cannot reach owner or administrator APIs", cross.length === 0, { severity: "blocker", detail: cross.join("; "), title: "A lower role can reach an owner or administrator API" });
  const evil = await clientOwner.post("/api/portal/company/jd-close", { jdId: roleId }, { headers: { origin: "https://evil.example" } });
  check("F14.3", "a change sent from another website is refused", evil.status === 403, { severity: "blocker", detail: `status ${evil.status}` });
  const moveOther = await otherClient.post("/api/portal/company/pipeline-stage", { pipelineId: A?.pipelineId, stage: "rejected", reason: "other" });
  check("F14.4", "one client cannot change another client's candidate", moveOther.status === 404, { severity: "blocker", detail: `status ${moveOther.status}` });
  // A suspended client signing in.
  const suspend = await owner.post("/api/admin/portal/company-status", { companyId: otherCompanyId, status: "suspended", note: "audit" });
  const bounced = await otherClient.get("/company"), again = await (await fresh()).post("/api/portal/auth/sign-in", { email: mail("other.owner"), password: PASSWORD });
  const landing = bounced.headers.location ? await nobody.get(new URL(bounced.headers.location, BASE).pathname + new URL(bounced.headers.location, BASE).search) : null;
  check("F14.6", "a suspended client can no longer open the hiring workspace or its data", suspend.ok && [302, 303, 307].includes(bounced.status) && (await otherClient.get("/api/portal/company/dashboard")).status !== 200, { severity: "blocker", detail: `${suspend.status}, /company -> ${bounced.status}` });
  if (again.ok && landing && !/not active|suspended|paused|contact jobboard300/i.test(landing.text.replace(/<script[\s\S]*?<\/script>/g, ""))) finding("F14.7", { severity: "medium", kind: "defect", title: "A suspended client is bounced between sign-in and the workspace with no explanation", actual: `After the owner suspends a client, its users can still sign in (the sign-in answers ${again.status}, "next: ${again.body?.next}"), are sent to /company, and are sent straight back to ${bounced.headers.location}. The sign-in page shows the empty form again and says nothing about the account being suspended, so the person signs in again, and again.`, expected: "\"This company account is not active. Contact Jobboard300.\" on the sign-in page, and the session ended.", fix: "Read `inactive=1` in app/portal/sign-in/page.tsx and show the message; in the sign-in action refuse company users whose company is not active.", where: "app/portal/sign-in/page.tsx; lib/portal/session.ts requirePage; lib/portal/accounts.ts signIn" });
  await owner.post("/api/admin/portal/company-status", { companyId: otherCompanyId, status: "active", note: "audit" });
  // Taking a recruiter out of a team while a job is assigned to them.
  const assign = await admin.post("/api/platform/recruiting/assign-recruiter", { jdId: roleId, userId: recruiterU.id });
  const out = await admin.post("/api/platform/admin/operations", { action: "team.unassign", id: teamId, userId: recruiterU.id });
  const left = row("SELECT recruiter_id FROM jds WHERE id = ?", roleId)?.recruiter_id;
  const mateSees = !!(await viewer.get("/api/platform/recruiting/work")).body?.jobs?.some(j => j.id === roleId), goneSees = !!(await recruiter.get("/api/platform/recruiting/work")).body?.jobs?.some(j => j.id === roleId);
  if (assign.ok && out.ok && left === recruiterU.id && !mateSees) finding("F14.8", { severity: "high", kind: "defect", title: "Removing a recruiter from a team in Operations leaves their jobs assigned to them, invisible to everyone else on the team", actual: `A live job was assigned to a recruiter. An administrator then removed that recruiter from the team under Operations (one click, no warning). The job is still assigned to them (recruiter_id unchanged); they can ${goneSees ? "still" : "no longer"} see it, and the rest of the team cannot see it either, because a job assigned to someone is hidden from other recruiters. Only an administrator can now see the job and its candidates. Deleting a team, or disabling a user, leaves the same orphans. (Removing someone from the team inside the Recruiting tool does clear the assignment; Operations does not.)`, expected: "Removing a person from a team, deleting a team or disabling a user clears their job assignments in that team (and says how many), so the jobs return to \"Unassigned\" for the team.", fix: "In app/api/platform/admin/operations/route.ts, add the same `UPDATE jds SET recruiter_id = NULL …` used by removeTeamMember() (lib/portal/staff.ts) to team.unassign and team.delete (which must also clear companies.team_id), and to the user-disable path in app/api/platform/admin/users/[id]/route.ts.", where: "app/api/platform/admin/operations/route.ts; app/api/platform/admin/users/[id]/route.ts" });
  else check("F14.8", "removing a recruiter from a team returns their jobs to the team", !assign.ok || !out.ok || left !== recruiterU.id || mateSees, { severity: "high", detail: `assign ${assign.status}, unassign ${out.status}, recruiter_id ${left}, team-mate sees the job: ${mateSees}` });
  // Put things back for the auditors that run next.
  await admin.post("/api/platform/admin/operations", { action: "team.assign", id: teamId, userId: recruiterU.id });
  await admin.post("/api/platform/recruiting/assign-recruiter", { jdId: roleId, userId: "" });
  for (const [path, label] of [["/admin", "owner console"], ["/platform", "Working Platform"], ["/platform/recruiting", "Recruiting tool"], ["/candidate", "candidate area"], ["/company", "client workspace"]]) {
    const r = await nobody.get(path);
    check(`F14.5.${path}`, `the ${label} page sends a visitor to sign-in`, [302, 303, 307, 308].includes(r.status) && /sign-?in/.test(r.headers.location ?? ""), { severity: "blocker", detail: `${r.status} ${r.headers.location ?? ""}` });
  }
}

saveState({ stamp: S, admin: ADMIN.email, recruiter: recruiterU?.email, outsider: outsiderU?.email, viewer: viewerU?.email, clientOwner: ENQ.email, otherClient: mail("other.owner"), candidate: candidates.find(c => !c.deleted)?.email, candidates: candidates.map(c => ({ email: c.email, name: c.name, id: c.id, deleted: !!c.deleted })), companyId, otherCompanyId, jdId, roleId, teamId, enquiryId, company: `${seedCo.displayName} ${S}` });
const result = R.save();
await browser.close();
process.exit(result.failed ? 1 : 0);
