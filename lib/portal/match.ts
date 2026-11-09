// Portal matching engine: hard filters, JD-specific weights, and Bayesian fusion
// of CV evidence with optional assessment scores.
//
// Design (sources in docs/PORTAL_MATCHING.md):
// - Each component has a mean m and variance v. A CV claim is a prior whose
//   spread depends on how strong the evidence is; an assessment is an
//   observation with known measurement error (SEM). They combine by
//   normal-normal (Kelley/Buhlmann) shrinkage: Z = tau^2 / (tau^2 + e^2).
// - Score S = 100 * sum(w m) / sum(w); SD = 100 * sqrt(sum(w^2 v)) / sum(w).
//   Candidates are ranked and released by the lower bound L = S - 1.0 * SD,
//   so thin evidence never outranks thick evidence at the same mean, and a
//   candidate without assessments is still validly ranked (wider band).
// - Weights are derived per JD from its own content by bounded rules and
//   projected to sum to 100, so each JD decides which signals matter.
// - Name, gender, age, religion, caste, marital status and photo are not inputs:
//   they are removed at parse time and nothing here reads them.

import type { CandidateSkill, RequirementSkill } from "../ats/types";
import { findSkills, normalise } from "../ats/taxonomy";
import { titleSimilarity } from "../ats/score";
import type { PortalProfile } from "./profile";
import type { PortalRequirements } from "./jd";
import type { CompanyParams } from "./params";
import { formatLpa, sameLabourMarket } from "./india";

export const MATCH_ENGINE_VERSION = "portal-match-2026.11.1";
export const LAMBDA = 1.0;

export type ComponentKey = "mustHave" | "experience" | "title" | "recency" | "niceToHave" | "education" | "location" | "assessment";
const LABEL: Record<ComponentKey, string> = { mustHave: "Must-have skills", experience: "Relevant experience", title: "Role and title", recency: "Recent relevant work", niceToHave: "Nice-to-have skills", education: "Education", location: "Location", assessment: "Company assessment" };
const BOUNDS: Record<ComponentKey, [number, number]> = { mustHave: [20, 50], experience: [0, 25], title: [0, 15], recency: [0, 10], niceToHave: [0, 15], education: [0, 15], location: [0, 10], assessment: [0, 40] };
const GENERIC = new Set(["soft", "language", "office"]);
const EVIDENCE_MEAN: Record<CandidateSkill["evidence"], number> = { work: 1, certification: 1, summary: 0.8, other: 0.8, listed: 0.6 };
const EVIDENCE_TAU: Record<CandidateSkill["evidence"], number> = { work: 0.2, certification: 0.2, summary: 0.25, other: 0.25, listed: 0.3 };
const CV_ONLY_RHO = 0.3;

/** A platform skill score of record: y in [0,1] relative to the job-ready cut, e its standard error. */
export type SkillEvidence = { y: number; e: number; label: string };
export type MatchEvidence = {
  skillScores?: Record<string, SkillEvidence>;          // keyed by taxonomy skill id
  company?: { attached: boolean; coverage: number; reliability: number | null; score?: { y: number; e: number }; prior?: { a0: number; a1: number; tau: number } };
};

export type Component = { key: ComponentKey; label: string; weight: number; mean: number | null; sd: number; detail: string };
export type Check = { requirement: string; id: string; kind: "must" | "nice"; status: "verified" | "met" | "listed" | "related" | "missing"; mean: number; sd: number; via: string };
export type MatchResult = {
  engineVersion: string;
  hardPass: boolean;
  failedFilters: string[];
  score: number;
  sd: number;
  lowerBound: number;
  weights: Record<ComponentKey, number>;
  weightTrace: string[];
  components: Component[];
  checks: Check[];
  explanation: { summary: string; meets: string[]; misses: string[]; why: string };
  band: "Strong match" | "Good match" | "Partial match" | "Weak match";
  gaps: string[];
  nearThreshold: boolean;
};

