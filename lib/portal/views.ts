// Read models for the portal screens. Every company-facing query is scoped to
// the company's own JDs and to released or unlocked candidates only; there is
// no query that lets a company search the candidate database.

import { parseJson, PortalError, type Db } from "./db";
import { ACTIVE_CONSENT_SQL } from "./consent";
import { currentParams } from "./company";
import { quotaStatus } from "./quota";
import { primaryProfile } from "./candidate";
import { buildPreview, type Preview } from "./preview";
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
  const pending = await db.prepare("SELECT version, created_at FROM company_parameters WHERE company_id = ? AND status = 'requested'").bind(companyId).first();
  const { results: jds } = await db.prepare(`SELECT j.id, j.title, j.status, j.decision_note, j.updated_at,
      (SELECT COUNT(*) FROM releases r WHERE r.jd_id = j.id AND r.revoked_at IS NULL) AS released,
      (SELECT COUNT(*) FROM unlocks u WHERE u.first_jd_id = j.id) AS unlocked
      FROM jds j WHERE j.company_id = ? AND j.status != 'closed' ORDER BY j.updated_at DESC`).bind(companyId).all();
  return { company, params, pendingRequest: pending, quota: await quotaStatus(db, companyId), jds };
}

export type CompanyMatch = Preview & { unlocked: boolean; releasedAt: string; lowerBound: number };

/** Company view for one JD: released candidates only, anonymised until unlocked. */
export async function companyMatches(db: Db, companyId: string, jdId: string): Promise<{ jd: { id: string; title: string; status: string }; matches: CompanyMatch[] }> {
  const jd = await db.prepare("SELECT id, title, status FROM jds WHERE id = ? AND company_id = ?").bind(jdId, companyId).first<{ id: string; title: string; status: string }>();
  if (!jd) throw new PortalError("NOT_FOUND", "JD not found.", 404);
  const { results } = await db.prepare(`SELECT r.candidate_id, r.candidate_ref, r.released_at, m.score, m.lower_bound, m.explanation,
      EXISTS (SELECT 1 FROM unlocks u WHERE u.company_id = r.company_id AND u.candidate_id = r.candidate_id AND u.access_revoked_at IS NULL) AS unlocked
      FROM releases r JOIN matches m ON m.jd_id = r.jd_id AND m.candidate_id = r.candidate_id
      WHERE r.jd_id = ? AND r.company_id = ? AND r.revoked_at IS NULL AND ${ACTIVE_CONSENT_SQL("r.candidate_id", "share_with_companies")}
      ORDER BY m.lower_bound DESC, m.score DESC`).bind(jdId, companyId).all<{ candidate_id: string; candidate_ref: string; released_at: string; score: number; lower_bound: number; explanation: string; unlocked: number }>();
  const matches: CompanyMatch[] = [];
  for (const r of results) {
    const p = await primaryProfile(db, r.candidate_id);
    if (!p) continue;
    const e = parseJson<Stored>(r.explanation, null as unknown as Stored);
    const assessed = (await db.prepare("SELECT DISTINCT s.title FROM assessment_attempts a JOIN assessments s ON s.id = a.assessment_id WHERE a.candidate_id = ? AND a.status = 'submitted' AND a.integrity_status = 'ok' AND (s.owner_kind = 'platform' OR s.jd_id = ?)").bind(r.candidate_id, jdId).all<{ title: string }>()).results.map(x => x.title);
    matches.push({ ...buildPreview(p.profile, r.candidate_ref, r.score, { summary: e.summary, meets: e.meets, misses: e.misses, why: e.why }, assessed), unlocked: !!r.unlocked, releasedAt: r.released_at, lowerBound: r.lower_bound });
  }
  return { jd, matches };
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
  const { results: apps } = await db.prepare("SELECT a.id, a.status, j.title FROM portal_applications a JOIN jds j ON j.id = a.jd_id WHERE a.candidate_id = ? AND j.company_id = ?").bind(u.candidate_id, companyId).all();
  return { contactsHidden, candidateId: u.candidate_id, traceId: u.trace_id, unlockedAt: u.unlocked_at, profile: p.profile, cv: { r2Key: p.r2Key, fileName: p.fileName }, applications: apps };
}

