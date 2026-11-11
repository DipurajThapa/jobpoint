// Read models for the portal screens. Every company-facing query is scoped to
// the company's own JDs and to released or unlocked candidates only; there is
// no query that lets a company search the candidate database.

import { parseJson, PortalError, type Db } from "./db";
import { currentParams } from "./company";
import { primaryProfile } from "./candidate";
import { formatLpa } from "./india";
import { roleFamilyById } from "./roles";
import type { PortalRequirements } from "./jd";
import { ACCESS_STAGES, CONTACT_STAGES } from "./policy";

type Stored = { summary: string; meets: string[]; misses: string[]; why: string; band: string; gaps: string[]; sd: number; nearThreshold: boolean; failedFilters: string[] };

export type JobFilters = { city?: string; role?: string; minCtcInr?: number; maxYears?: number };

/** Candidate view: live JDs that pass this candidate's hard filters, best fit first. Bands, not raw scores. */
export async function candidateJobs(db: Db, candidateId: string, f: JobFilters = {}) {
  const { results } = await db.prepare(`SELECT j.id, j.title, j.requirements, c.display_name AS company, m.score, m.explanation, a.status AS application
      FROM matches m JOIN jds j ON j.id = m.jd_id JOIN companies c ON c.id = j.company_id
      LEFT JOIN portal_applications a ON a.jd_id = j.id AND a.candidate_id = m.candidate_id
      WHERE m.candidate_id = ? AND m.hard_pass = 1 AND j.status = 'live' AND c.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM candidates k, json_each(k.hidden_company_ids) h WHERE k.id = m.candidate_id AND h.value = c.id)
      ORDER BY m.score DESC LIMIT 100`).bind(candidateId).all<{ id: string; title: string; requirements: string; company: string; score: number; explanation: string; application: string | null }>();
  return results.map(r => {
    const req = parseJson<PortalRequirements>(r.requirements, null as unknown as PortalRequirements);
    const e = parseJson<Stored>(r.explanation, null as unknown as Stored);
    return {
      id: r.id, title: r.title, company: r.company, cities: req.hard.cities, remote: req.hard.remote, roleFamily: req.roleFamily, roleLabel: roleFamilyById(req.roleFamily)?.label ?? "Other",
      ctc: req.hard.ctcMinInr || req.hard.ctcMaxInr ? `${formatLpa(req.hard.ctcMinInr)} – ${formatLpa(req.hard.ctcMaxInr)}` : "Not disclosed",
      ctcMax: req.hard.ctcMaxInr, minYears: req.minYears, maxYears: req.maxYears,
      band: e.band, gaps: e.gaps, meets: e.meets.slice(0, 4), nearThreshold: e.nearThreshold, application: r.application,
    };
  }).filter(j => (!f.city || j.cities.some(c => c.toLowerCase() === f.city!.toLowerCase()) || (j.remote && f.city.toLowerCase() === "remote"))
    && (!f.role || j.roleFamily === f.role)
    && (!f.minCtcInr || (j.ctcMax ?? Infinity) >= f.minCtcInr)
    && (f.maxYears === undefined || (j.minYears ?? 0) <= f.maxYears));
}

export async function candidateApplications(db: Db, candidateId: string) {
  const { results } = await db.prepare(`SELECT a.id, a.status, a.updated_at, j.title, c.display_name AS company, j.status AS jd_status
      FROM portal_applications a JOIN jds j ON j.id = a.jd_id JOIN companies c ON c.id = j.company_id WHERE a.candidate_id = ? ORDER BY a.updated_at DESC`).bind(candidateId).all();
  return results;
}

/** Who received this candidate's data (DPDP s.11(1)(b) access right). */
export async function candidateSharing(db: Db, candidateId: string) {
  const { results } = await db.prepare(`SELECT c.display_name AS company, u.unlocked_at, u.access_revoked_at FROM unlocks u JOIN companies c ON c.id = u.company_id WHERE u.candidate_id = ? ORDER BY u.unlocked_at DESC`).bind(candidateId).all();
  const released = await db.prepare("SELECT COUNT(DISTINCT company_id) AS n FROM releases WHERE candidate_id = ? AND revoked_at IS NULL").bind(candidateId).first<{ n: number }>();
  return { unlockedBy: results, previewCompanies: released?.n ?? 0 };
}

