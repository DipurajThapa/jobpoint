// Company matching parameters set and approved by the platform admin, and the
// check of a JD against them. A JD goes live only when this check passes and
// the admin approves it.

import { SENIORITY_ORDER, formatLpa, type Seniority } from "./india";
import { roleFamilyById } from "./roles";
import type { PortalRequirements } from "./jd";

export type MandatoryFilter = "ctc_stated" | "notice_stated" | "work_evidence_for_mandatory_skills" | "strict_mandatory_skills";

export type CompanyParams = {
  minScore: number;                 // 0..100, CVs below this are never released
  roleFamilies: string[];           // permitted role families
  seniority: Seniority[];           // permitted seniority bands
  cities: string[];                 // permitted job cities; empty = any
  allowRemote: boolean;
  ctcBands: { minInr: number; maxInr: number }[]; // permitted JD CTC bands
  maxNoticeDays: number | null;
  mandatoryFilters: MandatoryFilter[];
  maxReleasePerJd: number;          // release cap per JD (highest scores first)
  maxLiveJds: number;
};

export const DEFAULT_PARAMS: CompanyParams = { minScore: 70, roleFamilies: [], seniority: [], cities: [], allowRemote: false, ctcBands: [], maxNoticeDays: 90, mandatoryFilters: [], maxReleasePerJd: 50, maxLiveJds: 10 };

export function sanitiseParams(input: unknown): CompanyParams | string {
  if (!input || typeof input !== "object") return "Parameters are missing.";
  const r = input as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []).filter((x): x is string => typeof x === "string" && !!x.trim()).map(x => x.trim());
  // The minimum score and the release cap belonged to self-service browsing, which was removed. They are kept in the
  // record for old clients but are no longer asked for; a recruiter judges every candidate.
  const minScore = r.minScore === undefined || r.minScore === "" ? DEFAULT_PARAMS.minScore : Number(r.minScore);
  if (!Number.isFinite(minScore) || minScore < 40 || minScore > 95) return "Minimum score must be between 40 and 95.";
  const roleFamilies = list(r.roleFamilies).filter(id => roleFamilyById(id));
  if (!roleFamilies.length) return "Choose at least one permitted role family.";
  const seniority = list(r.seniority).filter((s): s is Seniority => (SENIORITY_ORDER as string[]).includes(s));
  if (!seniority.length) return "Choose at least one permitted seniority band.";
  const bands = (Array.isArray(r.ctcBands) ? r.ctcBands : []).map(b => ({ minInr: Number((b as { minInr?: unknown }).minInr), maxInr: Number((b as { maxInr?: unknown }).maxInr) }))
    .filter(b => Number.isFinite(b.minInr) && Number.isFinite(b.maxInr) && b.minInr >= 0 && b.maxInr >= b.minInr && b.maxInr <= 50_000_000).slice(0, 6);
  const notice = r.maxNoticeDays === null || r.maxNoticeDays === "" ? null : Number(r.maxNoticeDays);
  const filters = list(r.mandatoryFilters).filter((f): f is MandatoryFilter => ["ctc_stated", "notice_stated", "work_evidence_for_mandatory_skills", "strict_mandatory_skills"].includes(f));
  const cap = Number(r.maxReleasePerJd ?? 50), live = Number(r.maxLiveJds ?? 10);
  return {
    minScore: Math.round(minScore), roleFamilies, seniority, cities: list(r.cities).slice(0, 20), allowRemote: r.allowRemote === true, ctcBands: bands,
    maxNoticeDays: notice === null || !Number.isFinite(notice) ? null : Math.max(0, Math.min(180, Math.round(notice))),
    mandatoryFilters: filters,
    maxReleasePerJd: Number.isFinite(cap) ? Math.max(5, Math.min(200, Math.round(cap))) : 50,
    maxLiveJds: Number.isFinite(live) ? Math.max(1, Math.min(100, Math.round(live))) : 10,
  };
}

/** Conflicts between a JD and the company's approved parameters. Empty means it fits. */
export function jdConflicts(req: PortalRequirements, params: CompanyParams): string[] {
  const out: string[] = [];
  if (!params.roleFamilies.includes(req.roleFamily)) out.push(`Role family "${roleFamilyById(req.roleFamily)?.label ?? req.roleFamily}" is not permitted for this company.`);
  const seniority = req.hard.seniority.length ? req.hard.seniority : [...SENIORITY_ORDER];
  const outside = seniority.filter(s => !params.seniority.includes(s));
  if (outside.length === seniority.length) out.push(`Seniority (${seniority.join(", ")}) is outside the permitted bands (${params.seniority.join(", ")}).`);
  if (req.hard.remote && !params.allowRemote) out.push("Remote roles are not permitted for this company.");
  if (params.cities.length) {
    const cities = req.hard.cities;
    if (!cities.length && !req.hard.remote) out.push("The JD names no city; this company is limited to specific cities.");
    const bad = cities.filter(c => !params.cities.some(p => p.toLowerCase() === c.toLowerCase()));
    if (bad.length) out.push(`City ${bad.join(", ")} is not permitted for this company.`);
  }
  if (params.ctcBands.length) {
    const { ctcMinInr: lo, ctcMaxInr: hi } = req.hard;
    if (lo === null && hi === null) out.push("The JD gives no CTC range; this company is limited to approved CTC bands.");
    else if (!params.ctcBands.some(b => (lo ?? hi!) >= b.minInr && (hi ?? lo!) <= b.maxInr))
      out.push(`CTC ${formatLpa(lo)}–${formatLpa(hi)} is outside the approved bands (${params.ctcBands.map(b => `${formatLpa(b.minInr)}–${formatLpa(b.maxInr)}`).join("; ")}).`);
  }
  if (params.maxNoticeDays !== null && req.hard.maxNoticeDays !== null && req.hard.maxNoticeDays > params.maxNoticeDays) out.push(`Notice period up to ${req.hard.maxNoticeDays} days exceeds the approved ${params.maxNoticeDays} days.`);
  if (!req.mustHave.length) out.push("The JD has no must-have skills, so matching would be imprecise.");
  return out;
}
