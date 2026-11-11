import { readLimitedForm } from "@/lib/intake-security";
import { env } from "cloudflare:workers";
import { CONSENT_NOTICE_VERSION } from "@/lib/portal/notice";
import { candidateInbox, markInboxRead, resolveSender, setWhatsappConsent } from "@/lib/portal/notify";
import { portalDb, portalSecret, json, fail, failFrom, requireApi, ipHash } from "@/lib/portal/session";
import { recordConsent, withdrawSharing, withdrawFromCompany, consentActive } from "@/lib/portal/consent";
import { applyToJd, correctProfile, deleteCandidateData, primaryProfile } from "@/lib/portal/candidate";
import { ingestCv } from "@/lib/portal/ingest";
import { drainQueue } from "@/lib/portal/queue";
import { candidateApplications, candidateJobs, candidateSharing } from "@/lib/portal/views";
import { withinLimits, flagAbuse } from "@/lib/portal/access";
import { enqueue } from "@/lib/portal/company";
import { CvReadError, MAX_CV_BYTES } from "@/lib/ats/pipeline";
import { sendMail } from "@/lib/portal/mailer";
import { nowIso, parseJson } from "@/lib/portal/db";
import { nameKey } from "@/lib/portal/policy";
import { answerTest, candidateTests, requestFastTrack, startTechnicalTest, testStep } from "@/lib/portal/adaptive";
import { deliverEmails } from "@/lib/portal/outbox";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ action: string }> };