export async function adminOverview(db: Db) {
  const q = (sql: string) => db.prepare(sql).all().then(r => r.results);
  const [companies, paramRequests, pendingJds, reviews, duplicates, flags, log, queue, heldAttempts] = await Promise.all([
    q("SELECT c.id, c.display_name, c.legal_name, c.city, c.status, c.created_at, c.guarantee_days, c.non_solicit_months, c.fee_terms, c.fee_percent, (SELECT email FROM company_users cu JOIN portal_accounts a ON a.id = cu.account_id WHERE cu.company_id = c.id AND cu.role = 'owner' LIMIT 1) AS owner_email FROM companies c ORDER BY CASE c.status WHEN 'applied' THEN 0 ELSE 1 END, c.created_at DESC LIMIT 200"),
    q("SELECT p.id, p.company_id, c.display_name, p.version, p.params, p.created_at, (SELECT params FROM company_parameters x WHERE x.company_id = p.company_id AND x.status = 'approved') AS current FROM company_parameters p JOIN companies c ON c.id = p.company_id WHERE p.status = 'requested' ORDER BY p.created_at"),
    q("SELECT j.id, j.title, j.company_id, c.display_name, j.requirements, j.raw_text, j.updated_at FROM jds j JOIN companies c ON c.id = j.company_id WHERE j.status = 'pending' ORDER BY j.updated_at"),
    q("SELECT k.id, k.display_name, v.file_name, v.created_at FROM candidates k JOIN cvs v ON v.candidate_id = k.id AND v.is_primary = 1 WHERE v.parse_status = 'needs_review' ORDER BY v.created_at"),
    q(`SELECT d.id, d.kind, d.a_id, d.b_id, d.signal, d.created_at, a.display_name AS a_name, b.display_name AS b_name, a.created_at AS a_created, b.created_at AS b_created
       FROM duplicate_flags d LEFT JOIN candidates a ON a.id = d.a_id LEFT JOIN candidates b ON b.id = d.b_id WHERE d.status = 'open' ORDER BY CASE d.kind WHEN 'cv' THEN 0 ELSE 1 END, d.created_at DESC LIMIT 50`),
    q("SELECT f.id, f.subject_id, f.company_id, c.display_name, f.rule, f.detail, f.created_at FROM abuse_flags f LEFT JOIN companies c ON c.id = f.company_id WHERE f.status = 'open' ORDER BY f.created_at DESC LIMIT 100"),
    q(`SELECT 'release' AS kind, r.released_at AS at, c.display_name AS company, j.title AS jd, r.candidate_ref AS candidate, r.score, r.revoked_at FROM releases r JOIN companies c ON c.id = r.company_id JOIN jds j ON j.id = r.jd_id
       UNION ALL SELECT 'unlock', u.unlocked_at, c.display_name, j.title, u.candidate_ref, (SELECT score FROM matches m WHERE m.jd_id = u.first_jd_id AND m.candidate_id = u.candidate_id), u.access_revoked_at FROM unlocks u JOIN companies c ON c.id = u.company_id JOIN jds j ON j.id = u.first_jd_id
       ORDER BY at DESC LIMIT 300`),
    db.prepare("SELECT COUNT(*) AS n FROM score_queue").first<{ n: number }>(),
    q("SELECT a.id, a.candidate_id, k.display_name, s.title, a.score, a.integrity, a.submitted_at FROM assessment_attempts a JOIN assessments s ON s.id = a.assessment_id JOIN candidates k ON k.id = a.candidate_id WHERE a.integrity_status = 'review' AND a.status = 'submitted' ORDER BY a.submitted_at LIMIT 100"),
  ]);
  const { results: plans } = await db.prepare("SELECT code, name, unlock_quota, validity_days, price_inr, is_free FROM plans WHERE active = 1 ORDER BY unlock_quota").all();
  return { companies, paramRequests, pendingJds, reviews, duplicates, flags, log, queue: queue?.n ?? 0, plans, heldAttempts };
}
