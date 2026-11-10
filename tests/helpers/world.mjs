// A small, complete world for the tests: the real migrations in an in-memory
// SQLite database, the real domain modules and the real API route handlers.
// Two client companies, two candidates and two staff teams, each with their own
// data, so every test can ask "can A reach anything of B's?".
import { register } from "node:module";
import { resolve } from "node:path";
import { createD1 } from "../../scripts/lib/d1-sqlite.mjs";

register("./hooks.mjs", import.meta.url);

export const root = resolve(import.meta.dirname, "../..");
export const ORIGIN = "http://localhost:3000";
export const PASSWORD = "harbour lantern 4471 quiet";
export const SECRET = "test-secret-test-secret-test-secret-123";

// The code under test must behave as it does in production.
process.env.NODE_ENV = "production";

const lib = name => import(resolve(root, "lib", name));
export const route = path => import(resolve(root, "app/api", path, "route.ts"));

export const mods = {
  db: await lib("portal/db.ts"), accounts: await lib("portal/accounts.ts"), candidate: await lib("portal/candidate.ts"),
  company: await lib("portal/company.ts"), consent: await lib("portal/consent.ts"), client: await lib("portal/client.ts"),
  quota: await lib("portal/quota.ts"), website: await lib("portal/website.ts"), staff: await lib("portal/staff.ts"),
  views: await lib("portal/views.ts"), admin: await lib("admin.ts"), platformAuth: await lib("platform/auth.ts"),
};

export const PARAMS = { minScore: 70, roleFamilies: ["accounts-finance"], seniority: ["junior", "mid"], cities: ["Durgapur", "Asansol"], ctcBands: [{ minInr: 200000, maxInr: 600000 }], maxNoticeDays: 60, maxReleasePerJd: 5, maxLiveJds: 5 };
export const JD = { title: "Accounts Executive", location: "Durgapur, West Bengal", text: "We are hiring an Accounts Executive in Durgapur.\nRequirements: B.Com with 2-5 years of experience. Must have Tally, GST returns and bank reconciliation.\nSalary: 3 to 4.5 LPA. Notice period up to 30 days." };

export function profile(name, email, phone) {
  return {
    schemaVersion: "1.0", source: { method: "rules", model: null, fileName: "cv.pdf", fileType: "pdf", textCharacters: 3000, pages: 1, sha256: "x", extractedAt: new Date().toISOString(), engineVersion: "t" },
    contact: { name, email, phone, location: "Durgapur", links: [`linkedin.com/in/${name.replace(/\s/g, "").toLowerCase()}`] },
    headline: "Accounts Executive", summary: "", totalExperienceMonths: 54, statedExperienceYears: 4,
    work: [{ title: "Accounts Executive", employer: "Example Traders Pvt Ltd", location: "Durgapur", start: "2022-05", end: null, current: true, months: 54, highlights: ["Tally and GST"] }],
    education: [{ qualification: "B.Com", level: 4, field: "Commerce", institution: "Example University", year: 2021 }],
    skills: [{ id: "tally", name: "Tally", family: "accounting-software", evidence: "work", months: 54, lastUsedYear: 2026, snippet: "Tally" }, { id: "gst", name: "GST", family: "indirect-tax", evidence: "work", months: 54, lastUsedYear: 2026, snippet: "GST" }],
    certifications: [], languages: ["English"], noticePeriod: "30 days", currentCtc: "", expectedCtc: "", gaps: [], excludedPersonalFields: [], parse: { confidence: 0.9, sectionsFound: ["experience"], warnings: [] },
    india: { ctcCurrentInr: 360000, ctcExpectedInr: 420000, noticeDays: 30, currentCity: "Durgapur", preferredCities: [], willingToRelocate: false, seniority: "mid", yearsExperience: 4.5, roleFamily: "accounts-finance" },
    selfReported: [],
  };
}

/** In-memory stand-in for the private R2 bucket. */
export function bucket() {
  const store = new Map();
  return {
    store,
    async put(key, value) { store.set(key, value instanceof Uint8Array ? value : new Uint8Array(value)); },
    async get(key) { const v = store.get(key); return v ? { size: v.byteLength, body: v, arrayBuffer: async () => v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) } : null; },
    async delete(key) { store.delete(key); },
  };
}

export function freshDb() {
  const db = createD1(root);
  const BUCKET = bucket();
  globalThis.__TEST_ENV__ = { DB: db, BUCKET, PORTAL_SECRET: SECRET };
  globalThis.__TEST_HEADERS__ = undefined; globalThis.__TEST_COOKIES__ = undefined;
  return { db, BUCKET };
}

export async function makeCompany(db, name, ownerEmail) {
  const { accounts, company } = mods;
  const userId = await accounts.createAccount(db, "company_user", ownerEmail, PASSWORD);
  const id = await company.applyCompany(db, { accountId: userId, legalName: `${name} Pvt Ltd`, displayName: name, city: "Durgapur" });
  await company.activateCompany(db, id, PARAMS, "admin");
  await db.prepare("UPDATE portal_accounts SET status = 'active', email_verified_at = ? WHERE id = ?").bind(new Date().toISOString(), userId).run();
  const { id: jdId } = await company.createJd(db, id, userId, JD);
  await company.submitJd(db, id, jdId, userId);
  await company.decideJd(db, jdId, true, "admin");
  await db.prepare("UPDATE jds SET service = 'managed' WHERE id = ?").bind(jdId).run();
  return { id, userId, jdId, name, email: ownerEmail };
}

