// Deterministic, explainable fit scoring: CandidateProfile x JobRequirements.
// The weights follow common practice in commercial matching engines (must-have
// skills first, then experience, title, recency and education). A component the
// job does not specify is dropped and its weight shared across the others.
// Nothing here rejects anyone: the verdict is a recommendation for a recruiter.

import { ATS_ENGINE_VERSION, type CandidateProfile, type CandidateSkill, type ComponentKey, type JobRequirements, type RequirementCheck, type RequirementSkill, type ScoreComponent, type ScreeningResult, type Verdict } from "./types";
import { findSkills, normalise } from "./taxonomy";

export const WEIGHTS: Record<ComponentKey, number> = { mustHave: 35, experience: 20, title: 10, recency: 10, niceToHave: 10, education: 10, location: 5 };
const LABELS: Record<ComponentKey, string> = { mustHave: "Must-have skills", experience: "Relevant experience", title: "Role and title match", recency: "Recent relevant work", niceToHave: "Nice-to-have skills", education: "Education", location: "Location" };
const EVIDENCE_CREDIT: Record<CandidateSkill["evidence"], number> = { work: 1, certification: 1, summary: 0.8, other: 0.8, listed: 0.6 };
const VERDICT_LABELS: Record<Verdict, string> = { strong: "Strong fit", possible: "Possible fit", weak: "Weak fit", not_fit: "Not a fit (recruiter to confirm)", needs_review: "Needs manual review" };
const LEVEL_NAMES = ["", "10th", "12th", "a diploma", "a bachelor's degree", "a master's or professional qualification", "a doctorate"];

export type ScoreContext = { desiredRole?: string; now?: Date };

