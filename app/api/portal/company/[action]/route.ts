import { env } from "cloudflare:workers";
import { portalDb, json, fail, failFrom, requireApi, ipHash } from "@/lib/portal/session";
import { createJd, submitJd, updateJdRequirements } from "@/lib/portal/company";
import { companyDashboard, unlockedCandidate } from "@/lib/portal/views";
import { guard } from "@/lib/portal/access";
import { renderCvPdf, watermarkPdf } from "@/lib/portal/watermark";
import { audit, nowIso, PortalError } from "@/lib/portal/db";
import { extractText } from "@/lib/ats/extract";
import { clientOverview, closeJob, closeOpenCandidates, inviteMember, moveStage, pipelineView, recordInterview, reissueInvite, removeMember, reportPlacementExit, rescheduleInterview, scheduleInterview, setJdOpenings, teamList, REASONS, STAGE_LABEL } from "@/lib/portal/client";
import { sendMail } from "@/lib/portal/mailer";
import { companyNotices, markNoticesRead, notifyCandidate } from "@/lib/portal/notify";
import { redactContacts } from "@/lib/portal/policy";
import { deliverEmails } from "@/lib/portal/outbox";

// Placement-fee model: clients do not browse, unlock or add candidates themselves.
// A Jobboard300 recruiter submits each candidate, and the client works them in the pipeline.

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ action: string }> };

