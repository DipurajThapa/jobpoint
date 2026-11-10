// Deleting a person. The checks do not trust a list of "tables we remembered":
// after a deletion they read every column of every table in the database and
// look for the person's id, name, email and phone.
import test from "node:test";
import assert from "node:assert/strict";
import { world, call, route, portalCookie, mods, SECRET } from "./helpers/world.mjs";

const KEPT = ["candidate_consents", "placements", "releases", "unlocks"];
const OWNER = { "oai-authenticated-user-id": "owner", "oai-authenticated-user-email": "dipuraj.thapa@gmail.com" };
const tables = db => db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);
const columns = (db, table) => db.raw.prepare(`PRAGMA table_info("${table}")`).all().map(c => c.name);

/** Every place in the database where any of the given strings appears: ["table.column", ...]. */
function findAnywhere(db, needles) {
  const hits = [];
  for (const table of tables(db)) for (const row of db.raw.prepare(`SELECT * FROM "${table}"`).all()) for (const [column, value] of Object.entries(row)) {
    if (typeof value !== "string") continue;
    const lower = value.toLowerCase();
    for (const needle of needles) if (needle && lower.includes(needle.toLowerCase())) hits.push(`${table}.${column} contains "${needle}"`);
  }
  return [...new Set(hits)];
}

/** Give a candidate a row in every kind of record the system keeps about a person. */
async function fillEverything(w, person, co) {
  // Fixture ids use a short tag, never the candidate id, so a leftover id found later is a real reference.
  const { db } = w, at = new Date().toISOString(), id = person.id, tag = person.name.split(" ")[0].length + "-" + co.name.length;
  await mods.client.moveStage(db, co.id, co.userId, co.pipeline.id, { stage: "shortlisted" });
  await mods.client.scheduleInterview(db, co.id, co.userId, co.pipeline.id, { round: "Round 1", scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), mode: "video", location: "", interviewer: "Lead" });
  await mods.client.moveStage(db, co.id, co.userId, co.pipeline.id, { stage: "offered", offerCtcInr: 420000 });   // creates the commitment and inbox messages
  await mods.candidate.applyToJd(db, id, co.jdId);
  await db.prepare("INSERT INTO matches (jd_id, candidate_id, cv_id, profile_version, score, lower_bound, hard_pass, explanation, engine_version, scored_at) VALUES (?, ?, 'cv', 1, 80, 75, 1, ?, 't', ?)").bind(co.jdId, id, JSON.stringify({ summary: `${person.name} fits` }), at).run();
  await db.prepare("INSERT INTO question_banks (id, kind, title, status, created_by, created_at, updated_at) VALUES (?, 'aptitude', 'Aptitude', 'active', 'admin', ?, ?)").bind(`bank-${tag}`, at, at).run();
  await db.prepare("INSERT INTO adaptive_tests (id, bank_id, candidate_id, jd_id, status, created_at) VALUES (?, ?, ?, ?, 'completed', ?)").bind(`t-${tag}`, `bank-${tag}`, id, co.jdId, at).run();
  await db.prepare("INSERT INTO adaptive_answers (test_id, position, question_id, level, correct, answered_at) VALUES (?, 1, 'q', 5, 1, ?)").bind(`t-${tag}`, at).run();
  await db.prepare("INSERT INTO fast_track_orders (id, candidate_id, reference, amount_inr, created_at) VALUES (?, ?, ?, 499, ?)").bind(`ft-${tag}`, id, `FT-${tag}`, at).run();
  await db.prepare("UPDATE candidates SET fast_track_at = ? WHERE id = ?").bind(at, id).run();
  await db.prepare("INSERT INTO shortlist_passes (id, jd_id, candidate_id, staff_id, reason, note, created_at) VALUES (?, 'other-jd', ?, 'rec', 'other', ?, ?)").bind(`sp-${tag}`, id, `${person.name} did not answer`, at).run();
  await db.prepare("INSERT INTO assessments (id, owner_kind, title, items_per_form, time_limit_sec, status, created_by, created_at) VALUES (?, 'platform', 'Excel', 5, 600, 'approved', 'admin', ?)").bind(`as-${tag}`, at).run();
  await db.prepare("INSERT INTO assessment_attempts (id, assessment_id, candidate_id, form, started_at, deadline_at, status, items) VALUES (?, ?, ?, '[]', ?, ?, 'submitted', 5)").bind(`at-${tag}`, `as-${tag}`, id, at, at).run();
  await db.prepare("INSERT INTO assessment_responses (attempt_id, item_id, position) VALUES (?, 'i', 1)").bind(`at-${tag}`).run();
  await db.prepare("INSERT INTO services (id, code, category, name, created_at) VALUES (?, ?, 'cv_writing', 'CV writing', ?)").bind(`sv-${tag}`, `sv-${tag}`, at).run();
  await db.prepare("INSERT INTO service_orders (id, candidate_id, service_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(`so-${tag}`, id, `sv-${tag}`, at, at).run();
  await db.prepare("INSERT INTO service_enrolments (id, order_id, candidate_id, created_at) VALUES (?, ?, ?, ?)").bind(`se-${tag}`, `so-${tag}`, id, at).run();
  await db.prepare("INSERT INTO payment_intents (id, payer_kind, payer_id, purpose, ref_id, amount_inr, created_at) VALUES (?, 'candidate', ?, 'service_order', 'x', 499, ?)").bind(`pi-${tag}`, id, at).run();
  await db.prepare("INSERT INTO duplicate_flags (id, kind, a_id, b_id, signal, created_at) VALUES (?, 'account', ?, 'someone-else', 'same_phone', ?)").bind(`df-${tag}`, id, at).run();
  await db.prepare("INSERT INTO abuse_flags (id, subject_kind, subject_id, rule, detail, created_at) VALUES (?, 'candidate', ?, 'rate:cv_upload', ?, ?)").bind(`af-${tag}`, id, `${person.email} uploaded too often`, at).run();
  await db.prepare("INSERT INTO messages (id, channel, recipient_kind, recipient_id, kind, body, status, created_at) VALUES (?, 'whatsapp', 'candidate', ?, 'x', ?, 'queued', ?)").bind(`om-${tag}`, id, `Hello ${person.name}`, at).run();
  await db.prepare("INSERT INTO score_queue (id, kind, ref_id, reason, enqueued_at) VALUES (?, 'candidate', ?, 'x', ?) ON CONFLICT DO NOTHING").bind(`sq-${tag}`, id, at).run();
}