export function scoreCandidate(profile: CandidateProfile, req: JobRequirements, ctx: ScoreContext = {}): ScreeningResult {
  const now = ctx.now ?? new Date();
  const searchable = buildSearchText(profile);
  const checks: RequirementCheck[] = [
    ...req.mustHave.map(r => checkRequirement(r, "must", profile, searchable)),
    ...req.niceToHave.map(r => checkRequirement(r, "nice", profile, searchable)),
  ];
  const must = checks.filter(c => c.kind === "must"), nice = checks.filter(c => c.kind === "nice");
  const relevant = relevantJobs(profile, req);
  const totalYears = round1(profile.totalExperienceMonths / 12);
  const datedRoles = profile.work.some(w => w.start);
  const relevantYears = datedRoles ? round1(relevant.reduce((sum, j) => sum + j.months, 0) / 12) : profile.statedExperienceYears ?? 0;
  const strengths: string[] = [], concerns: string[] = [], probes: string[] = [], flags: string[] = [];

  const components: ScoreComponent[] = [];
  const push = (key: ComponentKey, score: number | null, detail: string) => components.push({ key, label: LABELS[key], weight: WEIGHTS[key], score: score === null ? null : Math.max(0, Math.min(1, score)), detail });

  // Must-have and nice-to-have skills.
  // Generic requirements (languages, soft skills, office tools) count half as much as core skills.
  push("mustHave", must.length ? weightedCredit(must, req.mustHave) : null, must.length ? `${must.filter(c => c.status === "met").length} of ${must.length} met with evidence, ${must.filter(c => c.status === "unverified").length} listed only, ${must.filter(c => c.status === "partial").length} related, ${must.filter(c => c.status === "missing").length} not found.` : "No must-have skills are defined for this role.");
  push("niceToHave", nice.length ? weightedCredit(nice, req.niceToHave) : null, nice.length ? `${nice.filter(c => c.credit >= 0.6).length} of ${nice.length} found.` : "No nice-to-have skills are defined.");

  // Experience: relevant roles earn the credit; unrelated experience adds at most a quarter.
  if (req.minYears !== null) {
    const other = Math.max(0, totalYears - relevantYears);
    const score = req.minYears === 0 ? 1 : Math.min(1, relevantYears / req.minYears) + Math.min(0.25, 0.25 * other / req.minYears);
    const effective = relevantYears;
    push("experience", score, `${relevantYears} relevant of ${totalYears} total years${datedRoles ? "" : " (as stated in the CV; no dated roles)"}; the role asks for ${req.minYears}${req.maxYears !== null ? `–${req.maxYears}` : "+"} years.`);
    if (effective >= req.minYears && req.minYears > 0) strengths.push(`Meets the experience requirement: ${relevantYears} relevant years against ${req.minYears} required.`);
    else if (req.minYears > 0) { concerns.push(`Below the experience requirement: ${relevantYears} relevant years against ${req.minYears} required.`); probes.push(`Confirm hands-on experience: the role asks for ${req.minYears}+ years and the CV shows ${relevantYears} relevant years.`); }
    if (req.maxYears !== null && totalYears > req.maxYears + 3) flags.push(`More experienced than the stated range (${totalYears} years against ${req.minYears}–${req.maxYears}). Not penalised; check seniority and salary expectations.`);
    if (!datedRoles && profile.statedExperienceYears !== null) flags.push("Experience comes from a statement in the CV, not from dated roles.");
  } else push("experience", null, "The role does not state required years of experience.");

  // Title and role similarity, weighted towards recent roles.
  const titles: [string, number][] = profile.work.slice(0, 4).map((w, i) => [w.title, [1, 0.85, 0.7, 0.7][i]] as [string, number]);
  if (profile.headline) titles.push([profile.headline, 0.8]);
  if (ctx.desiredRole) titles.push([ctx.desiredRole, 0.7]);
  const titleScores = titles.filter(([t]) => t).map(([t, w]) => ({ t, s: titleSimilarity(req.title, t) * w }));
  const bestTitle = titleScores.sort((a, b) => b.s - a.s)[0];
  push("title", bestTitle?.s ?? 0, bestTitle && bestTitle.s > 0 ? `Closest title: "${bestTitle.t}".` : "No similar job title was found.");
  if (bestTitle && bestTitle.s >= 0.7) strengths.push(`Has worked in a closely matching role: "${bestTitle.t}".`);

  // Recency of relevant work.
  if (datedRoles && relevant.length) {
    const lastEnd = Math.max(...relevant.map(j => j.current || !j.end ? monthIndex(now) : toIndex(j.end)));
    const monthsAgo = monthIndex(now) - lastEnd;
    push("recency", monthsAgo <= 24 ? 1 : monthsAgo >= 72 ? 0.2 : 1 - 0.8 * (monthsAgo - 24) / 48, monthsAgo <= 0 ? "Currently in relevant work." : `Relevant work ended about ${monthsAgo} months ago.`);
    if (monthsAgo > 36) concerns.push(`Relevant work ended about ${Math.round(monthsAgo / 12)} years ago.`);
  } else if (datedRoles || (req.minYears ?? 0) > 0) push("recency", 0, datedRoles ? "No dated role matches this job's skills or title." : "No dated roles were found.");
  else push("recency", null, "No dated roles and no experience requirement.");

  // Education.
  const best = profile.education.reduce((m, e) => Math.max(m, e.level), 0);
  if (req.educationLevel !== null || req.educationFields.length) {
    let score = 1;
    const parts: string[] = [];
    if (req.educationLevel !== null) {
      score = !profile.education.length ? 0.3 : best >= req.educationLevel ? 1 : best === req.educationLevel - 1 ? 0.5 : 0;
      parts.push(profile.education.length ? `Highest: ${profile.education.find(e => e.level === best)?.qualification}; requires ${LEVEL_NAMES[req.educationLevel]}.` : `No education found; requires ${LEVEL_NAMES[req.educationLevel]}.`);
      if (!profile.education.length) { concerns.push("Education was not found in the CV."); probes.push("Confirm the candidate's highest qualification."); }
      else if (best < req.educationLevel) concerns.push(`Education is below the requirement (${LEVEL_NAMES[req.educationLevel]}).`);
    }
    if (req.educationFields.length) {
      const fields = req.educationFields.map(f => f.toLowerCase());
      const match = profile.education.some(e => fields.some(f => `${e.field} ${e.qualification}`.toLowerCase().includes(f) || FIELD_HINTS[f]?.test(`${e.field} ${e.qualification}`)));
      if (!match) { score *= req.educationLevel === null ? 0.5 : 0.7; parts.push(`Preferred field (${req.educationFields.join(", ")}) not found.`); }
      else parts.push("Field of study matches.");
    }
    push("education", score, parts.join(" "));
  } else push("education", null, "The role does not state an education requirement.");

  // Location, only for on-site or hybrid roles with a stated location.
  if (req.location && !/remote/i.test(req.workMode)) {
    const cand = profile.contact.location;
    if (!cand) { push("location", null, "Candidate location not stated."); probes.push(`Confirm the candidate can work in ${req.location}.`); }
    else {
      const same = sameLocation(cand, req.location);
      push("location", same ? 1 : 0.3, same ? `Based in or near ${req.location}.` : `Candidate location "${cand}" differs from ${req.location}.`);
      if (!same) probes.push(`Ask whether the candidate can commute or relocate to ${req.location}.`);
    }
  } else push("location", null, req.location ? "Remote role: location not scored." : "No job location stated.");

  for (const c of must) {
    if (c.status === "met") strengths.push(`${c.requirement}: found in ${c.evidence.split(" · ")[0] || "the CV"}.`);
    if (c.status === "unverified") { concerns.push(`${c.requirement} is listed but not shown in any role.`); probes.push(`Ask for a recent, specific example of using ${c.requirement} at work.`); }
    if (c.status === "partial") { concerns.push(`${c.requirement} not found; related experience with ${c.matchedAs}.`); probes.push(`Ask how quickly the candidate could work with ${c.requirement}, given their experience with ${c.matchedAs}.`); }
    if (c.status === "missing") { concerns.push(`${c.requirement} was not found in the CV.`); probes.push(`Ask whether the candidate has any experience with ${c.requirement}; it is not in the CV.`); }
  }
  if (!profile.noticePeriod) probes.push("Confirm notice period and availability to join.");
  if (profile.gaps.length) flags.push(`Career gaps of 6+ months: ${profile.gaps.map(g => `${g.from} to ${g.to}`).join(", ")}. Shown for context only; not scored.`);
  if (profile.excludedPersonalFields.length) flags.push(`Removed before screening and never used: ${profile.excludedPersonalFields.join(", ")}.`);
  flags.push(...profile.parse.warnings);

  const present = components.filter(c => c.score !== null);
  const totalWeight = present.reduce((s, c) => s + c.weight, 0);
  const score = totalWeight ? Math.round(present.reduce((s, c) => s + c.weight * c.score!, 0) / totalWeight * 100) : 0;
  const gaps = must.filter(c => c.status === "missing" || c.status === "partial");
  let verdict: Verdict, reason: string;
  if (profile.parse.confidence < 0.5 || profile.source.textCharacters < 300) {
    verdict = "needs_review";
    reason = `The CV could not be read reliably (confidence ${Math.round(profile.parse.confidence * 100)}%). Read it manually before deciding.`;
  } else if (score >= 75 && !gaps.length) {
    verdict = "strong"; reason = must.length ? "High score and every must-have skill is present." : "High score; no must-have skills were defined.";
  } else if (score >= 55) {
    verdict = "possible"; reason = score >= 75 ? `High score, but ${gaps.length} must-have skill${gaps.length > 1 ? "s are" : " is"} missing or only related.` : "Matches part of the role; review the gaps below.";
  } else if (score >= 35) {
    verdict = "weak"; reason = "Matches few of the role's requirements.";
  } else {
    verdict = "not_fit"; reason = "Very little overlap with the role's requirements. A recruiter should confirm before any decision.";
  }
  return {
    engineVersion: ATS_ENGINE_VERSION, score, verdict, verdictLabel: VERDICT_LABELS[verdict], verdictReason: reason, components, checks,
    experience: { totalYears, relevantYears, requiredMin: req.minYears, requiredMax: req.maxYears },
    strengths: strengths.slice(0, 10), concerns: concerns.slice(0, 12), interviewProbes: [...new Set(probes)].slice(0, 8), flags,
  };
}

