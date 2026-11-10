import { env } from "cloudflare:workers";
import { adminActor, isOwnerRequest } from "@/lib/admin";
import { portalDb, portalSecret, json, fail, failFrom, sameOrigin } from "@/lib/portal/session";
import { activateCompany, decideJd, decideParamRequest, enqueue, requestParamChange } from "@/lib/portal/company";
import { adjustQuota, assignPlan, upsertPlans } from "@/lib/portal/quota";
import { mergeCandidates, primaryProfile, purgeExpiredStubs, resolveReview } from "@/lib/portal/candidate";
import { drainQueue } from "@/lib/portal/queue";
import { adminOverview } from "@/lib/portal/views";
import { selfService } from "@/lib/portal/policy";
import { decideAssessment, decideHeldAttempt } from "@/lib/portal/assessment";
import { DEFAULT_PLANS, seedServices } from "@/lib/portal/plans";
import { audit } from "@/lib/portal/db";
import { adminClientWork, inviteClient, setJdService, submissionCandidates, submitByRecruiter, updateClientTerms } from "@/lib/portal/client";
import { sendMail } from "@/lib/portal/mailer";
import { weeklySummaries } from "@/lib/portal/notify";
import { countUnlinkedWebsiteApplications, linkWebsiteApplication, unlinkedWebsiteApplications } from "@/lib/portal/website";
import { canonicalCity, seniorityFor } from "@/lib/portal/india";
import { resolveSkill } from "@/lib/ats/taxonomy";
import { roleFamilyFor } from "@/lib/portal/roles";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ action: string }> };

export async function GET(request: Request, context: Ctx) {
  if (!await isOwnerRequest(request)) return fail("Sign-in required.", 401);
  const { action } = await context.params;
  const db = portalDb();
  try {
    if (action === "overview") {
      const plans = await db.prepare("SELECT COUNT(*) AS n FROM plans").first<{ n: number }>();
      if (!plans?.n) { await upsertPlans(db, DEFAULT_PLANS); await seedServices(db); }
      return json({ ...await adminOverview(db), selfService: selfService(env.CLIENT_SELF_SERVICE), clientWork: await adminClientWork(db), websiteUnlinked: await countUnlinkedWebsiteApplications(db) });
    }
    if (action === "submission-candidates") return json({ candidates: await submissionCandidates(db, new URL(request.url).searchParams.get("jd") ?? "") });
    if (action === "review-cv") {
      // Admin opens an unreadable CV to transcribe it. Audited.
      const id = new URL(request.url).searchParams.get("candidate") ?? "";
      const p = await primaryProfile(db, id);
      const object = p && env.BUCKET ? await env.BUCKET.get(p.r2Key) : null;
      if (!object) return fail("CV not found.", 404);
      await audit(db, adminActor(request), "cv.review_opened", "candidate", id);
      return new Response(object.body, { headers: { "content-type": "application/octet-stream", "content-disposition": `attachment; filename="review-${id}.${p!.fileName.split(".").pop()}"`, "cache-control": "private, no-store", "content-security-policy": "sandbox" } });
    }
    return fail("Unknown action.", 404);
  } catch (error) { return failFrom(error); }
}