export async function GET(request: Request, context: Ctx) {
  const account = await requireApi(request, "company");
  if (account instanceof Response) return account;
  const { action } = await context.params;
  const db = portalDb(), companyId = account.companyId!, url = new URL(request.url), ip = await ipHash(request);
  try {
    if (action === "dashboard") {
      const dash = await companyDashboard(db, companyId), overview = await clientOverview(db, companyId);
      const terms = await db.prepare("SELECT fee_percent, guarantee_days FROM companies WHERE id = ?").bind(companyId).first<{ fee_percent: number; guarantee_days: number }>();
      // No match counts in the placement-fee model: they would show how requirement changes move the matching.
      dash.jds = dash.jds.map(j => ({ ...j, released: 0, unlocked: 0 })); overview.jobs = overview.jobs.map(j => ({ ...j, released: 0 }));
      // The matching rules (minimum score, filters, release caps) are internal in the placement-fee model.
      const params = !dash.params ? dash.params : { version: 0, params: { maxLiveJds: dash.params.params.maxLiveJds } };
      return json({ ...dash, params, overview, role: account.companyRole, notices: await companyNotices(db, companyId), terms: { feePercent: terms?.fee_percent, guaranteeDays: terms?.guarantee_days } });
    }
    if (action === "pipeline") return json({ pipeline: await pipelineView(db, companyId, url.searchParams.get("jd") || undefined, true), reasons: REASONS, labels: STAGE_LABEL });
    if (action === "team") return json({ team: await teamList(db, companyId), you: account.id, owner: account.companyRole === "owner" });
    if (action === "candidate") {
      const ref = url.searchParams.get("ref") ?? "";
      if (!await guard(db, { userId: account.id, companyId, action: "view_full", candidateRef: ref, ipHash: ip })) return fail("You are viewing profiles too fast. Wait a while and try again.", 429, "RATE_LIMIT");
      const out = await unlockedCandidate(db, companyId, ref, true);
      return json({ traceId: out.traceId, unlockedAt: out.unlockedAt, profile: out.profile, applications: out.applications, contactsHidden: out.contactsHidden });
    }
    if (action === "download") {
      const ref = url.searchParams.get("ref") ?? "";
      if (!await guard(db, { userId: account.id, companyId, action: "download", candidateRef: ref, ipHash: ip })) return fail("Too many downloads. Wait a while and try again.", 429, "RATE_LIMIT");
      const out = await unlockedCandidate(db, companyId, ref, true);
      const company = await db.prepare("SELECT display_name FROM companies WHERE id = ?").bind(companyId).first<{ display_name: string }>();
      const stamp = { company: company?.display_name ?? "Company", traceId: out.traceId, date: nowIso().slice(0, 10) };
      const object = env.BUCKET ? await env.BUCKET.get(out.cv.r2Key) : null;
      if (!object) throw new PortalError("NOT_FOUND", "The CV file is not available.", 404);
      const bytes = new Uint8Array(await object.arrayBuffer());
      const isPdf = out.cv.fileName.toLowerCase().endsWith(".pdf");
      // DOCX originals are never handed out: a stamped PDF rendering is produced instead.
      // Before offer stage the copy is a re-rendered CV with contact details removed; the original file is not handed out.
      const pdf = out.contactsHidden ? await renderCvPdf(out.profile, redactContacts((await extractText(bytes, isPdf ? "pdf" : "docx")).text), stamp)
        : (isPdf ? await watermarkPdf(bytes, stamp) : null) ?? await renderCvPdf(out.profile, (await extractText(bytes, isPdf ? "pdf" : "docx")).text, stamp);
      await audit(db, account.id, "cv.downloaded", "candidate_ref", ref, `trace ${out.traceId}`);
      await notifyCandidate(db, out.candidateId, "cv.downloaded", "An employer downloaded your CV", "An employer considering you for a role downloaded a copy of your CV. Each copy carries a watermark that identifies who downloaded it.", companyId);
      return new Response(pdf as Uint8Array<ArrayBuffer>, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="cv-${ref}.pdf"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
    }
    if (action === "jd") {
      const jd = await db.prepare("SELECT id, title, raw_text, requirements, status, decision_note, params_version FROM jds WHERE id = ? AND company_id = ?").bind(url.searchParams.get("id") ?? "", companyId).first();
      if (!jd) return fail("JD not found.", 404);
      return json({ jd, params: null });
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
  const { action } = await context.params;
  const account = await requireApi(request, ["team-invite", "team-reinvite", "team-remove"].includes(action) ? "company_owner" : "company", true);
  if (account instanceof Response) return account;
  const db = portalDb(), companyId = account.companyId!;
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const s = (v: unknown, max = 200) => typeof v === "string" ? v.slice(0, max) : "";
    if (action === "jd-create") {
      const out = await createJd(db, companyId, account.id, { title: s(body.title, 160), text: s(body.text, 12_000), location: s(body.location, 120), workMode: s(body.workMode, 20) });
      await setJdOpenings(db, companyId, out.id, Number(body.openings ?? 1) || 1, account.id);
      return json(out, 201);
    }
    if (action === "notices-read") { await markNoticesRead(db, companyId); return json({ message: "ok" }); }
    if (action === "jd-openings") { await setJdOpenings(db, companyId, s(body.jdId, 60), Number(body.openings ?? 1), account.id); return json({ message: "Saved." }); }
    if (action === "pipeline-stage") {
      const out = await moveStage(db, companyId, account.id, s(body.pipelineId, 60), { stage: s(body.stage, 20), reason: s(body.reason, 40), note: s(body.note, 1000), offerCtcInr: body.offerCtcInr == null || body.offerCtcInr === "" ? null : Number(body.offerCtcInr), offerDate: s(body.offerDate, 10), joiningDate: s(body.joiningDate, 10), lastWorkingDay: s(body.lastWorkingDay, 10), competingOffers: s(body.competingOffers, 300) });
      return json({ ...out, message: `Moved to “${STAGE_LABEL[out.stage]}”.${out.filled ? ` Every opening is now filled and the job is closed.${out.filled.remaining ? ` ${out.filled.remaining} other candidate(s) are still in process: you can close them out as “position filled”.` : ""}` : ""}` });
    }
    if (action === "interview-schedule") { const out = await scheduleInterview(db, companyId, account.id, s(body.pipelineId, 60), { round: s(body.round, 80), scheduledAt: s(body.scheduledAt, 40), mode: s(body.mode, 20), location: s(body.location, 300), interviewer: s(body.interviewer, 120) }); return json({ ...out, message: "Interview scheduled." }, 201); }
    if (action === "interview-record") { const out = await recordInterview(db, companyId, account.id, s(body.interviewId, 60), { status: s(body.status, 20), outcome: s(body.outcome, 20), rating: body.rating == null || body.rating === "" ? null : Number(body.rating), feedback: s(body.feedback, 2000), rejectReason: s(body.rejectReason, 40) }); return json({ ...out, message: out.moved ? "Saved, and the candidate is marked “Not selected”." : "Interview updated." }); }
    if (action === "interview-reschedule") { await rescheduleInterview(db, companyId, account.id, s(body.interviewId, 60), { scheduledAt: s(body.scheduledAt, 40), mode: s(body.mode, 20), location: s(body.location, 300), interviewer: s(body.interviewer, 120) }); return json({ message: "Interview rescheduled. The candidate is told." }); }
    if (action === "jd-fill") { const out = await closeOpenCandidates(db, companyId, account.id, s(body.jdId, 60), "filled"); return json({ ...out, message: out.closed ? `${out.closed} candidate${out.closed === 1 ? "" : "s"} closed as “position filled” and told.` : "Nobody else was in process." }); }
    if (action === "placement-exit") { const out = await reportPlacementExit(db, companyId, account.id, s(body.placementId, 60), s(body.leftOn, 10), s(body.note, 500)); return json({ ...out, message: out.inGuarantee ? "Recorded. This is inside the replacement guarantee: Jobboard300 will contact you about a replacement." : "Recorded." }); }
    if (action === "team-invite") {
      const email = s(body.email, 254), out = await inviteMember(db, companyId, account.id, email, s(body.name, 120));
      const link = `${new URL(request.url).origin}/portal/accept?token=${out.token}`;
      const mail = await sendMail({ to: email, subject: "You have been added to a Jobboard300 hiring account", text: `Open this link to set your password and sign in (valid for 7 days):\n${link}` }, link);
      return json({ message: mail.sent ? "Invitation sent by email." : "Person added. Send them this one-time link (valid for 7 days):", link: mail.sent ? undefined : link }, 201);
    }
    if (action === "team-reinvite") { const token = await reissueInvite(db, companyId, account.id, s(body.memberId, 60)); return json({ message: "New one-time link (valid for 7 days; the old one no longer works):", link: `${new URL(request.url).origin}/portal/accept?token=${token}` }); }
    if (action === "team-remove") { await removeMember(db, companyId, account.id, s(body.memberId, 60)); return json({ message: "Removed. They can no longer sign in." }); }
    if (action === "jd-update") {
      const out = await updateJdRequirements(db, companyId, s(body.jdId, 60), body.requirements, account.id);
      return json({ ...out, message: !out.changed ? "Nothing was changed." : out.status === "pending" ? "Saved. The change is with Jobboard300 for approval; your candidates stay where they are." : "Saved. Send the job for approval when you are ready." });
    }
    if (action === "jd-submit") { const out = await submitJd(db, companyId, s(body.jdId, 60), account.id); return json({ ...out, message: out.conflicts.length ? "Submitted. Jobboard300 will review the points below against your approved parameters." : "Submitted for approval." }); }
    if (action === "jd-close") {
      const out = await closeJob(db, companyId, account.id, s(body.jdId, 60));
      return json({ ...out, message: out.closed ? `Job closed. ${out.closed} candidate${out.closed === 1 ? " was" : "s were"} closed as “position closed” and told.` : "Job closed." });
    }
    return fail("Unknown action.", 404);
  } catch (error) { return failFrom(error); }
}
