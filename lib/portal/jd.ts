// Portal JD requirements: the CV screening requirements plus hard filters
// (city, experience, mandatory skills, notice, CTC band, seniority) and the
// role family used for company permissions.

import type { JobRequirements, RequirementSkill } from "../ats/types";
import { parseJobDescription, sanitiseRequirements } from "../ats/jd-parser";
import { findSkills } from "../ats/taxonomy";
import { bandForYears, citiesIn, parseCtcRange, parseNoticeDays, seniorityFromText, SENIORITY_ORDER, type Seniority } from "./india";
import { roleFamilyFor } from "./roles";

export type HardFilters = {
  cities: string[];            // empty = any city
  remote: boolean;
  allowRelocation: boolean;    // candidates elsewhere who are willing to relocate pass
  minYears: number | null;
  maxYears: number | null;
  mandatorySkills: RequirementSkill[];
  maxNoticeDays: number | null;
  ctcMinInr: number | null;
  ctcMaxInr: number | null;
  seniority: Seniority[];      // empty = any
};

/** Must-have skills grouped: a group is met when any one of its skills is present ("A, B or C"). */
export type PortalRequirements = JobRequirements & { hard: HardFilters; roleFamily: string; assessmentIds: string[]; mustGroups?: string[][]; mandatoryGroups?: string[][] };

const EXPLICIT_MUST = /\b(must|mandatory|required|essential|compulsory)\b/i;
const GENERIC_FAMILIES = new Set(["soft", "language", "office"]);