/** JD-specific weights from bounded rules, projected to sum to 100 (largest-remainder rounding). */
export function deriveWeights(req: PortalRequirements, company?: MatchEvidence["company"]): { weights: Record<ComponentKey, number>; trace: string[] } {
  const trace: string[] = [];
  const m = req.mustHave.length, n = req.niceToHave.length, min = req.minYears;
  const w: Record<ComponentKey, number> = { mustHave: 25 + 2.5 * Math.min(m, 8), niceToHave: Math.min(15, 3 * n), experience: 15, education: 10, title: 10, recency: 10, location: req.hard.remote ? 0 : 5, assessment: 0 };
  trace.push(`${m} must-have skill(s) → must-have weight ${w.mustHave}; ${n} nice-to-have → ${w.niceToHave}.`);
  if (min !== null && min <= 1) { Object.assign(w, { experience: 5, education: 15, title: 5 }); trace.push("Entry-level role: education counts more, experience and title less."); }
  else if (min !== null && min >= 8) { Object.assign(w, { experience: 20, education: 5, title: 15 }); trace.push("Senior role: experience and title count more, education less."); }
  else trace.push("Mid-level role: balanced experience, education and title.");
  if (req.hard.remote) trace.push("Remote role: location not weighted.");
  if (company?.attached) {
    const relF = company.reliability === null ? 0.5 : Math.max(0, Math.min(1, (company.reliability - 0.6) / 0.2));
    const wa = Math.max(15, Math.min(40, 15 + 25 * Math.max(0, Math.min(1, company.coverage)) * relF));
    const pool = w.mustHave + w.experience + w.title;
    for (const k of ["mustHave", "experience", "title"] as const) w[k] -= wa * w[k] / pool;
    w.assessment = wa;
    trace.push(`Company assessment attached (covers ${Math.round(company.coverage * 100)}% of must-haves): weight ${Math.round(wa)}, taken from must-have, experience and title.`);
  }
  return { weights: project(w), trace };
}

function project(raw: Record<ComponentKey, number>): Record<ComponentKey, number> {
  const keys = Object.keys(raw) as ComponentKey[];
  const w = { ...raw };
  for (let pass = 0; pass < 9; pass++) {
    for (const k of keys) w[k] = Math.max(BOUNDS[k][0] * (raw[k] > 0 || k === "mustHave" ? 1 : 0), Math.min(BOUNDS[k][1], w[k]));
    const total = keys.reduce((s, k) => s + w[k], 0);
    if (Math.abs(total - 100) < 1e-9) break;
    const free = keys.filter(k => w[k] > 0 && (total < 100 ? w[k] < BOUNDS[k][1] : w[k] > BOUNDS[k][0]));
    const freeSum = free.reduce((s, k) => s + w[k], 0);
    if (!freeSum) break;
    for (const k of free) w[k] += (100 - total) * w[k] / freeSum;
  }
  const floors = keys.map(k => ({ k, f: Math.floor(w[k]), r: w[k] - Math.floor(w[k]) }));
  let left = 100 - floors.reduce((s, x) => s + x.f, 0);
  for (const x of [...floors].sort((a, b) => b.r - a.r)) { if (left <= 0) break; x.f++; left--; }
  return Object.fromEntries(floors.map(x => [x.k, x.f])) as Record<ComponentKey, number>;
}

// Year ranges of the seniority bands, used with a one-year tolerance at the edges.
const BAND_YEARS: Record<string, [number, number]> = { fresher: [0, 1], junior: [1, 3], mid: [3, 6], senior: [6, 10], lead: [10, 60] };
const withinBands = (years: number, bands: string[], tolerance = 1) => bands.some(b => BAND_YEARS[b] && years >= BAND_YEARS[b][0] - tolerance && years < BAND_YEARS[b][1] + tolerance);

