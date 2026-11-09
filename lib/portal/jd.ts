// Portal JD requirements: the CV screening requirements plus hard filters
// (city, experience, mandatory skills, notice, CTC band, seniority) and the
// role family used for company permissions.

import type { JobRequirements, RequirementSkill } from "../ats/types";
import { parseJobDescription, sanitiseRequirements } from "../ats/jd-parser";
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

export type PortalRequirements = JobRequirements & { hard: HardFilters; roleFamily: string; assessmentIds: string[] };

export type JdInput = { title: string; text: string; location?: string; workMode?: string };

export function parsePortalJd(input: JdInput): PortalRequirements {
  const base = parseJobDescription({ title: input.title, description: input.text, location: input.location, workMode: input.workMode });
  const text = `${input.title}\n${input.text}`;
  const ctcLine = text.match(/(?:ctc|salary|package|compensation|pay|stipend)[^\n]{0,80}/i)?.[0] ?? "";
  const ctc = ctcLine ? parseCtcRange(ctcLine) : null;
  const noticeLine = text.match(/(?:notice period|joining|join within|immediate joiners?)[^\n]{0,60}/i)?.[0] ?? "";
  let maxNotice = noticeLine ? parseNoticeDays(noticeLine.replace(/preferred|preferably/gi, "")) : null;
  if (/immediate joiners? only|only immediate/i.test(text)) maxNotice = 0;
  const cities = [...new Set([...citiesIn(input.location ?? ""), ...citiesIn(text.match(/(?:location|based (?:in|at)|job location|work location)[^\n]{0,100}/i)?.[0] ?? "")])];
  const remote = /remote/i.test(input.workMode ?? "") || cities.includes("Remote");
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
      mandatorySkills: base.mustHave.filter(s => s.family !== "soft" && s.family !== "language").slice(0, 6),
      maxNoticeDays: maxNotice,
      ctcMinInr: ctc?.min ?? null,
      ctcMaxInr: ctc?.max ?? null,
      seniority,
    },
    roleFamily: roleFamilyFor(input.title, base.mustHave.map(s => s.family)),
    assessmentIds: [],
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
    roleFamily: typeof (input as { roleFamily?: unknown }).roleFamily === "string" ? String((input as { roleFamily: string }).roleFamily).slice(0, 40) : roleFamilyFor(base.title, base.mustHave.map(s => s.family)),
    assessmentIds: list((input as { assessmentIds?: unknown }).assessmentIds),
  };
}