const FIELD_HINTS: Record<string, RegExp> = {
  commerce: /\b(b\.?com|m\.?com|commerce|accountancy|accounting|accounts)\b/i,
  management: /\b(bba|mba|pgdm|management|business administration)\b/i,
  engineering: /\b(b\.?tech|m\.?tech|b\.e|engineering)\b/i,
  science: /\b(b\.?sc|m\.?sc|science)\b/i,
  accounting: /\b(chartered accountant|cma|accounting|accountancy|commerce)\b/i,
  "computer applications": /\b(bca|mca|computer)\b/i,
};

function checkRequirement(req: RequirementSkill, kind: "must" | "nice", profile: CandidateProfile, searchable: { work: string; other: string }): RequirementCheck {
  const base = { requirement: req.name, kind };
  const exact = profile.skills.find(s => s.id === req.id);
  if (exact) {
    const credit = exact.family === "language" ? 1 : EVIDENCE_CREDIT[exact.evidence];
    return { ...base, status: credit >= 0.8 ? "met" : "unverified", credit, matchedAs: req.name, evidence: evidenceText(exact) };
  }
  if (req.id.startsWith("term:")) {
    const term = ` ${req.id.slice(5)} `;
    if (searchable.work.includes(term)) return { ...base, status: "met", credit: 1, matchedAs: req.name, evidence: "Mentioned in work history." };
    if (searchable.other.includes(term)) return { ...base, status: "unverified", credit: 0.6, matchedAs: req.name, evidence: "Mentioned outside work history." };
  }
  if (!["term", "soft", "language"].includes(req.family)) {
    const related = profile.skills.filter(s => s.family === req.family).sort((a, b) => EVIDENCE_CREDIT[b.evidence] - EVIDENCE_CREDIT[a.evidence])[0];
    if (related) return { ...base, status: "partial", credit: 0.4 * EVIDENCE_CREDIT[related.evidence], matchedAs: related.name, evidence: evidenceText(related) };
  }
  return { ...base, status: "missing", credit: 0, matchedAs: "", evidence: "" };
}