export async function companyDashboard(db: Db, companyId: string) {
  const company = await db.prepare("SELECT id, display_name, legal_name, status, city FROM companies WHERE id = ?").bind(companyId).first<{ id: string; display_name: string; legal_name: string; status: string; city: string }>();
  if (!company) throw new PortalError("NOT_FOUND", "Company not found.", 404);
  const params = await currentParams(db, companyId);
  const { results: jds } = await db.prepare(`SELECT j.id, j.title, j.status, j.decision_note, j.updated_at,
      (SELECT COUNT(*) FROM releases r WHERE r.jd_id = j.id AND r.revoked_at IS NULL) AS released,
      (SELECT COUNT(*) FROM unlocks u WHERE u.first_jd_id = j.id) AS unlocked,
      (SELECT COUNT(*) FROM pipeline p WHERE p.jd_id = j.id AND p.stage IN ('submitted','shortlisted','interview')) AS open_candidates
      FROM jds j WHERE j.company_id = ? ORDER BY j.status = 'closed', j.updated_at DESC LIMIT 200`).bind(companyId).all();
  return { company, params, jds };
}

/**
 * Full CV: only for a candidate this company has been given, with consent still active.
 * With `temporary` (the placement-fee model) access lasts only while a hiring process
 * for this person is open with the company, and contact details stay hidden until offer.
 */
export async function unlockedCandidate(db: Db, companyId: string, ref: string, temporary = false) {
  const u = await db.prepare(`SELECT u.candidate_id, u.trace_id, u.unlocked_at, u.access_revoked_at FROM unlocks u WHERE u.company_id = ? AND u.candidate_ref = ?`).bind(companyId, ref).first<{ candidate_id: string; trace_id: string; unlocked_at: string; access_revoked_at: string | null }>();
  if (!u) throw new PortalError("NOT_UNLOCKED", "Unlock this profile to see the full CV.", 403);
  if (u.access_revoked_at) throw new PortalError("CONSENT_WITHDRAWN", `The candidate withdrew consent on ${u.access_revoked_at.slice(0, 10)}. Delete any copy you downloaded.`, 410);
  const p = await primaryProfile(db, u.candidate_id);
  if (!p) throw new PortalError("NOT_FOUND", "The CV is no longer available.", 404);
  let contactsHidden = false;
  if (temporary) {
    const { results: open } = await db.prepare(`SELECT p.stage FROM pipeline p JOIN jds j ON j.id = p.jd_id WHERE p.company_id = ? AND p.candidate_id = ? AND j.status != 'closed' AND p.stage IN (${ACCESS_STAGES.map(() => "?").join(",")})`).bind(companyId, u.candidate_id, ...ACCESS_STAGES).all<{ stage: string }>();
    if (!open.length) throw new PortalError("ACCESS_ENDED", "This profile is available only while the hiring process for this candidate is open.", 403);
    contactsHidden = !open.some(o => (CONTACT_STAGES as readonly string[]).includes(o.stage));
    if (contactsHidden) p.profile = { ...p.profile, contact: { ...p.profile.contact, email: "", phone: "", links: [] } };
  }
  // One source for contact details: the candidate's record (the verified sign-up details) comes first, the CV's own are the fallback.
  // This is what the recruiter sees too, so the client never gets a dead address at the moment an offer goes out.
  if (!contactsHidden) {
    const rec = await db.prepare("SELECT email, phone FROM candidates WHERE id = ?").bind(u.candidate_id).first<{ email: string | null; phone: string | null }>();
    p.profile = { ...p.profile, contact: { ...p.profile.contact, email: rec?.email || p.profile.contact.email, phone: rec?.phone || p.profile.contact.phone } };
  }
  const { results: apps } = await db.prepare("SELECT a.id, a.status, j.title FROM portal_applications a JOIN jds j ON j.id = a.jd_id WHERE a.candidate_id = ? AND j.company_id = ?").bind(u.candidate_id, companyId).all();
  return { contactsHidden, candidateId: u.candidate_id, traceId: u.trace_id, unlockedAt: u.unlocked_at, profile: p.profile, cv: { r2Key: p.r2Key, fileName: p.fileName }, applications: apps };
}

