// Job description parser: the employer's JD text in, structured requirements out.
// The result is a starting point. Recruiters can edit it in the console, and
// edited requirements are saved per role and used for every screening.

import type { JobRequirements, RequirementSkill } from "./types";
import { DEGREES } from "./cv-parser";
import { findSkills, resolveSkill } from "./taxonomy";

export type JobInput = { title: string; description: string; requirements?: string; location?: string; workMode?: string };

type Kind = "must" | "nice" | "duty";

const NICE = /\b(preferred|preferably|preferable|nice to have|good to have|an advantage|added advantage|a plus|plus point|desirable|bonus|optional|would be great|is a plus|will be an advantage|beneficial)\b/i;
const MUST = /\b(must|required|requirements?|mandatory|essential|minimum|at least|atleast|should have|should possess|should be|need to|needs to|necessary|compulsory|eligibility|candidates? (with|having))\b/i;
const HEADINGS: [Kind, RegExp][] = [
  ["nice", /^(preferred|good to have|nice to have|desirable|bonus|plus|additional)( skills| qualifications| requirements)?\s*:?$/i],
  ["must", /^(requirements?|qualifications?|skills( required)?|required skills|must have|must-have|desired (candidate )?profile|candidate profile|eligibility( criteria)?|who (can|should) apply|what we('re| are) looking for|key skills|essential( skills)?)\s*:?$/i],
  ["duty", /^(responsibilities|key responsibilities|roles?( and responsibilities)?|duties|job description|what you('ll| will) do|about the role|the role|key result areas|kras?)\s*:?$/i],
];
const PHRASE = /\b(?:knowledge of|experience (?:in|with|of)|proficiency (?:in|with)|proficient in|familiarity with|familiar with|hands[- ]on (?:experience )?(?:in|with)|expertise in|working knowledge of|understanding of|skilled in|ability to use)\s+([^.;:()]{3,120})/gi;
const FIELD_OF: Record<string, string> = { "B.Com": "Commerce", "M.Com": "Commerce", "BBA": "Management", "MBA / PGDM": "Management", "BCA": "Computer Applications", "MCA": "Computer Applications", "B.Tech / B.E.": "Engineering", "M.Tech / M.E.": "Engineering", "B.Sc": "Science", "M.Sc": "Science", "B.Pharm": "Pharmacy", "Chartered Accountant": "Accounting", "CMA / CS": "Accounting" };

export function parseJobDescription(job: JobInput): JobRequirements {
  const notes: string[] = [];
  const mentions: { skill: RequirementSkill; kind: Kind }[] = [];
  const blocks: [string, Kind][] = [[job.requirements ?? "", "must"], [job.description, "duty"]];
  let educationLevel: number | null = null;
  const educationFields = new Set<string>();
  let minYears: number | null = null, maxYears: number | null = null;

  for (const [block, defaultKind] of blocks) {
    let context: Kind = defaultKind;
    for (const raw of splitLines(block)) {
      const heading = HEADINGS.find(([, re]) => re.test(raw));
      if (heading) { context = heading[0]; continue; }
      const kind: Kind = NICE.test(raw) ? "nice" : MUST.test(raw) ? "must" : context;
      for (const f of findSkills(raw, { allowShortAliases: true })) mentions.push({ skill: { id: f.skill.id, name: f.skill.label, family: f.skill.family }, kind });
      for (const m of raw.matchAll(PHRASE)) {
        for (const item of m[1].split(/\s*,\s*|\s+and\s+|\s+or\s+|\s*\/\s*/)) {
          const text = item.replace(/^(?:(?:the|a|an|any|basic|good|strong|sound|excellent|advanced|working|hands[- ]on|proven|relevant)\s+)+/i, "").replace(/\s+(?:preferred|preferably|is an advantage|an advantage|is a plus)$/i, "").trim();
          // Keep short noun phrases only; drop qualifiers ("preferably in a trading", "manufacturing company").
          if (text.length < 3 || text.split(/\s+/).length > 3 || /\b(preferab\w*|company|companies|industry|firm|organisation|organization|environment|years?|role|team|similar|related|field|domain|sector|in a|in an)\b/i.test(text) || findSkills(text, { allowShortAliases: true }).length) continue;
          const resolved = resolveSkill(text);
          if (resolved) mentions.push({ skill: resolved, kind });
        }
      }
      const years = parseYears(raw);
      if (years && (minYears === null || (kind !== "nice" && years.min > minYears))) { minYears = years.min; maxYears = years.max; }
      if (/\bfreshers?\b/i.test(raw) && minYears === null) { minYears = 0; notes.push("The description welcomes freshers."); }
      const degrees = DEGREES.filter(([re]) => re.test(raw));
      if (degrees.length && (/\b(qualification|education|degree|graduat\w*|pass(ed)?|bachelor|master|diploma|12th|10th)\b/i.test(raw) || kind !== "duty")) {
        const level = /\bany graduate\b/i.test(raw) ? 4 : Math.min(...degrees.map(d => d[2]));
        if (kind !== "nice" && (educationLevel === null || level < educationLevel)) educationLevel = level;
        if (!/\bany (graduate|degree|stream|discipline)\b/i.test(raw)) for (const d of degrees) if (FIELD_OF[d[1]]) educationFields.add(FIELD_OF[d[1]]);
      }
    }
  }

  const must = unique(mentions.filter(m => m.kind === "must").map(m => m.skill));
  const duty = unique(mentions.filter(m => m.kind === "duty").map(m => m.skill));
  const nice = unique(mentions.filter(m => m.kind === "nice").map(m => m.skill));
  // Duties define the job when the JD lists no explicit requirements.
  const mustHave = must.length ? must : duty;
  const niceToHave = unique([...(must.length ? duty : []), ...nice]).filter(s => !mustHave.some(m => m.id === s.id));
  if (!mustHave.length) notes.push("No must-have skills were recognised in the description. Add them before screening.");
  if (mustHave.length > 12) notes.push("Many must-have skills were found. Move secondary ones to nice-to-have for a fairer comparison.");
  return {
    schemaVersion: "1.0",
    title: job.title.trim(),
    mustHave: mustHave.slice(0, 20),
    niceToHave: niceToHave.slice(0, 20),
    minYears,
    maxYears,
    educationLevel,
    educationFields: [...educationFields],
    location: job.location?.trim() ?? "",
    workMode: job.workMode?.trim() ?? "",
    origin: "generated",
    notes,
  };
}

function splitLines(text: string): string[] {
  // Strip bullets and list numbering ("1." / "2)") but never a leading range such as "2-5 years".
  return text.split(/\n|(?<=[.;])\s+(?=[A-Z])|\s+•\s+/).map(l => l.replace(/^(?:[\s•*▪●◦➢✓✔>·]+|[-–]\s+|\d{1,2}[.)]\s+)+/, "").trim()).filter(Boolean);
}

export function parseYears(text: string): { min: number; max: number | null } | null {
  const range = text.match(/(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)/i);
  if (range && Number(range[2]) >= Number(range[1])) return { min: Number(range[1]), max: Number(range[2]) };
  const plus = text.match(/(\d{1,2})\s*\+\s*(?:years?|yrs?)/i) ?? text.match(/(?:minimum|min\.?|at least|atleast)\s*(?:of\s*)?(\d{1,2})\s*(?:years?|yrs?)/i) ?? text.match(/(\d{1,2})\s*(?:years?|yrs?)\s*(?:of\s*)?(?:\w+\s+){0,4}?experience/i);
  if (plus && Number(plus[1]) <= 30) return { min: Number(plus[1]), max: null };
  return null;
}

function unique(skills: RequirementSkill[]): RequirementSkill[] {
  const seen = new Set<string>();
  return skills.filter(s => !seen.has(s.id) && seen.add(s.id));
}

/** Validate and normalise requirements edited by a recruiter in the console. */
export function sanitiseRequirements(input: unknown, fallbackTitle: string): JobRequirements | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  const list = (value: unknown) => unique((Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\n]/) : [])
    .map(v => typeof v === "string" ? v : (v as { name?: unknown })?.name)
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0 && v.trim().length <= 60)
    .map(v => resolveSkill(v.trim())).filter((s): s is RequirementSkill => !!s)).slice(0, 25);
  const num = (value: unknown, max: number) => value === null || value === "" || value === undefined ? null : Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= max ? Math.round(Number(value) * 2) / 2 : null;
  const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
  const mustHave = list(r.mustHave);
  const minYears = num(r.minYears, 40), maxYears = num(r.maxYears, 45);
  return {
    schemaVersion: "1.0",
    title: text(r.title, 160) || fallbackTitle,
    mustHave,
    niceToHave: list(r.niceToHave).filter(s => !mustHave.some(m => m.id === s.id)),
    minYears,
    maxYears: maxYears !== null && minYears !== null && maxYears < minYears ? null : maxYears,
    educationLevel: num(r.educationLevel, 6) === null ? null : Math.max(1, Math.min(6, Math.round(Number(r.educationLevel)))),
    educationFields: (Array.isArray(r.educationFields) ? r.educationFields : typeof r.educationFields === "string" ? r.educationFields.split(",") : []).filter((v): v is string => typeof v === "string").map(v => v.trim().slice(0, 60)).filter(Boolean).slice(0, 8),
    location: text(r.location, 120),
    workMode: text(r.workMode, 40),
    origin: "edited",
    notes: [],
  };
}