/** Hard filters: pass/fail gates from the JD and the company's approved parameters. */
export function hardFilters(p: PortalProfile, req: PortalRequirements, params: CompanyParams | null): string[] {
  const failed: string[] = [];
  const f = req.hard, i = p.india;
  if (!f.remote && f.cities.length) {
    const here = [i.currentCity, ...i.preferredCities].filter(Boolean);
    const local = f.cities.some(c => here.some(h => sameLabourMarket(h, c)));
    if (!local && !(f.allowRelocation && i.willingToRelocate === true)) failed.push(`Location: not in ${f.cities.join(" or ")}${f.allowRelocation ? " and not willing to relocate" : ""}.`);
  }
  if (f.minYears !== null && i.yearsExperience + 0.25 < f.minYears) failed.push(`Experience: ${i.yearsExperience} years, needs at least ${f.minYears}.`);
  const workOnly = params?.mandatoryFilters?.includes("work_evidence_for_mandatory_skills");
  const groups = req.mandatoryGroups ?? f.mandatorySkills.map(s => [s.id]);
  const name = (id: string) => [...req.mustHave, ...f.mandatorySkills].find(s => s.id === id)?.name ?? id;
  for (const group of groups) {
    const ok = group.some(id => { const have = p.skills.find(x => x.id === id); return !!have && (!workOnly || have.evidence === "work" || have.evidence === "certification"); });
    if (!ok) failed.push(`Mandatory skill: ${group.map(name).join(" or ")} not ${workOnly ? "shown in work history" : "found"}.`);
  }
  const notice = f.maxNoticeDays ?? params?.maxNoticeDays ?? null;
  if (notice !== null && i.noticeDays !== null && i.noticeDays > notice) failed.push(`Notice period: ${i.noticeDays} days, maximum ${notice}.`);
  if (f.ctcMaxInr !== null && i.ctcExpectedInr !== null && i.ctcExpectedInr > f.ctcMaxInr * 1.1) failed.push(`Expected CTC ${formatLpa(i.ctcExpectedInr)} is above the ${formatLpa(f.ctcMaxInr)} maximum.`);
  if (params?.mandatoryFilters?.includes("ctc_stated") && i.ctcExpectedInr === null) failed.push("Expected CTC is not stated.");
  if (params?.mandatoryFilters?.includes("notice_stated") && i.noticeDays === null) failed.push("Notice period is not stated.");
  if (params?.seniority?.length && !params.seniority.includes(i.seniority) && !withinBands(i.yearsExperience, params.seniority)) failed.push(`Seniority (${i.seniority}, ${i.yearsExperience} years) is outside this company's approved bands.`);
  if (f.seniority.length && !withinBands(i.yearsExperience, f.seniority, 2)) failed.push(`Seniority (${i.seniority}) is far from the role's level.`);
  return failed;
}

function relevantJobs(p: PortalProfile, req: PortalRequirements) {
  const ids = new Set([...req.mustHave, ...req.niceToHave].filter(s => !GENERIC.has(s.family)).map(s => s.id));
  return p.work.filter(job => {
    if (titleSimilarity(req.title, job.title) >= 0.34) return true;
    const text = [job.title, ...job.highlights].join("\n");
    if (findSkills(text).some(s => ids.has(s.skill.id))) return true;
    const norm = normalise(text);
    return [...ids].some(id => id.startsWith("term:") && norm.includes(` ${id.slice(5)} `));
  });
}

/** Union of dated intervals in months: overlapping roles add nothing. */
function unionMonths(jobs: PortalProfile["work"], now: Date) {
  const idx = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
  const nowIdx = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const spans = jobs.filter(j => j.start).map(j => [idx(j.start!), j.current || !j.end ? nowIdx : idx(j.end)] as [number, number]).filter(([a, b]) => b >= a).sort((a, b) => a[0] - b[0]);
  let total = 0, cur: [number, number] | null = null;
  for (const s of spans) {
    if (cur && s[0] <= cur[1] + 1) cur[1] = Math.max(cur[1], s[1]);
    else { if (cur) total += cur[1] - cur[0] + 1; cur = [...s] as [number, number]; }
  }
  if (cur) total += cur[1] - cur[0] + 1;
  return total;
}