/** A website application from this email, with its stored CV and a screening result. */
async function websiteApplication(w, id, name, email, phone) {
  const key = `resumes/${id}`;
  await w.BUCKET.put(key, new TextEncoder().encode(`website CV of ${name}`));
  await w.db.prepare("INSERT INTO applications (id, full_name, email, phone, location, experience, consent, future_consent, resume_key, resume_name, recruiter_notes) VALUES (?, ?, ?, ?, 'Kolkata', ?, 1, 1, ?, 'cv.pdf', ?)")
    .bind(id, name, email, phone, `${name} has five years in accounts`, key, `${name} sounded keen on the phone`).run();
  await w.db.prepare("INSERT INTO ats_screenings (id, application_id, method, engine_version, cv_sha256, score, verdict, profile, requirements, result, created_at, created_by) VALUES (?, ?, 'rules', 't', 'x', 70, 'possible', ?, '{}', '{}', ?, 'owner')")
    .bind(`scr-${id}`, id, JSON.stringify({ contact: { name, email, phone } }), new Date().toISOString()).run();
  return key;
}

test("every table that holds a candidate id has a stated deletion rule", async () => {
  const w = await world();
  const withCandidate = tables(w.db).filter(t => t !== "candidates" && columns(w.db, t).includes("candidate_id"));
  const rules = mods.candidate.CANDIDATE_DATA;
  for (const table of withCandidate) assert.ok(rules[table], `table "${table}" has a candidate_id column but no rule in CANDIDATE_DATA (erase or keep)`);
  for (const table of Object.keys(rules)) assert.ok(withCandidate.includes(table), `CANDIDATE_DATA names "${table}", which has no candidate_id column`);
  assert.ok(withCandidate.length >= 15);
  // The only records allowed to outlive a deletion. Adding to this list is a privacy decision, so the test holds its own copy.
  assert.deepEqual(Object.entries(rules).filter(([, rule]) => rule === "keep").map(([t]) => t).sort(), KEPT);
});

