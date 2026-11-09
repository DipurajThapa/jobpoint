// Portal candidate profile: the CV screening profile plus Indian-market fields,
// and the rules for candidate corrections.

import type { CandidateProfile, CandidateSkill } from "../ats/types";
import { resolveSkill, normalise } from "../ats/taxonomy";
import { canonicalCity, indianCvFields, parseCtcInr, parseNoticeDays, seniorityFor, type Seniority } from "./india";
import { roleFamilyFor } from "./roles";

export type IndiaFields = {
  ctcCurrentInr: number | null;
  ctcExpectedInr: number | null;
  noticeDays: number | null;
  currentCity: string;
  preferredCities: string[];
  willingToRelocate: boolean | null;
  seniority: Seniority;
  yearsExperience: number;
  roleFamily: string;
};

export type PortalProfile = CandidateProfile & {
  india: IndiaFields;
  /** Fields the candidate changed after parsing; they are treated as self-reported. */
  selfReported: string[];
};

export function enrichProfile(profile: CandidateProfile, text: string, now = new Date()): PortalProfile {
  const f = indianCvFields(text, now);
  const years = Math.round(profile.totalExperienceMonths / 12 * 10) / 10 || (profile.work.some(w => w.start) ? 0 : profile.statedExperienceYears ?? 0);
  const recentTitle = profile.work[0]?.title || profile.headline;
  return {
    ...profile,
    india: {
      ctcCurrentInr: f.ctcCurrentInr ?? (profile.currentCtc ? parseCtcInr(profile.currentCtc) : null),
      ctcExpectedInr: f.ctcExpectedInr ?? (profile.expectedCtc ? parseCtcInr(profile.expectedCtc) : null),
      noticeDays: f.noticeDays ?? (profile.noticePeriod ? parseNoticeDays(profile.noticePeriod, now) : null),
      currentCity: f.currentCity || (profile.contact.location ? canonicalCity(profile.contact.location) : ""),
      preferredCities: f.preferredCities,
      willingToRelocate: f.willingToRelocate,
      seniority: seniorityFor(years, recentTitle),
      yearsExperience: years,
      roleFamily: roleFamilyFor(recentTitle, profile.skills.filter(s => s.evidence === "work").map(s => s.family)),
    },
    selfReported: [],
  };
}

/** Fields a candidate may correct. Identity and evidence are never editable. */
export type Correction = Partial<{
  currentCity: string; preferredCities: string[]; willingToRelocate: boolean;
  ctcCurrentInr: number | null; ctcExpectedInr: number | null; noticeDays: number | null;
  addSkills: string[]; removeSkills: string[]; headline: string;
}>;

/**
 * Apply a candidate correction. Skills the candidate adds that the CV text does
 * not support count as "listed" (the lowest evidence credit), so editing the
 * profile cannot buy rank. Removing a skill is always allowed.
 */
export function applyCorrection(profile: PortalProfile, correction: Correction, cvText: string): { profile: PortalProfile; changed: string[] } {
  const next: PortalProfile = structuredClone(profile);
  const changed: string[] = [];
  const set = <K extends keyof IndiaFields>(key: K, value: IndiaFields[K]) => {
    if (JSON.stringify(next.india[key]) !== JSON.stringify(value)) { next.india[key] = value; changed.push(key); }
  };
  if (typeof correction.currentCity === "string") set("currentCity", correction.currentCity ? canonicalCity(correction.currentCity) : "");
  if (Array.isArray(correction.preferredCities)) set("preferredCities", [...new Set(correction.preferredCities.filter(c => typeof c === "string" && c.trim()).map(canonicalCity))].slice(0, 8));
  if (typeof correction.willingToRelocate === "boolean") set("willingToRelocate", correction.willingToRelocate);
  for (const key of ["ctcCurrentInr", "ctcExpectedInr"] as const) {
    const value = correction[key];
    if (value === null || (typeof value === "number" && value >= 30_000 && value <= 50_000_000)) set(key, value === null ? null : Math.round(value));
  }
  if (correction.noticeDays === null || (typeof correction.noticeDays === "number" && correction.noticeDays >= 0 && correction.noticeDays <= 180)) set("noticeDays", correction.noticeDays ?? null);
  if (typeof correction.headline === "string" && correction.headline.trim() !== next.headline) { next.headline = correction.headline.trim().slice(0, 120); changed.push("headline"); }
  const text = normalise(cvText);
  for (const raw of correction.removeSkills ?? []) {
    const before = next.skills.length;
    next.skills = next.skills.filter(s => s.id !== raw && s.name.toLowerCase() !== String(raw).toLowerCase());
    if (next.skills.length !== before) changed.push(`skill-:${raw}`);
  }
  for (const raw of (correction.addSkills ?? []).slice(0, 20)) {
    const resolved = typeof raw === "string" ? resolveSkill(raw) : null;
    if (!resolved || next.skills.some(s => s.id === resolved.id)) continue;
    const inCv = text.includes(` ${normalise(resolved.name).trim()} `);
    const skill: CandidateSkill = { ...resolved, evidence: "listed", months: 0, lastUsedYear: null, snippet: inCv ? "Added by the candidate; also mentioned in the CV." : "Added by the candidate; not found in the CV." };
    next.skills.push(skill);
    changed.push(`skill+:${resolved.id}`);
  }
  next.selfReported = [...new Set([...next.selfReported, ...changed])];
  return { profile: next, changed };
}