function requirementPrior(req: RequirementSkill, p: PortalProfile, listedCap: number, workText: string, otherText: string): Omit<Check, "kind" | "requirement" | "id"> {
  const exact = p.skills.find(s => s.id === req.id);
  if (exact) {
    let mean = exact.family === "language" && exact.evidence === "listed" ? 1 : EVIDENCE_MEAN[exact.evidence];
    if (exact.evidence === "listed" && exact.family !== "language") mean *= listedCap;
    const status = exact.evidence === "listed" && exact.family !== "language" ? "listed" : "met";
    return { status, mean, sd: EVIDENCE_TAU[exact.evidence], via: exact.evidence === "work" ? `work history${exact.months ? `, ${Math.round(exact.months / 12 * 10) / 10} yrs` : ""}${exact.lastUsedYear ? `, last used ${exact.lastUsedYear}` : ""}` : exact.evidence === "listed" ? "skills list only" : exact.evidence };
  }
  if (req.id.startsWith("term:")) {
    const t = ` ${req.id.slice(5)} `;
    if (workText.includes(t)) return { status: "met", mean: 1, sd: 0.2, via: "work history" };
    if (otherText.includes(t)) return { status: "listed", mean: 0.3, sd: 0.3, via: "mentioned outside work history" };
  }
  if (!["term", "soft", "language"].includes(req.family)) {
    const related = p.skills.filter(s => s.family === req.family).sort((a, b) => EVIDENCE_MEAN[b.evidence] - EVIDENCE_MEAN[a.evidence])[0];
    if (related) return { status: "related", mean: Math.min(0.5, 0.4 * EVIDENCE_MEAN[related.evidence]), sd: 0.3, via: `related: ${related.name}` };
  }
  return { status: "missing", mean: 0, sd: 0.3, via: "" };
}

/** Normal-normal shrinkage of a prior (mu, tau) by an observation (y, e). */
export function shrink(mu: number, tau: number, y: number, e: number) {
  const z = tau * tau / (tau * tau + e * e);
  return { mean: mu + z * (y - mu), variance: (1 - z) * tau * tau, z };
}

function aggregate(checks: Check[], reqs: RequirementSkill[]) {
  if (!checks.length) return null;
  const u = reqs.map(r => GENERIC.has(r.family) ? 0.5 : 1);
  const su = u.reduce((s, x) => s + x, 0);
  const mean = checks.reduce((s, c, i) => s + u[i] * c.mean, 0) / su;
  let variance = checks.reduce((s, c, i) => s + u[i] * u[i] * c.sd * c.sd, 0);
  for (let i = 0; i < checks.length; i++) for (let j = 0; j < checks.length; j++) {
    if (i !== j && checks[i].status !== "verified" && checks[j].status !== "verified") variance += CV_ONLY_RHO * u[i] * u[j] * checks[i].sd * checks[j].sd;
  }
  return { mean, sd: Math.sqrt(variance) / su };
}