test("deleting a candidate leaves no personal data anywhere in the database, and leaves other people untouched", async () => {
  const w = await world();
  await fillEverything(w, w.asha, w.A);
  await fillEverything(w, w.bikram, w.B);
  const websiteKey = await websiteApplication(w, "app-asha", w.asha.name, w.asha.email, w.asha.phone);
  const personal = [w.asha.name, "Asha", "Mukherjee", w.asha.email, w.asha.phone, "ashamukherjee"];
  assert.ok(findAnywhere(w.db, personal).length > 10, "the fixture should spread the person's data widely before deletion");
  const bikramBefore = findAnywhere(w.db, [w.bikram.id]).sort();
  const countsBefore = Object.fromEntries(tables(w.db).map(t => [t, w.db.raw.prepare(`SELECT COUNT(*) AS n FROM "${t}" WHERE ${columns(w.db, t).includes("candidate_id") ? "candidate_id = ?" : "? = ?"}`).get(...(columns(w.db, t).includes("candidate_id") ? [w.bikram.id] : [1, 1])).n]));

  const cookie = await portalCookie(w.asha.email);
  const candidateRoute = await route("portal/candidate/[action]");
  assert.equal((await call(candidateRoute, "POST", "/api/portal/candidate/delete", { cookie, action: "delete", body: { confirm: "delete" } })).status, 400, "deletion must need the exact confirmation");
  const res = await call(candidateRoute, "POST", "/api/portal/candidate/delete", { cookie, action: "delete", body: { confirm: "DELETE" } });
  assert.equal(res.status, 200, res.text);

  // 1. No name, email, phone or profile link anywhere.
  assert.deepEqual(findAnywhere(w.db, personal), []);
  // 2. The candidate id survives only where a rule says "keep", in the stub itself, and in the audit trail of the deletion.
  const allowed = new Set(["candidates.id", "audit_events.target_id", "audit_events.detail", ...KEPT.map(t => `${t}.candidate_id`)]);
  const leftovers = findAnywhere(w.db, [w.asha.id]).map(h => h.split(" ")[0]).filter(h => !allowed.has(h));
  assert.deepEqual(leftovers, [], "the candidate id is still referenced");
  // 3. Stored files are gone: both the portal CV and the website CV.
  assert.equal(w.BUCKET.store.has(w.asha.r2Key), false);
  assert.equal(w.BUCKET.store.has(websiteKey), false);
  // 4. The account cannot be used again, and the old session is dead.
  assert.equal((await call(candidateRoute, "GET", "/api/portal/candidate/profile", { cookie, action: "profile" })).status, 401);
  await assert.rejects(portalCookie(w.asha.email));
  // 5. The client's access is closed.
  const company = await route("portal/company/[action]");
  const asCompany = await portalCookie(w.A.email);
  assert.notEqual((await call(company, "GET", `/api/portal/company/candidate?ref=${w.A.pipeline.candidate_ref}`, { cookie: asCompany, action: "candidate" })).status, 200);
  // 6. The other candidate is exactly as before.
  assert.deepEqual(findAnywhere(w.db, [w.bikram.id]).sort(), bikramBefore);
  for (const t of tables(w.db)) if (columns(w.db, t).includes("candidate_id"))
    assert.equal(w.db.raw.prepare(`SELECT COUNT(*) AS n FROM "${t}" WHERE candidate_id = ?`).get(w.bikram.id).n, countsBefore[t], `${t}: another candidate's rows changed`);
  assert.equal(w.BUCKET.store.has(w.bikram.r2Key), true);
  // 7. What the law requires to be kept is kept: the consent ledger and who received the CV.
  assert.ok((await w.db.prepare("SELECT COUNT(*) AS n FROM candidate_consents WHERE candidate_id = ?").bind(w.asha.id).first()).n >= 2);
  assert.equal((await w.db.prepare("SELECT COUNT(*) AS n FROM unlocks WHERE candidate_id = ? AND access_revoked_at IS NOT NULL").bind(w.asha.id).first()).n, 1);
});