export async function makeCandidate(db, BUCKET, name, email, phone) {
  const { accounts, candidate, consent } = mods;
  const accountId = await accounts.createAccount(db, "candidate", email, PASSWORD, phone);
  await db.prepare("UPDATE portal_accounts SET status = 'active', email_verified_at = ? WHERE id = ?").bind(new Date().toISOString(), accountId).run();
  const id = await candidate.createCandidate(db, { accountId, displayName: name, email, phone, currentCity: "Durgapur" });
  await consent.recordConsent(db, id, "profile_processing", "granted");
  await consent.recordConsent(db, id, "share_with_companies", "granted");
  const r2Key = `portal-cv/${id}/one`;
  await BUCKET.put(r2Key, new TextEncoder().encode(`CV of ${name} ${email} ${phone}`));
  await candidate.addCv(db, id, { r2Key, fileName: "cv.pdf", fileType: "pdf", size: 1000, sha256: `sha-${id}`, text: `${name} accounts executive with tally gst and bank reconciliation in durgapur ${id}`, profile: profile(name, email, phone), parseOk: true });
  return { id, accountId, name, email, phone, r2Key };
}

/** Cookie for a portal account, obtained through the real sign-in route. */
export async function portalCookie(email) {
  const auth = await route("portal/auth/[action]");
  const res = await auth.POST(new Request(`${ORIGIN}/api/portal/auth/sign-in`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) }), { params: Promise.resolve({ action: "sign-in" }) });
  if (res.status !== 200) throw new Error(`sign-in failed for ${email}: ${res.status} ${await res.text()}`);
  return res.headers.get("set-cookie").split(";")[0];
}

export async function makeStaff(db, id, { admin = false, level = "edit", team = null, manager = false } = {}) {
  const at = new Date().toISOString();
  await db.prepare("INSERT INTO platform_users (id, email, name, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)").bind(id, `${id}@staff.example`, id, admin ? "admin" : "member", at, at).run();
  if (level) await db.prepare("INSERT INTO platform_tool_access (user_id, tool_key, level, granted_by, granted_at) VALUES (?, 'recruiting', ?, 'test', ?)").bind(id, level, at).run();
  if (team) await db.prepare("INSERT INTO platform_team_members (team_id, user_id, is_manager) VALUES (?, ?, ?)").bind(team, id, manager ? 1 : 0).run();
  return `wp_session=${await mods.platformAuth.createSession(id, "test")}`;
}

/** Call a route handler the way the framework does. */
export async function call(mod, method, path, { cookie, body, action, params, headers = {}, origin = ORIGIN } = {}) {
  const init = { method, headers: { ...(cookie ? { cookie } : {}), ...(method !== "GET" && origin ? { origin } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await mod[method](new Request(`${ORIGIN}${path}`, init), { params: Promise.resolve(params ?? { action }) });
  const text = await res.clone().text();
  let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, text, json, headers: res.headers };
}

/**
 * The standard world: company A (team one) with candidate Asha in its pipeline,
 * company B (team two) with candidate Bikram in its pipeline.
 */
export async function world() {
  const { db, BUCKET } = freshDb();
  await mods.quota.upsertPlans(db, [{ code: "free", name: "Free allowance", unlockQuota: 3, validityDays: 30, priceInr: 0, isFree: true }]);
  const A = await makeCompany(db, "Alpha Steel Works", "owner@alpha-steel.example");
  const B = await makeCompany(db, "Bravo Logistics", "owner@bravo-logistics.example");
  const asha = await makeCandidate(db, BUCKET, "Asha Mukherjee", "asha.mukherjee@person.example", "9830011111");
  const bikram = await makeCandidate(db, BUCKET, "Bikram Ghosh", "bikram.ghosh@person.example", "9830022222");
  const at = new Date().toISOString();
  for (const [teamId, company] of [["team-one", A], ["team-two", B]]) {
    await db.prepare("INSERT INTO platform_teams (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").bind(teamId, teamId, at, at).run();
    await db.prepare("UPDATE companies SET team_id = ? WHERE id = ?").bind(teamId, company.id).run();
  }
  const subA = await mods.client.submitByRecruiter(db, SECRET, { companyId: A.id, jdId: A.jdId, candidateId: asha.id, note: "Strong Tally and GST; 30 days notice." }, "admin-1");
  const subB = await mods.client.submitByRecruiter(db, SECRET, { companyId: B.id, jdId: B.jdId, candidateId: bikram.id, note: "Good fit for the Asansol branch." }, "admin-1");
  const pick = async (companyId) => db.prepare("SELECT id, candidate_ref FROM pipeline WHERE company_id = ?").bind(companyId).first();
  A.pipeline = await pick(A.id); B.pipeline = await pick(B.id);
  return { db, BUCKET, A, B, asha, bikram, subA, subB };
}