export function scoreMatch(p: PortalProfile, req: PortalRequirements, params: CompanyParams | null, evidence: MatchEvidence = {}, now = new Date()): MatchResult {
  const failedFilters = hardFilters(p, req, params);
  const { weights, trace } = deriveWeights(req, evidence.company);
  const listedCount = p.skills.filter(s => s.evidence === "listed").length;
  const listedCap = Math.min(1, 25 / Math.max(1, listedCount));
  const workText = normalise(p.work.map(w => [w.title, ...w.highlights].join("\n")).join("\n"));
  const otherText = normalise([p.summary, p.headline, ...p.skills.map(s => s.name), ...p.certifications].join("\n"));
  const scores = evidence.skillScores ?? {};

  const makeChecks = (list: RequirementSkill[], kind: "must" | "nice") => list.map(r => {
    const prior = requirementPrior(r, p, listedCap, workText, otherText);
    const obs = scores[r.id];
    if (obs) {
      const post = shrink(prior.mean, prior.sd, Math.max(0, Math.min(1, obs.y)), Math.max(0.02, obs.e));
      return { requirement: r.name, id: r.id, kind, status: "verified" as const, mean: post.mean, sd: Math.sqrt(post.variance), via: `${obs.label}; CV: ${prior.via || "not found"}` };
    }
    return { requirement: r.name, id: r.id, kind, ...prior };
  });
  const must = makeChecks(req.mustHave, "must"), nice = makeChecks(req.niceToHave, "nice");
  const components: Component[] = [];
  const push = (key: ComponentKey, mean: number | null, sd: number, detail: string) => components.push({ key, label: LABEL[key], weight: weights[key], mean: mean === null ? null : Math.max(0, Math.min(1, mean)), sd, detail });

  // Any-of groups ("A, B or C"): each group counts once, with its best-evidenced skill.
  const groups = (req.mustGroups ?? req.mustHave.map(s => [s.id])).map(g => g.map(id => must.findIndex(c => c.id === id)).filter(i => i >= 0)).filter(g => g.length);
  const bestOfGroup = groups.map(g => g.reduce((x, i) => must[i].mean - must[i].sd * 0.01 > must[x].mean - must[x].sd * 0.01 ? i : x, g[0]));
  const mAgg = aggregate(bestOfGroup.map(i => must[i]), bestOfGroup.map(i => req.mustHave[i])), nAgg = aggregate(nice, req.niceToHave);
  const groupMet = bestOfGroup.filter(i => must[i].status === "met" || must[i].status === "verified").length;
  push("mustHave", mAgg?.mean ?? null, mAgg?.sd ?? 0, `${groupMet} of ${bestOfGroup.length} requirements with evidence (${bestOfGroup.filter(i => must[i].status === "verified").length} verified by test).`);
  push("niceToHave", nAgg?.mean ?? null, nAgg?.sd ?? 0, `${nice.filter(c => c.mean >= 0.6).length} of ${nice.length} found.`);

  const dated = p.work.some(w => w.start);
  const relevant = relevantJobs(p, req);
  const relevantYears = dated ? Math.round(unionMonths(relevant, now) / 12 * 10) / 10 : (p.statedExperienceYears ?? 0);
  const totalYears = p.india.yearsExperience;
  if (req.minYears !== null) {
    const other = Math.max(0, totalYears - relevantYears);
    const mean = req.minYears === 0 ? 1 : Math.min(1, relevantYears / req.minYears) + Math.min(0.25, 0.25 * other / req.minYears);
    push("experience", mean, dated ? 0.05 : 0.15, `${relevantYears} relevant of ${totalYears} years; needs ${req.minYears}${req.maxYears !== null ? `–${req.maxYears}` : "+"}.`);
  } else push("experience", null, 0, "No experience requirement.");

  const titles: [string, number][] = p.work.slice(0, 4).map((w, i) => [w.title, [1, 0.85, 0.7, 0.7][i]] as [string, number]);
  if (p.headline) titles.push([p.headline, 0.8]);
  const best = titles.filter(([t]) => t).map(([t, k]) => ({ t, s: titleSimilarity(req.title, t) * k })).sort((a, b) => b.s - a.s)[0];
  push("title", best?.s ?? 0, 0.1, best && best.s > 0 ? `Closest title: ${best.t}.` : "No similar title.");

  if (dated && relevant.length) {
    const idx = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
    const nowIdx = now.getUTCFullYear() * 12 + now.getUTCMonth();
    const ago = nowIdx - Math.max(...relevant.map(j => j.current || !j.end ? nowIdx : idx(j.end)));
    push("recency", ago <= 24 ? 1 : ago >= 72 ? 0.2 : 1 - 0.8 * (ago - 24) / 48, 0.05, ago <= 0 ? "Currently in relevant work." : `Relevant work ended ${ago} months ago.`);
  } else push("recency", (req.minYears ?? 0) > 0 ? 0 : null, 0.05, dated ? "No dated role matches this job." : "No dated roles.");

  const top = p.education.reduce((x, e) => Math.max(x, e.level), 0);
  if (req.educationLevel !== null || req.educationFields.length) {
    let mean = 1;
    if (req.educationLevel !== null) mean = !p.education.length ? 0.3 : top >= req.educationLevel ? 1 : top === req.educationLevel - 1 ? 0.5 : 0;
    if (req.educationFields.length && !p.education.some(e => req.educationFields.some(f => fieldMatches(f, `${e.field} ${e.qualification}`)))) mean *= 0.7;
    push("education", mean, p.education.length ? 0.05 : 0.2, p.education.length ? `Highest qualification level ${top}.` : "Education not found.");
  } else push("education", null, 0, "No education requirement.");

  if (!req.hard.remote && req.hard.cities.length) {
    const here = [p.india.currentCity, ...p.india.preferredCities].filter(Boolean);
    const local = req.hard.cities.some(c => here.some(h => sameLabourMarket(h, c)));
    push("location", local ? 1 : p.india.willingToRelocate ? 0.6 : 0, 0, local ? "Local to the job." : p.india.willingToRelocate ? "Willing to relocate." : "Not local.");
  } else push("location", null, 0, "Location not weighted.");

  // Company assessment: takers are observed; non-takers get a prior predicted from their CV fit.
  if (evidence.company?.attached) {
    const present = components.filter(c => c.mean !== null && c.key !== "assessment");
    const fcv = present.reduce((s, c) => s + c.weight * c.mean!, 0) / Math.max(1, present.reduce((s, c) => s + c.weight, 0));
    const pr = evidence.company.prior ?? { a0: 0, a1: 1, tau: 0.2 };
    const mu = Math.max(0, Math.min(1, pr.a0 + pr.a1 * fcv));
    if (evidence.company.score) {
      const post = shrink(mu, pr.tau, Math.max(0, Math.min(1, evidence.company.score.y)), Math.max(0.02, evidence.company.score.e));
      push("assessment", post.mean, Math.sqrt(post.variance), "Company assessment taken.");
    } else push("assessment", mu, pr.tau, "Company assessment not taken: estimated from CV fit, with a wider range.");
  }

  const present = components.filter(c => c.mean !== null && c.weight > 0);
  const W = present.reduce((s, c) => s + c.weight, 0) || 1;
  const S = 100 * present.reduce((s, c) => s + c.weight * c.mean!, 0) / W;
  const SD = 100 * Math.sqrt(present.reduce((s, c) => s + c.weight * c.weight * c.sd * c.sd, 0)) / W;
  const L = S - LAMBDA * SD;
  const score = Math.round(S * 10) / 10, sd = Math.round(SD * 10) / 10, lowerBound = Math.round(L * 10) / 10;
  const checks = [...must, ...nice];
  const missingMust = must.filter(c => c.status === "missing" || c.status === "related");
  const band = S >= 75 && !missingMust.length ? "Strong match" : S >= 55 ? "Good match" : S >= 35 ? "Partial match" : "Weak match";
  const gaps = [...missingMust.map(c => `${c.requirement} not shown`), ...must.filter(c => c.status === "listed").map(c => `${c.requirement} only listed, not shown in a role`), ...failedFilters].slice(0, 3);
  const minScore = params?.minScore ?? 70;
  return {
    engineVersion: MATCH_ENGINE_VERSION, hardPass: failedFilters.length === 0, failedFilters, score, sd, lowerBound, weights, weightTrace: trace, components, checks,
    explanation: explain(score, sd, must, nice, components, relevantYears, req, p, failedFilters, groups),
    band, gaps, nearThreshold: failedFilters.length === 0 && S >= minScore && L < minScore,
  };
}