test("the stub is removed after a year, with the last references to the person", async () => {
  const w = await world();
  await mods.candidate.deleteCandidateData(w.db, w.asha.id, "candidate");
  assert.equal(await mods.candidate.purgeExpiredStubs(w.db), 0, "a fresh stub must be kept for the retention year");
  await w.db.prepare("UPDATE candidates SET last_active_at = ? WHERE id = ?").bind(new Date(Date.now() - 367 * 86_400_000).toISOString(), w.asha.id).run();
  assert.equal(await mods.candidate.purgeExpiredStubs(w.db), 1);
  const left = findAnywhere(w.db, [w.asha.id]).map(h => h.split(" ")[0]).filter(h => !["audit_events.target_id", "placements.candidate_id", "audit_events.detail"].includes(h));
  assert.deepEqual(left, []);
  assert.equal((await w.db.prepare("SELECT status FROM candidates WHERE id = ?").bind(w.bikram.id).first()).status, "active");
});

test("a verified deletion request erases the person from both the website records and the candidate list", async () => {
  const w = await world();
  const email = "dual.person@person.example";
  // The same person applied on the website (unverified) and separately signed up on the portal.
  const key = await websiteApplication(w, "app-dual", "Dual Person", email, "9830044444");
  await mods.website.linkWebsiteApplication(w.db, w.BUCKET, { id: "app-dual", jobId: null, fullName: "Dual Person", email, phone: "9830044444", location: "Kolkata", shareConsent: true, futureConsent: true, privacyVersion: "2026-11-09", resumeName: null }, null);
  const { makeCandidate } = await import("./helpers/world.mjs");
  const portal = await makeCandidate(w.db, w.BUCKET, "Dual Person", email, "9830044444");
  await websiteApplication(w, "app-other", "Other Person", "other.person@person.example", "9830055555");
  await w.db.prepare("INSERT INTO privacy_requests (id, request_type, requester_name, email) VALUES ('pr-del', 'deletion', 'Dual Person', ?), ('pr-access', 'access', 'Dual Person', ?)").bind(email, email).run();
  const privacy = await route("admin/privacy-requests/[id]");
  const patch = (id, body, headers = OWNER) => call(privacy, "PATCH", `/api/admin/privacy-requests/${id}`, { params: { id }, body, headers });
  const done = { status: "completed", resolutionNote: "Verified by phone call", identityVerified: true, erase: true };

  // Refused: not the owner; not verified; not completed; not a deletion request.
  assert.equal((await patch("pr-del", done, {})).status, 401);
  assert.equal((await patch("pr-del", { ...done, identityVerified: false })).status, 400);
  assert.equal((await patch("pr-del", { ...done, status: "in_progress" })).status, 400);
  assert.equal((await patch("pr-access", done)).status, 400);
  assert.ok(findAnywhere(w.db, [email]).length > 0, "a refused request must not erase anything");
  assert.equal(w.BUCKET.store.has(key), true);

  const ok = await patch("pr-del", done);
  assert.equal(ok.status, 200, ok.text);
  // Only the request itself still names the person (it is the record of the request).
  const remaining = findAnywhere(w.db, [email, "Dual Person", "9830044444"]).map(h => h.split(" ")[0]);
  assert.deepEqual([...new Set(remaining)].sort(), ["privacy_requests.email", "privacy_requests.requester_name"]);
  assert.equal(w.BUCKET.store.has(key), false);
  assert.equal(w.BUCKET.store.has(portal.r2Key), false);
  const request = await w.db.prepare("SELECT status, erased_at, erasure_summary FROM privacy_requests WHERE id = 'pr-del'").first();
  assert.equal(request.status, "completed");
  assert.ok(request.erased_at && /2 candidate record\(s\), 1 website application\(s\)/.test(request.erasure_summary), request.erasure_summary);
  assert.equal((await patch("pr-del", done)).status, 409, "a second erasure of the same request must be refused");
  // Nobody else was touched.
  assert.equal((await w.db.prepare("SELECT COUNT(*) AS n FROM applications WHERE id = 'app-other'").first()).n, 1);
  assert.equal((await w.db.prepare("SELECT COUNT(*) AS n FROM ats_screenings WHERE application_id = 'app-other'").first()).n, 1);
  for (const person of [w.asha, w.bikram]) assert.equal((await w.db.prepare("SELECT status FROM candidates WHERE id = ?").bind(person.id).first()).status, "active");
});