function evidenceText(skill: CandidateSkill): string {
  const where = { work: "work history", certification: "certifications", summary: "profile summary", other: "projects or other sections", listed: "skills list only" }[skill.evidence];
  const usage = skill.months ? ` · about ${round1(skill.months / 12)} years${skill.lastUsedYear ? `, last used ${skill.lastUsedYear}` : ""}` : "";
  return `${where}${usage}${skill.snippet ? ` · "${skill.snippet.slice(0, 120)}"` : ""}`;
}

function buildSearchText(p: CandidateProfile) {
  return {
    work: normalise(p.work.map(w => [w.title, w.employer, ...w.highlights].join("\n")).join("\n")),
    other: normalise([p.summary, p.headline, ...p.skills.map(s => s.name), ...p.certifications, ...p.education.map(e => `${e.qualification} ${e.field}`)].join("\n")),
  };
}

/** Roles that match the job by title or by at least one core (non-generic) required skill. */
function relevantJobs(profile: CandidateProfile, req: JobRequirements) {
  const ids = new Set([...req.mustHave, ...req.niceToHave].filter(s => !GENERIC_FAMILIES.has(s.family)).map(s => s.id));
  return profile.work.filter(job => {
    if (titleSimilarity(req.title, job.title) >= 0.34) return true;
    const text = [job.title, ...job.highlights].join("\n");
    if (findSkills(text).some(f => ids.has(f.skill.id))) return true;
    const norm = normalise(text);
    return [...ids].some(id => id.startsWith("term:") && norm.includes(` ${id.slice(5)} `));
  });
}