const FIELD_HINTS: Record<string, RegExp> = {
  commerce: /\b(b\.?\s?com|m\.?\s?com|commerce|accountancy|accounting|accounts)\b/i,
  management: /\b(bba|bbm|mba|pgdm|management|business administration)\b/i,
  engineering: /\b(b\.?\s?tech|m\.?\s?tech|b\.\s?e\.?|engineering)\b/i,
  science: /\b(b\.?\s?sc|m\.?\s?sc|science)\b/i,
  accounting: /\b(chartered accountant|cma|accounting|accountancy|commerce|b\.?\s?com)\b/i,
  "computer applications": /\b(bca|mca|computer)\b/i,
};
const fieldMatches = (field: string, text: string) => (FIELD_HINTS[field.toLowerCase()] ?? new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")).test(text);

/** Human-readable explanation built only from structured fields (no names, employers, contacts or links). */
function explain(S: number, SD: number, mustAll: Check[], nice: Check[], components: Component[], years: number, req: PortalRequirements, p: PortalProfile, failed: string[], groups: number[][]) {
  // One line per requirement group: a met "A, B or C" group is reported by its met member only.
  const groupChecks = groups.map(g => { const met = g.map(i => mustAll[i]).filter(c => c.status === "met" || c.status === "verified"); return met.length ? met : g.map(i => mustAll[i]); });
  const must: Check[] = groupChecks.map(cs => cs.length === 1 || cs.some(c => c.status === "met" || c.status === "verified") ? cs[0] : { ...cs.reduce((a, b) => (b.mean > a.mean ? b : a)), requirement: cs.map(c => c.requirement).join(" or ") });
  const evidenced = must.filter(c => c.status === "met" || c.status === "verified");
  const verified = [...must, ...nice].filter(c => c.status === "verified");
  const lo = Math.max(0, Math.round(S - SD)), hi = Math.min(100, Math.round(S + SD));
  const parts = [`meets ${evidenced.length} of ${must.length} must-have requirements with evidence`];
  if (verified.length) parts.push(`${verified.map(c => c.requirement).join(", ")} verified by test`);
  else parts.push("no skill tests taken, so the range is wider");
  const summary = `${Math.round(S)} (likely ${lo}–${hi}): ${parts.join("; ")}.`;
  const meets = [
    ...evidenced.map(c => `${c.requirement} (${c.status === "verified" ? "verified by test" : c.via.replace(/;.*/, "")})`),
    ...(req.minYears !== null && years >= req.minYears ? [`${years} relevant years (needs ${req.minYears}${req.maxYears !== null ? `–${req.maxYears}` : "+"})`] : []),
    ...(p.india.currentCity && req.hard.cities.some(c => c.toLowerCase() === p.india.currentCity.toLowerCase()) ? [`Based in ${p.india.currentCity}`] : []),
    ...nice.filter(c => c.mean >= 0.8).map(c => `${c.requirement} (nice-to-have)`),
  ].slice(0, 8);
  const misses = [
    ...failed,
    ...must.filter(c => c.status === "missing").map(c => `${c.requirement} not found`),
    ...must.filter(c => c.status === "listed").map(c => `${c.requirement} listed but not shown in a role`),
    ...must.filter(c => c.status === "related").map(c => `${c.requirement}: only ${c.via.replace("related: ", "")}`),
    ...(req.minYears !== null && years < req.minYears ? [`${years} relevant years (needs ${req.minYears})`] : []),
    ...nice.filter(c => c.status === "missing").map(c => `${c.requirement} (nice-to-have) not found`),
  ].slice(0, 8);
  const scored = components.filter(c => c.mean !== null && c.weight > 0);
  const strongest = [...scored].sort((a, b) => b.weight * b.mean! - a.weight * a.mean!)[0];
  const weakest = [...scored].sort((a, b) => b.weight * (1 - b.mean!) - a.weight * (1 - a.mean!))[0];
  const lead = [...scored].filter(c => c.mean! >= 0.75).sort((a, b) => b.weight * b.mean! - a.weight * a.mean!)[0] ?? strongest;
  const why = weakest && weakest.mean! < 0.9
    ? lead && lead.key !== weakest.key
      ? `Ranks here on ${lead.label.toLowerCase()}; held back by ${weakest.label.toLowerCase()} (${weakest.detail.replace(/\.$/, "")}).`
      : `Ranks here mainly on ${weakest.label.toLowerCase()}, which is only partly met (${weakest.detail.replace(/\.$/, "")}).`
    : `Ranks here because it meets the role's requirements across the board${verified.length ? ", with tested skills" : ""}.`;
  return { summary, meets, misses, why };
}