test("erasing by email does not match a different address that merely looks similar", async () => {
  const w = await world();
  await websiteApplication(w, "app-1", "Ann One", "ann@person.example", "9830066661");
  await websiteApplication(w, "app-2", "Ann Two", "ann@person.example.org", "9830066662");
  await websiteApplication(w, "app-3", "Joann", "joann@person.example", "9830066663");
  const out = await mods.candidate.eraseByEmail(w.db, "  ANN@person.example ", "owner");
  assert.equal(out.applications, 1);
  assert.deepEqual((await w.db.prepare("SELECT id FROM applications ORDER BY id").all()).results.map(r => r.id), ["app-2", "app-3"]);
  for (const bad of ["", "not-an-email", "%", "a@b", "' OR 1=1 --"]) await assert.rejects(mods.candidate.eraseByEmail(w.db, bad, "owner"), e => e.code === "INVALID_EMAIL");
  assert.equal((await w.db.prepare("SELECT COUNT(*) AS n FROM applications").first()).n, 2);
});

test("deleting a website application from the admin console removes the linked candidate record when it was the only source", async () => {
  const w = await world();
  const key = await websiteApplication(w, "app-solo", "Solo Applicant", "solo@person.example", "9830077777");
  await mods.website.linkWebsiteApplication(w.db, w.BUCKET, { id: "app-solo", jobId: null, fullName: "Solo Applicant", email: "solo@person.example", phone: "9830077777", location: "Kolkata", shareConsent: false, futureConsent: true, privacyVersion: "2026-11-09", resumeName: null }, null);
  const records = await route("admin/records/[type]/[id]");
  const res = await call(records, "DELETE", "/api/admin/records/applications/app-solo", { params: { type: "applications", id: "app-solo" }, headers: OWNER });
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(findAnywhere(w.db, ["Solo Applicant", "solo@person.example", "9830077777"]), []);
  assert.equal(w.BUCKET.store.has(key), false);
});

test("merging duplicates keeps one working reference per company, and the client keeps access to the same person", async () => {
  const w = await world();
  const { makeCandidate } = await import("./helpers/world.mjs");
  const survivor = await makeCandidate(w.db, w.BUCKET, "Asha Mukherjee", "asha.m.second@person.example", "9830011111");
  await mods.candidate.mergeCandidates(w.db, survivor.id, w.asha.id, "admin");
  const company = await route("portal/company/[action]");
  const cookie = await portalCookie(w.A.email);
  const view = await call(company, "GET", `/api/portal/company/candidate?ref=${w.A.pipeline.candidate_ref}`, { cookie, action: "candidate" });
  assert.equal(view.status, 200, `after a merge the client lost the candidate: ${view.text.slice(0, 120)}`);
  assert.equal((await w.db.prepare("SELECT candidate_id FROM pipeline WHERE id = ?").bind(w.A.pipeline.id).first()).candidate_id, survivor.id);
  // Submitting the surviving record to the same company again must not create a second reference.
  const { id: jd2 } = await mods.company.createJd(w.db, w.A.id, w.A.userId, { title: "Accounts Officer", location: "Durgapur, West Bengal", text: "We are hiring an Accounts Officer in Durgapur.\nRequirements: B.Com with 2-5 years of experience. Must have Tally, GST returns and TDS.\nCTC: 3-4.5 LPA. Notice period: up to 30 days." });
  await mods.company.submitJd(w.db, w.A.id, jd2, w.A.userId);
  await mods.company.decideJd(w.db, jd2, true, "admin");
  await w.db.prepare("UPDATE jds SET service = 'managed' WHERE id = ?").bind(jd2).run();
  await mods.client.submitByRecruiter(w.db, SECRET, { companyId: w.A.id, jdId: jd2, candidateId: survivor.id, note: "Also fits the officer role." }, "admin-1");
  const refs = (await w.db.prepare("SELECT DISTINCT candidate_ref FROM pipeline WHERE company_id = ?").bind(w.A.id).all()).results;
  assert.equal(refs.length, 1, "the same person has two references at one company");
  assert.equal((await w.db.prepare("SELECT COUNT(*) AS n FROM unlocks WHERE company_id = ?").bind(w.A.id).first()).n, 1);
});