/** Group must-have skills by the line they appear on: lines listing alternatives with "or" form one any-of group. */
export function groupMustHaves(text: string, mustHave: RequirementSkill[]) {
  const lines = text.split(/\n|(?<=[.;])\s+/).map(l => l.trim()).filter(Boolean);
  const ids = new Set(mustHave.map(s => s.id));
  const termIds = mustHave.filter(s => s.id.startsWith("term:"));
  const found = lines.map(l => {
    const lower = ` ${l.toLowerCase().replace(/[^a-z0-9+#.\s]/g, " ").replace(/\s+/g, " ")} `;
    const terms = termIds.filter(t => lower.includes(` ${t.id.slice(5)} `)).map(t => t.id);
    return { line: l, skills: [...new Set([...findSkills(l, { allowShortAliases: true }).map(f => f.skill.id).filter(id => ids.has(id)), ...terms])] };
  }).filter(x => x.skills.length);
  const groups: string[][] = [], mandatory: string[][] = [], placed = new Set<string>();
  // Alternatives ("A, B or C") form one any-of group and take precedence over single mentions elsewhere.
  for (const f of found) {
    if (!/\bor\b/i.test(f.line)) continue;
    const rest = f.skills.filter(id => !placed.has(id));
    if (rest.length) { groups.push(rest); rest.forEach(id => placed.add(id)); }
  }
  for (const id of ids) if (!placed.has(id)) groups.push([id]);
  // Hard (pass/fail) only for named taxonomy skills on lines that say "must", "required" or "mandatory".
  for (const f of found) {
    if (!EXPLICIT_MUST.test(f.line)) continue;
    const core = f.skills.filter(id => !id.startsWith("term:") && !GENERIC_FAMILIES.has(mustHave.find(s => s.id === id)!.family));
    if (!core.length) continue;
    if (/\bor\b/i.test(f.line)) mandatory.push([...new Set(core)]);
    else core.forEach(id => mandatory.push([id]));
  }
  const seen = new Set<string>();
  return { groups, mandatory: mandatory.filter(g => { const k = g.slice().sort().join("|"); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 4) };
}

export type JdInput = { title: string; text: string; location?: string; workMode?: string };

export function parsePortalJd(input: JdInput): PortalRequirements {
  const base = parseJobDescription({ title: input.title, description: input.text, location: input.location, workMode: input.workMode });
  const text = `${input.title}\n${input.text}`;
  // Prefer a labelled line ("CTC: 3 - 4.5 LPA"); "pay" must be a whole word so "payment" never matches.
  const ctcLine = text.match(/(?:^|\n)\s*[•\-*]?\s*(?:ctc|salary|package|compensation|stipend|pay|pay scale|remuneration)\b[^\n]{0,80}/i)?.[0]
    ?? text.match(/\b(?:ctc|salary|package|lpa|lakhs? per annum)\b[^\n]{0,80}/i)?.[0] ?? "";
  const ctc = ctcLine ? parseCtcRange(ctcLine) : null;
  const noticeLine = text.match(/\b(?:notice period|join within|immediate joiners?)\b[^\n]{0,80}/i)?.[0] ?? "";
  // An explicit number of days wins over "immediate joiners preferred" on the same line.
  const noticeDays = noticeLine.match(/(\d{1,3})\s*days?/i) ?? noticeLine.match(/(\d)\s*months?/i);
  let maxNotice = noticeDays ? (/month/i.test(noticeDays[0]) ? Number(noticeDays[1]) * 30 : Number(noticeDays[1])) : noticeLine ? parseNoticeDays(noticeLine) : null;
  if (/immediate joiners? only|only immediate/i.test(text)) maxNotice = 0;
  const cities = [...new Set([...citiesIn(input.location ?? ""), ...citiesIn(text.match(/(?:location|based (?:in|at)|job location|work location)[^\n]{0,100}/i)?.[0] ?? "")])];
  const remote = /remote/i.test(input.workMode ?? "") || cities.includes("Remote");
  const grouped = groupMustHaves(input.text, base.mustHave);
  const seniority = seniorityFromText(input.title);
  if (!seniority.length && base.minYears !== null) {
    const band = bandForYears(base.minYears);
    const upper = base.maxYears === null ? Math.min(4, band + 1) : bandForYears(base.maxYears);
    for (let i = band; i <= Math.max(band, upper); i++) seniority.push(SENIORITY_ORDER[i]);
  }
  return {
    ...base,
    hard: {
      cities: cities.filter(c => c !== "Remote"),
      remote,
      allowRelocation: !/\blocal candidates? only\b|\bonly local\b|\bmust be (based|residing) in\b/i.test(text),
      minYears: base.minYears,
      maxYears: base.maxYears,
      mandatorySkills: base.mustHave.filter(s => grouped.mandatory.flat().includes(s.id)),
      maxNoticeDays: maxNotice,
      ctcMinInr: ctc?.min ?? null,
      ctcMaxInr: ctc?.max ?? null,
      seniority,
    },
    roleFamily: roleFamilyFor(input.title, base.mustHave.map(s => s.family)),
    assessmentIds: [],
    mustGroups: grouped.groups,
    mandatoryGroups: grouped.mandatory,
  };
}

/** Validate company-edited requirements, keeping the hard filters well-formed. */
export function sanitisePortalRequirements(input: unknown, fallbackTitle: string): PortalRequirements | null {
  const base = sanitiseRequirements(input, fallbackTitle);
  if (!base || !input || typeof input !== "object") return null;
  const raw = (input as { hard?: Record<string, unknown>; roleFamily?: unknown; assessmentIds?: unknown }).hard ?? {};
  const num = (v: unknown, min: number, max: number) => v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max ? Number(v) : null;
  const list = (v: unknown) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []).filter((x): x is string => typeof x === "string" && !!x.trim()).map(x => x.trim()).slice(0, 15);
  const mandatoryNames = new Set(list(raw.mandatorySkills).map(s => s.toLowerCase()));
  const ctcMin = num(raw.ctcMinInr, 30_000, 50_000_000), ctcMax = num(raw.ctcMaxInr, 30_000, 50_000_000);
  const minYears = base.minYears;
  return {
    ...base,
    hard: {
      cities: [...new Set(list(raw.cities).flatMap(c => citiesIn(c).length ? citiesIn(c) : [c]))].filter(c => c !== "Remote"),
      remote: raw.remote === true || raw.remote === "true",
      allowRelocation: raw.allowRelocation !== false && raw.allowRelocation !== "false",
      minYears,
      maxYears: base.maxYears,
      mandatorySkills: base.mustHave.filter(s => mandatoryNames.has(s.name.toLowerCase()) || mandatoryNames.has(s.id)),
      maxNoticeDays: num(raw.maxNoticeDays, 0, 180),
      ctcMinInr: ctcMin,
      ctcMaxInr: ctcMax !== null && ctcMin !== null && ctcMax < ctcMin ? null : ctcMax,
      seniority: list(raw.seniority).filter((s): s is Seniority => (SENIORITY_ORDER as string[]).includes(s)),
    },
    mandatoryGroups: base.mustHave.filter(s => mandatoryNames.has(s.name.toLowerCase()) || mandatoryNames.has(s.id)).map(s => [s.id]),
    mustGroups: base.mustHave.map(s => [s.id]),
    roleFamily: typeof (input as { roleFamily?: unknown }).roleFamily === "string" ? String((input as { roleFamily: string }).roleFamily).slice(0, 40) : roleFamilyFor(base.title, base.mustHave.map(s => s.family)),
    assessmentIds: list((input as { assessmentIds?: unknown }).assessmentIds),
  };
}