const TITLE_SYNONYMS: Record<string, string> = {
  accountant: "account", accounting: "account", accounts: "account", account: "account", sales: "sale", sale: "sale", salesman: "sale", selling: "sale",
  developer: "develop", development: "develop", dev: "develop", programmer: "develop", engineer: "engineer", engineering: "engineer", engg: "engineer",
  operations: "operation", operational: "operation", ops: "operation", services: "service", servicing: "service", executive: "executive", exec: "executive",
  representative: "rep", rep: "rep", associate: "associate", assistant: "assistant", asst: "assistant", coordinator: "coordinator", "co-ordinator": "coordinator",
  manager: "manager", mgr: "manager", management: "manager", officer: "officer", telecaller: "telecall", tele: "telecall", caller: "telecall", telesales: "telecall",
  administrator: "admin", administration: "admin", administrative: "admin", admin: "admin", recruiter: "recruit", recruitment: "recruit", recruiting: "recruit",
  hr: "hr", human: "hr", resources: "hr", marketing: "market", marketer: "market", analyst: "analy", analytics: "analy", analysis: "analy",
  customer: "customer", client: "customer", support: "support", care: "support", helpdesk: "support", teacher: "teach", teaching: "teach", tutor: "teach",
  storekeeper: "store", stores: "store", store: "store", warehouse: "store", logistics: "logistic", logistic: "logistic", supervisor: "supervis", supervising: "supervis",
};
const TITLE_STOP = new Set(["senior", "junior", "sr", "jr", "trainee", "intern", "lead", "head", "chief", "i", "ii", "iii", "iv", "of", "and", "the", "for", "in", "to", "a", "an", "cum", "level", "grade", "team", "member"]);

// Level words say little about the kind of work ("Sales Executive" vs "Accounts Executive").
const LEVEL_TOKENS = new Set(["executive", "officer", "associate", "assistant", "manager", "coordinator", "specialist", "rep", "staff", "consultant", "supervis", "admin"]);
const tokenWeight = (t: string) => LEVEL_TOKENS.has(t) ? 0.25 : 1;

function titleTokens(title: string): Set<string> {
  return new Set(normalise(title).trim().split(/[\s/]+/).map(t => t.replace(/\.$/, "")).filter(t => t && !TITLE_STOP.has(t)).map(t => TITLE_SYNONYMS[t] ?? t.replace(/(ing|s)$/, "")));
}

/** 0..1: how much of the job title the candidate's title covers, blended with overall overlap. */
export function titleSimilarity(jobTitle: string, candidateTitle: string): number {
  const a = titleTokens(jobTitle), b = titleTokens(candidateTitle);
  if (!a.size || !b.size) return 0;
  const sum = (tokens: Iterable<string>) => [...tokens].reduce((s, t) => s + tokenWeight(t), 0);
  const shared = sum([...a].filter(t => b.has(t)));
  return Math.round((0.7 * shared / sum(a) + 0.3 * shared / sum(new Set([...a, ...b]))) * 100) / 100;
}

// Compare cities, not states: "Durgapur, West Bengal" and "Kolkata, West Bengal" differ.
const REGION_WORDS = new Set(["india", "west", "east", "north", "south", "bengal", "jharkhand", "bihar", "odisha", "orissa", "assam", "state", "district", "pradesh", "uttar", "madhya", "andhra", "tamil", "nadu", "maharashtra", "karnataka", "kerala", "gujarat", "rajasthan", "punjab", "haryana", "telangana"]);
function cityTokens(s: string) {
  return normalise(s.split(/[,(]/)[0]).trim().split(/\s+/).filter(t => t.length > 2 && !REGION_WORDS.has(t));
}
function sameLocation(candidate: string, job: string): boolean {
  if (/\b(any|anywhere|pan india|willing to relocate|open to relocat)/i.test(candidate)) return true;
  const a = cityTokens(candidate), b = cityTokens(job);
  return a.some(t => b.includes(t)) || (a.length === 0 && normalise(candidate).trim() === normalise(job).trim());
}

const GENERIC_FAMILIES = new Set(["soft", "language", "office"]);
function weightedCredit(checks: RequirementCheck[], reqs: RequirementSkill[]) {
  const weight = (i: number) => GENERIC_FAMILIES.has(reqs[i]?.family) ? 0.5 : 1;
  const total = checks.reduce((s, _, i) => s + weight(i), 0);
  return total ? checks.reduce((s, c, i) => s + c.credit * weight(i), 0) / total : 0;
}
const round1 = (n: number) => Math.round(n * 10) / 10;
const monthIndex = (d: Date) => d.getFullYear() * 12 + d.getMonth();
const toIndex = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
