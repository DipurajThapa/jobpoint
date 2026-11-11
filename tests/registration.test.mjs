import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { freshDb, route, call, ORIGIN, PASSWORD, mods } from './helpers/world.mjs';
const registration = await route('portal/registration');
const auth = await route('portal/auth/[action]');
const companyApi = await route('portal/company/[action]');
async function candidateForm(email = 'new.candidate@example.test') {
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText('Example Candidate\nSoftware engineer\nExperience\nSoftware developer with JavaScript, React and SQL skills.\nEducation\nBachelor of Computer Science', { x: 30, y: 700, size: 12, font });
  const form = new FormData();
  for (const [key, value] of Object.entries({ kind: 'candidate', fullName: 'Example Candidate', email, phone: '+919876543210', location: 'Remote', password: PASSWORD, declaration: 'yes', consent: 'yes', shareConsent: 'yes' })) form.set(key, value);
  form.set('resume', new File([await pdf.save()], 'cv.pdf', { type: 'application/pdf' }));
  return form;
}
function employerForm(email = 'owner@example.test') {
  const form = new FormData();
  for (const [key,value] of Object.entries({ kind: 'company', contactName: 'Example Owner', company: 'Example Business', legalName: 'Example Business Ltd', email, phone: '+919876543211', password: PASSWORD, details: 'Hiring software and accounts staff', consent: 'yes', terms: 'yes' })) form.set(key,value);
  return form;
}
const submit = form => registration.POST(new Request(`${ORIGIN}/api/portal/registration`, { method: 'POST', headers: { origin: ORIGIN }, body: form }));
async function verifyAndSignIn(db, account, email) {
  const token = await mods.accounts.issuePortalToken(db, account, 'verify', 48);
  const verified = await call(auth, 'POST', '/api/portal/auth/verify', { action: 'verify', body: { token } });
  assert.equal(verified.status, 200);
  const login = await call(auth, 'POST', '/api/portal/auth/sign-in', { action: 'sign-in', body: { email, password: PASSWORD } });
  assert.equal(login.status, 200);
  return { verified, login, cookie: login.headers.get('set-cookie').split(';')[0] };
}
test('candidate registration atomically links account, CV, intake and exact consent; verified login opens candidate dashboard', async () => {
  const { db, BUCKET } = freshDb();
  const res = await submit(await candidateForm());
  assert.equal(res.status, 201, await res.clone().text());
  const body = await res.json();
  assert.match(body.message, /pending verification/); assert.equal(body.emailed, false); assert.equal(body.devLink, undefined);
  const row = await db.prepare('SELECT a.id AS account_id, c.id AS candidate_id, v.r2_key, s.ref_id FROM portal_accounts a JOIN candidates c ON c.account_id=a.id JOIN cvs v ON v.candidate_id=c.id JOIN candidate_sources s ON s.candidate_id=c.id').first();
  assert.ok(row); assert.ok(BUCKET.store.has(row.r2_key));
  assert.equal((await db.prepare('SELECT resume_key FROM applications WHERE id=?').bind(row.ref_id).first()).resume_key, row.r2_key);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM candidate_consents WHERE candidate_id=?').bind(row.candidate_id).first()).n, 2);
  assert.equal(await mods.consent.consentActive(db, row.candidate_id, 'share_with_companies'), false);
  const before = await call(auth, 'POST', '/api/portal/auth/sign-in', { action: 'sign-in', body: { email: 'new.candidate@example.test', password: PASSWORD } });
  assert.equal(before.json.code, 'UNVERIFIED');
  const { verified, login, cookie } = await verifyAndSignIn(db, row.account_id, 'new.candidate@example.test');
  assert.equal(login.json.next, '/candidate'); assert.match(verified.json.next, /kind=candidate/);
  const candidateApi = await route('portal/candidate/[action]');
  const dashboard = await call(candidateApi, 'GET', '/api/portal/candidate/profile', { action: 'profile', cookie });
  assert.equal(dashboard.status, 200); assert.ok(dashboard.text.includes('Example Candidate'));
});
test('business registration links enquiry and requested meeting to its own company and dashboard', async () => {
  const { db } = freshDb();
  const enquiry = await route('employer-enquiries'), slots = await (await enquiry.GET()).json();
  const form = employerForm(); form.set('meetingAt', slots.slots[0]);
  const response = await submit(form); assert.equal(response.status, 201, await response.clone().text());
  const row = await db.prepare('SELECT a.id AS account_id, c.id AS company_id, c.status, e.meeting_status FROM portal_accounts a JOIN company_users u ON u.account_id=a.id JOIN companies c ON c.id=u.company_id JOIN employer_enquiries e ON e.company_id=c.id').first();
  assert.equal(row.status, 'applied'); assert.equal(row.meeting_status, 'requested');
  const { login, cookie, verified } = await verifyAndSignIn(db, row.account_id, 'owner@example.test');
  assert.equal(login.json.next, '/company'); assert.match(verified.json.next, /kind=company/);
  const dash = await call(companyApi, 'GET', '/api/portal/company/dashboard', { action: 'dashboard', cookie });
  assert.equal(dash.status, 200); assert.equal(dash.json.enquiries.length, 1);
  const conflict = employerForm('another@example.test'); conflict.set('meetingAt', slots.slots[0]);
  assert.equal((await submit(conflict)).status, 409);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM portal_accounts').first()).n, 1);
});
test('validation and duplicate registration never create orphan records or replace account data', async () => {
  const { db } = freshDb(); const invalid = await candidateForm(); invalid.delete('resume');
  assert.equal((await submit(invalid)).status, 400);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM portal_accounts').first()).n, 0);
  const first = await submit(await candidateForm()); assert.equal(first.status, 201);
  const firstReply = await first.json();
  const duplicate = await candidateForm(); duplicate.set('fullName', 'Overwrite attempt');
  const repeated = await submit(duplicate); assert.equal(repeated.status, 201); assert.deepEqual(await repeated.json(), firstReply);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM portal_accounts').first()).n, 1);
  assert.equal((await db.prepare('SELECT display_name FROM candidates').first()).display_name, 'Example Candidate');
});
test('database failure rolls back the whole registration and removes the uploaded CV', async () => {
  const { db, BUCKET } = freshDb();
  await db.prepare("CREATE TRIGGER reject_new_cv BEFORE INSERT ON cvs BEGIN SELECT RAISE(ABORT, 'simulated failure'); END").run();
  assert.equal((await submit(await candidateForm())).status, 503);
  for (const table of ['portal_accounts', 'candidates', 'applications', 'candidate_sources']) assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n, 0);
  assert.equal(BUCKET.store.size, 0);
});
test('registration rejects cross-origin requests and retires the disconnected signup endpoint', async () => {
  freshDb();
  assert.equal((await registration.POST(new Request(`${ORIGIN}/api/portal/registration`, { method: 'POST', body: employerForm() }))).status, 403);
  const old = await call(auth, 'POST', '/api/portal/auth/register', { action: 'register', body: {} }); assert.equal(old.status, 410);
  const resend = await call(auth, 'POST', '/api/portal/auth/resend-verification', { action: 'resend-verification', body: { email: 'owner@example.test' } });
  assert.equal(resend.status, 503); assert.equal(resend.json.code, 'MAIL_UNAVAILABLE');
});
