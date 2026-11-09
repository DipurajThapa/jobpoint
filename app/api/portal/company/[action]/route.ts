import { env } from "cloudflare:workers";
import { portalDb, json, fail, failFrom, requireApi, ipHash } from "@/lib/portal/session";
import { createJd, currentParams, requestParamChange, submitJd, updateJdRequirements } from "@/lib/portal/company";
import { unlockCandidate } from "@/lib/portal/quota";
import { companyDashboard, companyMatches, unlockedCandidate } from "@/lib/portal/views";
import { detectScraping, guard } from "@/lib/portal/access";
import { renderCvPdf, watermarkPdf } from "@/lib/portal/watermark";
import { createAssessment } from "@/lib/portal/assessment";
import { revokeJdReleases } from "@/lib/portal/release";
import { audit, newId, nowIso, PortalError } from "@/lib/portal/db";
import { extractText } from "@/lib/ats/extract";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ action: string }> };
const COMPANY_STAGES = ["shortlisted", "interview", "offer", "hired", "rejected"];

export async function GET(request: Request, context: Ctx) {
  const account = await requireApi(request, "company");
  if (account instanceof Response) return account;
  const { action } = await context.params;
  const db = portalDb(), companyId = account.companyId!, url = new URL(request.url), ip = await ipHash(request);
  try {
    if (action === "dashboard") return json(await companyDashboard(db, companyId));
    if (action === "matches") {
      const jdId = url.searchParams.get("jd") ?? "";
      if (!await guard(db, { userId: account.id, companyId, action: "list", jdId, ipHash: ip })) return fail("You are browsing too fast. Wait a while and try again.", 429, "RATE_LIMIT");
      await detectScraping(db, account.id, companyId);
      const out = await companyMatches(db, companyId, jdId);
      return json({ ...out, message: out.matches.length ? "" : "No strong matches yet. Candidates are released here automatically as soon as they meet this role's approved requirements." });
    }
    if (action === "candidate") {
      const ref = url.searchParams.get("ref") ?? "";
      if (!await guard(db, { userId: account.id, companyId, action: "view_full", candidateRef: ref, ipHash: ip })) return fail("You are viewing profiles too fast. Wait a while and try again.", 429, "RATE_LIMIT");
      const out = await unlockedCandidate(db, companyId, ref);
      return json({ traceId: out.traceId, unlockedAt: out.unlockedAt, profile: out.profile, applications: out.applications });
    }
    if (action === "download") {
      const ref = url.searchParams.get("ref") ?? "";
      if (!await guard(db, { userId: account.id, companyId, action: "download", candidateRef: ref, ipHash: ip })) return fail("Too many downloads. Wait a while and try again.", 429, "RATE_LIMIT");
      const out = await unlockedCandidate(db, companyId, ref);
      const company = await db.prepare("SELECT display_name FROM companies WHERE id = ?").bind(companyId).first<{ display_name: string }>();
      const stamp = { company: company?.display_name ?? "Company", traceId: out.traceId, date: nowIso().slice(0, 10) };
      const object = env.BUCKET ? await env.BUCKET.get(out.cv.r2Key) : null;
      if (!object) throw new PortalError("NOT_FOUND", "The CV file is not available.", 404);
      const bytes = new Uint8Array(await object.arrayBuffer());
      const isPdf = out.cv.fileName.toLowerCase().endsWith(".pdf");
      // DOCX originals are never handed out: a stamped PDF rendering is produced instead.
      const pdf = (isPdf ? await watermarkPdf(bytes, stamp) : null) ?? await renderCvPdf(out.profile, (await extractText(bytes, isPdf ? "pdf" : "docx")).text, stamp);
      await audit(db, account.id, "cv.downloaded", "candidate_ref", ref, `trace ${out.traceId}`);
      return new Response(pdf as Uint8Array<ArrayBuffer>, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="cv-${ref}.pdf"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
    }
    if (action === "jd") {
      const jd = await db.prepare("SELECT id, title, raw_text, requirements, status, decision_note, params_version FROM jds WHERE id = ? AND company_id = ?").bind(url.searchParams.get("id") ?? "", companyId).first();
      if (!jd) return fail("JD not found.", 404);
      return json({ jd, params: await currentParams(db, companyId) });
    }
    return fail("Unknown action.", 404);
  } catch (error) { return failFrom(error); }
}

export async function POST(request: Request, context: Ctx) {
  const { action } = await context.params;
  const account = await requireApi(request, action === "params-request" ? "company_owner" : "company", true);
  if (account instanceof Response) return account;
  const db = portalDb(), companyId = account.companyId!, ip = await ipHash(request);
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const s = (v: unknown, max = 200) => typeof v === "string" ? v.slice(0, max) : "";
    if (action === "jd-create") return json(await createJd(db, companyId, account.id, { title: s(body.title, 160), text: s(body.text, 12_000), location: s(body.location, 120), workMode: s(body.workMode, 20) }), 201);
    if (action === "jd-update") return json({ requirements: await updateJdRequirements(db, companyId, s(body.jdId, 60), body.requirements, account.id), message: "Saved. Submit the JD for approval when ready." });
    if (action === "jd-submit") { const out = await submitJd(db, companyId, s(body.jdId, 60), account.id); return json({ ...out, message: out.conflicts.length ? "Submitted. Job Point will review the points below against your approved parameters." : "Submitted for approval." }); }
    if (action === "jd-close") {
      const jdId = s(body.jdId, 60);
      const r = await db.prepare("UPDATE jds SET status = 'closed', updated_at = ? WHERE id = ? AND company_id = ?").bind(nowIso(), jdId, companyId).run();
      if (!r.meta.changes) return fail("JD not found.", 404);
      await revokeJdReleases(db, jdId, "jd_closed");
      return json({ message: "JD closed. Unlocked profiles stay available to you." });
    }
    if (action === "params-request") return json({ id: await requestParamChange(db, companyId, body.params, account.id), message: "Request sent. Your current parameters stay in force until Job Point approves the change." }, 201);
    if (action === "unlock") {
      if (!await guard(db, { userId: account.id, companyId, action: "unlock", jdId: s(body.jdId, 60), candidateRef: s(body.ref, 40), ipHash: ip })) return fail("Too many unlocks in a short time. Wait a while.", 429, "RATE_LIMIT");
      const out = await unlockCandidate(db, { companyId, userId: account.id, candidateRef: s(body.ref, 40), jdId: s(body.jdId, 60), ipHash: ip });
      return json({ ...out, message: out.charged ? `Unlocked. ${out.remaining} unlock(s) left.` : "Already unlocked by your company; no unlock was used." });
    }
    if (action === "application-status") {
      const status = s(body.status, 20);
      if (!COMPANY_STAGES.includes(status)) return fail("Choose a valid stage.");
      // Only applications to this company's JDs by candidates it has unlocked.
      const app = await db.prepare(`SELECT a.id FROM portal_applications a JOIN jds j ON j.id = a.jd_id JOIN unlocks u ON u.company_id = j.company_id AND u.candidate_id = a.candidate_id AND u.access_revoked_at IS NULL
        WHERE a.id = ? AND j.company_id = ?`).bind(s(body.applicationId, 60), companyId).first<{ id: string }>();
      if (!app) return fail("Application not found.", 404);
      await db.batch([
        db.prepare("UPDATE portal_applications SET status = ?, updated_at = ? WHERE id = ?").bind(status, nowIso(), app.id),
        db.prepare("INSERT INTO portal_application_events (id, application_id, status, actor, at) VALUES (?, ?, ?, ?, ?)").bind(newId(), app.id, status, `company:${account.id}`, nowIso()),
      ]);
      return json({ message: "Stage updated. The candidate can see it." });
    }
    if (action === "assessment-create") {
      const jdId = s(body.jdId, 60);
      const jd = await db.prepare("SELECT requirements FROM jds WHERE id = ? AND company_id = ?").bind(jdId, companyId).first();
      if (!jd) return fail("JD not found.", 404);
      const id = await createAssessment(db, { ownerKind: "company", companyId, jdId, skillId: s(body.skillId, 60), title: s(body.title, 160), description: s(body.description, 1000), itemsPerForm: Number(body.itemsPerForm ?? 10), timeLimitSec: Number(body.timeLimitSec ?? 900), items: Array.isArray(body.items) ? body.items as never : [] }, account.id);
      return json({ id, message: "Assessment sent to Job Point for review. It applies once approved." }, 201);
    }
    return fail("Unknown action.", 404);
  } catch (error) { return failFrom(error); }
}