export async function adminOverview(db: Db) {
  const q = (sql: string) => db.prepare(sql).all().then(r => r.results);
  const [companies, pendingJds, reviews, duplicates, flags, log, queue] = await Promise.all([
    q("SELECT c.id, c.display_name, c.legal_name, c.city, c.status, c.created_at, c.guarantee_days, c.non_solicit_months, c.fee_terms, c.fee_percent, c.email_kit_org_id, c.mandate_signed_on, c.mandate_reference, (SELECT params FROM company_parameters cp WHERE cp.company_id = c.id AND cp.status = 'approved') AS params, (SELECT COALESCE(json_extract(data, '$.name'), '') FROM email_kit_records WHERE tbl = 'orgs' AND id = c.email_kit_org_id) AS outreach_org, (SELECT COUNT(*) FROM employer_enquiries e WHERE e.company_id = c.id) AS enquiries, (SELECT email FROM company_users cu JOIN portal_accounts a ON a.id = cu.account_id WHERE cu.company_id = c.id AND cu.role = 'owner' LIMIT 1) AS owner_email FROM companies c ORDER BY CASE c.status WHEN 'applied' THEN 0 ELSE 1 END, c.created_at DESC LIMIT 200"),
    q("SELECT j.id, j.title, j.company_id, c.display_name, j.requirements, j.raw_text, j.updated_at FROM jds j JOIN companies c ON c.id = j.company_id WHERE j.status = 'pending' ORDER BY j.updated_at"),
    q("SELECT k.id, k.display_name, v.file_name, v.created_at FROM candidates k JOIN cvs v ON v.candidate_id = k.id AND v.is_primary = 1 WHERE v.parse_status = 'needs_review' ORDER BY v.created_at"),
    q(`SELECT d.id, d.kind, d.a_id, d.b_id, d.signal, d.created_at, a.display_name AS a_name, b.display_name AS b_name, a.created_at AS a_created, b.created_at AS b_created
       FROM duplicate_flags d LEFT JOIN candidates a ON a.id = d.a_id LEFT JOIN candidates b ON b.id = d.b_id WHERE d.status = 'open' ORDER BY CASE d.kind WHEN 'cv' THEN 0 ELSE 1 END, d.created_at DESC LIMIT 50`),
    q("SELECT f.id, f.subject_id, f.company_id, c.display_name, f.rule, f.detail, f.created_at FROM abuse_flags f LEFT JOIN companies c ON c.id = f.company_id WHERE f.status = 'open' ORDER BY f.created_at DESC LIMIT 100"),
    q(`SELECT 'release' AS kind, r.released_at AS at, c.display_name AS company, j.title AS jd, r.candidate_ref AS candidate, r.score, r.revoked_at FROM releases r JOIN companies c ON c.id = r.company_id JOIN jds j ON j.id = r.jd_id
       UNION ALL SELECT 'unlock', u.unlocked_at, c.display_name, j.title, u.candidate_ref, (SELECT score FROM matches m WHERE m.jd_id = u.first_jd_id AND m.candidate_id = u.candidate_id), u.access_revoked_at FROM unlocks u JOIN companies c ON c.id = u.company_id JOIN jds j ON j.id = u.first_jd_id
       ORDER BY at DESC LIMIT 300`),
    db.prepare("SELECT COUNT(*) AS n FROM score_queue").first<{ n: number }>(),
  ]);
  return { companies, pendingJds, reviews, duplicates, flags, log, queue: queue?.n ?? 0 };
}