export async function POST(request: Request, context: Ctx) {
  if (!sameOrigin(request)) return fail("Cross-site requests are not accepted.", 403);
  if (!await isOwnerRequest(request)) return fail("Sign-in required.", 401);
  const { action } = await context.params;
  const db = portalDb(), admin = adminActor(request);
  try {
    const b = await request.json().catch(() => ({})) as Record<string, unknown>;
    const s = (v: unknown, max = 200) => typeof v === "string" ? v.slice(0, max) : "";
    const done = async (message: string, extra: object = {}) => { const queue = await drainQueue(db, portalSecret(), 400); return json({ message, queue, ...extra }); };
    switch (action) {
      case "link-website-applications": {
        let linked = 0, unreadable = 0;
        for (const { app, resumeKey } of await unlinkedWebsiteApplications(db, 25)) {
          const object = resumeKey && env.BUCKET ? await env.BUCKET.get(resumeKey) : null;
          const out = await linkWebsiteApplication(db, env.BUCKET ?? null, app, object ? new Uint8Array(await object.arrayBuffer()) : null, admin);
          linked++; if (out.cv === "unreadable" || out.cv === "needs_review") unreadable++;
        }
        return done(`${linked} website application(s) added to the candidate list${unreadable ? `; ${unreadable} CV(s) need manual review` : ""}.`);
      }
      case "client-invite": {
        const out = await inviteClient(db, { displayName: s(b.displayName, 120), legalName: s(b.legalName, 160), city: s(b.city, 80), website: s(b.website), gstin: s(b.gstin, 15), ownerEmail: s(b.ownerEmail, 254), ownerName: s(b.ownerName, 120), guaranteeDays: Number(b.guaranteeDays ?? 60), nonSolicitMonths: Number(b.nonSolicitMonths ?? 12), feeTerms: s(b.feeTerms, 300), feePercent: b.feePercent == null || b.feePercent === "" ? undefined : Number(b.feePercent), params: b.params, plan: s(b.plan, 20) || "free" }, admin);
        const link = `${new URL(request.url).origin}/portal/accept?token=${out.token}`;
        const mail = await sendMail({ to: s(b.ownerEmail, 254), subject: "Your Jobboard300 hiring account is ready", text: `Jobboard300 has set up a hiring account for ${s(b.displayName, 120)}. Open this link to set your password and sign in (valid for 7 days):\n${link}` }, link);
        return done(mail.sent ? "Client created and the owner has been emailed a one-time link. Copy of the link:" : "Client created. Send the owner this one-time link (valid for 7 days):", { link });
      }
      case "client-terms": await updateClientTerms(db, s(b.companyId, 60), Number(b.guaranteeDays), s(b.feeTerms, 300), admin, Number(b.nonSolicitMonths ?? 12), b.feePercent == null || b.feePercent === "" ? undefined : Number(b.feePercent)); return json({ message: "Client terms saved." });
      case "jd-service": {
        const jd = await db.prepare("SELECT company_id, openings FROM jds WHERE id = ?").bind(s(b.jdId, 60)).first<{ company_id: string; openings: number }>();
        if (!jd) return fail("Job not found.", 404);
        await setJdService(db, jd.company_id, s(b.jdId, 60), s(b.service, 10), Number(b.openings ?? jd.openings), admin);
        return json({ message: "Job service updated." });
      }
      case "submit-candidate": {
        const out = await submitByRecruiter(db, portalSecret(), { companyId: s(b.companyId, 60), jdId: s(b.jdId, 60), candidateId: s(b.candidateId, 60), note: s(b.note, 2000) }, admin);
        return json({ ...out, message: "Submitted to the client. It appears in their pipeline for review." });
      }
      case "placement-status": {
        const status = s(b.status, 20);
        if (!["active", "left_in_guarantee", "replaced", "left"].includes(status)) return fail("Invalid status.");
        const r = await db.prepare("UPDATE placements SET status = ?, note = CASE WHEN ? = '' THEN note ELSE ? END WHERE id = ?").bind(status, s(b.note, 500), s(b.note, 500), s(b.placementId, 60)).run();
        if (!r.meta.changes) return fail("Placement not found.", 404);
        await audit(db, admin, "placement.status", "placement", s(b.placementId, 60), status);
        return json({ message: "Placement updated." });
      }
      case "company-activate": await activateCompany(db, s(b.companyId, 60), b.params, admin, s(b.plan, 20) || "free"); return done("Company approved with its matching parameters and plan.");
      case "company-params": { const id = await requestParamChange(db, s(b.companyId, 60), b.params, admin); const out = await decideParamRequest(db, id, true, admin, "Set by admin"); return done(`Parameters updated.${out.paused.length ? ` ${out.paused.length} live JD(s) paused because they no longer fit.` : ""}`); }
      case "company-status": {
        const status = s(b.status, 20);
        if (!["active", "suspended", "closed"].includes(status)) return fail("Invalid status.");
        await db.prepare("UPDATE companies SET status = ? WHERE id = ?").bind(status, s(b.companyId, 60)).run();
        await audit(db, admin, `company.${status}`, "company", s(b.companyId, 60), s(b.note, 300));
        return done(`Company ${status}.`);
      }
      case "plan-assign": await assignPlan(db, s(b.companyId, 60), s(b.plan, 20), admin); return json({ message: "Plan assigned. Payments are a stub: record the invoice separately." });
      case "quota-adjust": await adjustQuota(db, s(b.companyId, 60), Number(b.delta), s(b.note, 300), admin); return json({ message: "Quota adjusted." });
      case "params-decide": { const out = await decideParamRequest(db, s(b.requestId, 60), b.approve === true, admin, s(b.note, 500)); return done(b.approve === true ? `Parameters approved.${out.paused.length ? ` ${out.paused.length} live JD(s) paused.` : ""}` : "Request rejected."); }
      case "jd-decide": await decideJd(db, s(b.jdId, 60), b.approve === true, admin, s(b.note, 500)); return done(b.approve === true ? "JD is live. Matching CVs will be released automatically." : "JD rejected.");
      case "assessment-decide": await decideAssessment(db, s(b.assessmentId, 60), b.approve === true, admin); return json({ message: "Assessment decision saved." });
      case "attempt-review": {
        const candidateId = await decideHeldAttempt(db, s(b.attemptId, 60), b.accept === true, admin);
        await enqueue(db, "candidate", candidateId, "assessment").run();
        await drainQueue(db, portalSecret(), 300);
        return json({ message: b.accept === true ? "Attempt cleared; it now counts." : "Attempt voided; it does not count." });
      }
      case "review-resolve": {
        const id = s(b.candidateId, 60), p = await primaryProfile(db, id);
        if (!p) return fail("Candidate not found.", 404);
        const years = Math.max(0, Math.min(45, Number(b.years ?? 0)));
        const skills = String(b.skills ?? "").split(",").map(x => resolveSkill(x.trim())).filter(Boolean).map(r => ({ ...r!, evidence: "work" as const, months: Math.round(years * 12), lastUsedYear: new Date().getFullYear(), snippet: "Transcribed by a Jobboard300 reviewer from the original CV." }));
        const profile = { ...p.profile, headline: s(b.title, 120), skills, totalExperienceMonths: Math.round(years * 12), statedExperienceYears: years,
          work: s(b.title) ? [{ title: s(b.title, 120), employer: "", location: "", start: null, end: null, current: true, months: Math.round(years * 12), highlights: [] }] : [],
          parse: { ...p.profile.parse, confidence: 0.7, warnings: [...p.profile.parse.warnings, "Transcribed manually by a reviewer."] },
          india: { ...p.profile.india, currentCity: b.city ? canonicalCity(s(b.city, 80)) : p.profile.india.currentCity, yearsExperience: years, seniority: seniorityFor(years, s(b.title)), roleFamily: roleFamilyFor(s(b.title), skills.map(x => x.family)), noticeDays: b.noticeDays === "" || b.noticeDays === undefined ? p.profile.india.noticeDays : Number(b.noticeDays), ctcExpectedInr: b.ctcExpectedInr ? Number(b.ctcExpectedInr) : p.profile.india.ctcExpectedInr } };
        await resolveReview(db, id, profile, admin);
        return done("CV reviewed and released for matching.");
      }
      case "merge": await mergeCandidates(db, s(b.survivorId, 60), s(b.duplicateId, 60), admin); return done("Candidates merged.");
      case "duplicate-dismiss": await db.prepare("UPDATE duplicate_flags SET status = 'dismissed', resolved_by = ? WHERE id = ?").bind(admin, s(b.flagId, 60)).run(); return json({ message: "Flag dismissed." });
      case "flag-resolve": {
        const flag = await db.prepare("SELECT subject_id, subject_kind FROM abuse_flags WHERE id = ?").bind(s(b.flagId, 60)).first<{ subject_id: string; subject_kind: string }>();
        if (!flag) return fail("Flag not found.", 404);
        const statements = [db.prepare("UPDATE abuse_flags SET status = ? WHERE id = ?").bind(b.suspend === true ? "actioned" : "dismissed", s(b.flagId, 60))];
        if (b.suspend === true) statements.push(db.prepare("UPDATE portal_accounts SET status = 'suspended' WHERE id = ?").bind(flag.subject_id), db.prepare("DELETE FROM portal_sessions WHERE account_id = ?").bind(flag.subject_id));
        await db.batch(statements);
        await audit(db, admin, b.suspend === true ? "account.suspended" : "flag.dismissed", flag.subject_kind, flag.subject_id);
        return json({ message: b.suspend === true ? "Account suspended and signed out." : "Flag dismissed." });
      }
      case "verify-link": {
        // Fallback while email is not configured: admin issues a verification link.
        const { issuePortalToken } = await import("@/lib/portal/accounts");
        const row = await db.prepare("SELECT id FROM portal_accounts WHERE email = ?").bind(s(b.email, 254).toLowerCase()).first<{ id: string }>();
        if (!row) return fail("No account with that email.", 404);
        const token = await issuePortalToken(db, row.id, b.purpose === "reset" ? "reset" : "verify", 48);
        await audit(db, admin, "portal.link_issued", "account", row.id, String(b.purpose ?? "verify"));
        return json({ link: `${new URL(request.url).origin}/portal/${b.purpose === "reset" ? "reset" : "verify"}?token=${token}`, message: "One-time link created. Send it to the account holder." });
      }
      case "run-queue": { const purged = await purgeExpiredStubs(db), summaries = await weeklySummaries(db); return done(`Scoring queue processed.${purged ? ` ${purged} expired deletion record(s) purged.` : ""}${summaries ? ` ${summaries} weekly summary message(s) sent to candidates.` : ""}`); }
      default: return fail("Unknown action.", 404);
    }
  } catch (error) { return failFrom(error); }
}