export async function GET(request: Request, context: Ctx) {
  const account = await requireApi(request, "candidate");
  if (account instanceof Response) return account;
  const { action } = await context.params;
  const db = portalDb(), id = account.candidateId!, url = new URL(request.url);
  try {
    if (action === "jobs") {
      const n = (k: string) => url.searchParams.get(k) ? Number(url.searchParams.get(k)) : undefined;
      return json({ jobs: await candidateJobs(db, id, { city: url.searchParams.get("city") ?? undefined, role: url.searchParams.get("role") ?? undefined, minCtcInr: n("minCtc"), maxYears: n("maxYears") }) });
    }
    if (action === "tests") { const p = await primaryProfile(db, id); return json(await candidateTests(db, id, (p?.profile.skills ?? []).flatMap(k => [k.id, k.name].filter(Boolean) as string[]))); }
    if (action === "test") return json(await testStep(db, url.searchParams.get("id") ?? "", id));
    if (action === "applications") return json({ applications: await candidateApplications(db, id) });
    if (action === "inbox") { const sender = await resolveSender(db, null); return json({ messages: await candidateInbox(db, id), whatsapp: sender?.number ?? "" }); }
    if (action === "profile") {
      const p = await primaryProfile(db, id);
      return json({ profile: p?.profile ?? null, status: p?.status ?? "none", sharing: await consentActive(db, id, "share_with_companies"), whatsapp: !!(await db.prepare("SELECT whatsapp_consent_at FROM candidates WHERE id = ?").bind(id).first<{ whatsapp_consent_at: string | null }>())?.whatsapp_consent_at });
    }
    if (action === "export") {
      // DPDP access right: the candidate's data, its corrections, consents and who received it.
      const p = await primaryProfile(db, id);
      const consents = (await db.prepare("SELECT purpose, action, notice_version, at FROM candidate_consents WHERE candidate_id = ? ORDER BY at").bind(id).all()).results;
      return new Response(JSON.stringify({ exportedAt: nowIso(), profile: p?.profile ?? null, consents, applications: await candidateApplications(db, id), sharedWith: await candidateSharing(db, id) }, null, 2),
        { headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="jobboard300-my-data.json"', "cache-control": "no-store" } });
    }
    if (action === "companies") {
      // Only the names this candidate typed are returned. The list of client companies is never shown to candidates.
      const row = await db.prepare("SELECT hidden_company_names FROM candidates WHERE id = ?").bind(id).first<{ hidden_company_names: string }>();
      return json({ hidden: parseJson<string[]>(row?.hidden_company_names, []), sharing: await candidateSharing(db, id) });
    }
    return fail("Unknown action.", 404);
  } catch (error) { return failFrom(error); }
}

/** After every change, send a few of the queued update emails (there is no scheduler on this hosting). */
export async function POST(request: Request, context: Ctx) {
  const response = await handlePost(request, context);
  if (response.ok) {
    try { await deliverEmails(portalDb(), 10); } catch (error) { console.error("email delivery failed", error instanceof Error ? error.message : error); }
  }
  return response;
}

async function handlePost(request: Request, context: Ctx) {
  const account = await requireApi(request, "candidate", true);
  if (account instanceof Response) return account;
  const { action } = await context.params;
  const db = portalDb(), id = account.candidateId!, ip = await ipHash(request);
  try {
    if (action === "upload") {
      if (Number(request.headers.get("content-length") ?? 0) > MAX_CV_BYTES + 50_000) return fail("The CV exceeds the 5 MB limit.", 413);
      const limit = await withinLimits(db, id, "cv_upload");
      if (!limit.ok) { await flagAbuse(db, "candidate", id, null, "rate:cv_upload", limit.rule); return fail("You can upload up to 3 CV versions a month.", 429, "RATE_LIMIT"); }
      const form = await readLimitedForm(request, MAX_CV_BYTES + 50000);
      const file = form.get("resume");
      if (!(file instanceof File) || !file.size) return fail("Attach your CV as a PDF or DOCX file.");
      if (form.get("consentProfile") !== "yes") return fail("Agree to the processing notice to upload your CV.", 400, "CONSENT");
      const cand = await db.prepare("SELECT display_name, current_city FROM candidates WHERE id = ?").bind(id).first<{ display_name: string; current_city: string }>();
      let result;
      try { result = await ingestCv(db, env.BUCKET ?? null, id, { bytes: new Uint8Array(await file.arrayBuffer()), fileName: file.name.replace(/[\\/\r\n\0]/g, "_").slice(0, 140), knownName: cand?.display_name, knownLocation: cand?.current_city }); }
      catch (error) { if (error instanceof CvReadError) return fail(error.message, 422, "UNREADABLE"); throw error; }
      // Consents are recorded only once the CV has been accepted, so a refused file changes nothing.
      // The ticks on the form are shown as they stand today; only a change is written, in either direction.
      await recordConsent(db, id, "profile_processing", "granted", ip);
      const sharing = await consentActive(db, id, "share_with_companies"), wantsShare = form.get("consentShare") === "yes";
      if (wantsShare && !sharing) await recordConsent(db, id, "share_with_companies", "granted", ip);
      if (form.get("consentOffers") === "yes" && !await consentActive(db, id, "service_offers")) await recordConsent(db, id, "service_offers", "granted", ip);
      await setWhatsappConsent(db, id, form.get("consentWhatsapp") === "yes", CONSENT_NOTICE_VERSION);
      await drainQueue(db, portalSecret(), 300);
      return json({ status: result.status, profile: result.profile, message: result.status === "parsed" ? "Your CV has been read. Check the details below and correct anything we got wrong." : "We could not read your CV automatically (it may be a scanned image). A Jobboard300 reviewer will check it; nothing has been lost." }, 201);
    }
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (action === "profile") {
      const p = await primaryProfile(db, id);
      const cvText = p ? [p.profile.summary, ...p.profile.work.flatMap(w => [w.title, ...w.highlights]), ...p.profile.skills.map(s => s.name)].join("\n") : "";
      const out = await correctProfile(db, id, (body.correction ?? {}) as never, cvText, "candidate", account.id);
      await drainQueue(db, portalSecret(), 300);
      return json({ message: out.changed.length ? "Profile updated. Your job matches are being refreshed." : "Nothing changed.", changed: out.changed });
    }
    if (action === "consent") {
      const purpose = body.purpose === "service_offers" ? "service_offers" : "share_with_companies";
      if (body.grant === true) { await recordConsent(db, id, purpose, "granted", ip); if (purpose === "share_with_companies") { await enqueue(db, "candidate", id, "consent_granted").run(); await drainQueue(db, portalSecret(), 300); } return json({ message: "Consent recorded." }); }
      if (purpose === "service_offers") { await recordConsent(db, id, purpose, "withdrawn", ip); return json({ message: "You will not receive service offers." }); }
      const { companiesToNotify } = await withdrawSharing(db, id, account.id, ip);
      await notifyCompanies(db, companiesToNotify);
      return json({ message: "Sharing stopped. Companies can no longer see your profile, and companies that received it have been asked to delete their copies." });
    }
    if (action === "block") {
      // The candidate types an employer's name. The reply is the same whether or not that employer is a client.
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
      if (nameKey(name).length < 2) return fail("Type the employer's name.");
      const row = await db.prepare("SELECT hidden_company_ids, hidden_company_names FROM candidates WHERE id = ?").bind(id).first<{ hidden_company_ids: string; hidden_company_names: string }>();
      const names = parseJson<string[]>(row?.hidden_company_names, []).filter(n => nameKey(n) !== nameKey(name));
      const ids = new Set(parseJson<string[]>(row?.hidden_company_ids, []));
      const { results: all } = await db.prepare("SELECT id, display_name, legal_name FROM companies").all<{ id: string; display_name: string; legal_name: string }>();
      const matched = all.filter(c => [nameKey(c.display_name), nameKey(c.legal_name)].includes(nameKey(name))).map(c => c.id);
      if (body.block === false) matched.forEach(m => ids.delete(m)); else { names.push(name); matched.forEach(m => ids.add(m)); }
      await db.batch([
        db.prepare("UPDATE candidates SET hidden_company_ids = ?, hidden_company_names = ? WHERE id = ?").bind(JSON.stringify([...ids].slice(0, 50)), JSON.stringify(names.slice(-20)), id),
        ...(body.block === false ? [] : matched.map(m => db.prepare("UPDATE releases SET revoked_at = ?, revoke_reason = 'blocked_by_candidate' WHERE candidate_id = ? AND company_id = ? AND revoked_at IS NULL").bind(nowIso(), id, m))),
      ]);
      // An employer that already has the profile loses access now, and its open entries close as withdrawn. The reply is the same either way.
      if (body.block !== false) for (const m of matched) await withdrawFromCompany(db, id, m, `candidate:${id}`);
      return json({ message: body.block === false ? "Removed from your list." : "Saved. Your profile will not be shared with this employer. If they already had it, their access has ended and your applications with them are closed." });
    }
    if (action === "fasttrack-request") { const o = await requestFastTrack(db, id); return json({ ...o, message: `Pay ₹${o.amount_inr.toLocaleString("en-IN")} and quote the reference ${o.reference}. You are on Fast Track as soon as we confirm the payment.` }, o.created ? 201 : 200); }
    if (action === "test-start") { const t = typeof body.testId === "string" ? { id: body.testId } : await startTechnicalTest(db, id, String(body.bankId ?? "")); return json(await testStep(db, t.id, id, { start: true })); }
    if (action === "test-answer") return json(await answerTest(db, String(body.testId ?? ""), id, typeof body.choice === "number" ? body.choice : null));
    if (action === "inbox-read") { await markInboxRead(db, id); return json({ message: "ok" }); }
    if (action === "apply") { await applyToJd(db, id, String(body.jdId ?? "")); await drainQueue(db, portalSecret(), 300); return json({ message: "Application recorded." }); }
    if (action === "delete") {
      if (body.confirm !== "DELETE") return fail("Type DELETE to confirm.", 400, "CONFIRM");
      const { r2Keys, companiesToNotify } = await deleteCandidateData(db, id, account.id);
      if (env.BUCKET) for (const key of r2Keys) await env.BUCKET.delete(key);
      await notifyCompanies(db, companiesToNotify);
      return json({ message: "Your account and CV have been deleted." });
    }
    return fail("Unknown action.", 404);
  } catch (error) { return failFrom(error); }
}

/** Ask companies that received the CV to delete their copies (contractual duty). */
async function notifyCompanies(db: ReturnType<typeof portalDb>, companyIds: string[]) {
  for (const companyId of companyIds) {
    const { results } = await db.prepare("SELECT a.email FROM company_users cu JOIN portal_accounts a ON a.id = cu.account_id WHERE cu.company_id = ? AND a.status = 'active'").bind(companyId).all<{ email: string }>();
    for (const r of results) await sendMail({ to: r.email, subject: "Jobboard300: delete a candidate's CV", text: "A candidate whose CV your company unlocked on Jobboard300 has withdrawn consent. Their profile is no longer available to you. Under your Jobboard300 terms, delete any copy you downloaded within 15 days." });
  }
}
