// Anonymised CV previews for companies (before unlock). Built from an
// allow-list of structured fields, never by stripping a full CV, and then
// checked for leaks of the candidate's identity, contacts, employers,
// institutions or links before it is served.

import type { PortalProfile } from "./profile";
import { SENIORITY_LABEL, formatLpa } from "./india";
import { roleFamilyById } from "./roles";

export type Preview = {
  ref: string;
  title: string;
  roleFamily: string;
  seniority: string;
  yearsExperience: number;
  keySkills: string[];
  city: string;
  relocate: "yes" | "no" | "not stated";
  education: string;
  notice: string;
  expectedCtc: string;
  score: number;
  explanation: { summary: string; meets: string[]; misses: string[]; why: string };
  assessed: string[];
};

const EDUCATION = ["", "10th", "12th", "Diploma / ITI", "Bachelor's degree", "Master's or professional qualification", "Doctorate"];
const TITLE_NOISE = /\s+(?:at|@|with|for)\s+.*$|\s*[,|(–—-].*$/;

function noticeBand(days: number | null) {
  if (days === null) return "not stated";
  if (days === 0) return "Immediate";
  if (days <= 15) return "Up to 15 days";
  if (days <= 30) return "Up to 30 days";
  if (days <= 60) return "Up to 60 days";
  return "More than 60 days";
}
function ctcBand(inr: number | null) {
  if (inr === null) return "not stated";
  const lakhs = inr / 100_000;
  const lo = Math.floor(lakhs), hi = lo + 1;
  return lakhs >= 30 ? "₹30 LPA or more" : `₹${lo}–${hi} LPA`;
}

/** Strings that must never appear in a preview for this candidate. */
export function sensitiveTerms(p: PortalProfile): string[] {
  const terms = [p.contact.name, ...p.contact.name.split(/\s+/), p.contact.email, p.contact.email.split("@")[0], p.contact.phone, p.contact.phone.replace(/\D/g, "").slice(-10), ...p.contact.links,
    ...p.work.map(w => w.employer), ...p.education.map(e => e.institution)];
  return [...new Set(terms.map(t => (t ?? "").trim()).filter(t => t.length >= 4))];
}

export function buildPreview(p: PortalProfile, ref: string, score: number, explanation: Preview["explanation"], assessed: string[] = []): Preview {
  const employers = p.work.map(w => w.employer.toLowerCase()).filter(Boolean);
  let title = (p.work[0]?.title || p.headline || "").replace(TITLE_NOISE, "").trim();
  if (!title || employers.some(e => e && title.toLowerCase().includes(e))) title = roleFamilyById(p.india.roleFamily)?.label ?? "Professional";
  const best = p.education.reduce((m, e) => Math.max(m, e.level), 0);
  const preview: Preview = {
    ref,
    title: title.slice(0, 60),
    roleFamily: roleFamilyById(p.india.roleFamily)?.label ?? "Other",
    seniority: SENIORITY_LABEL[p.india.seniority],
    yearsExperience: p.india.yearsExperience,
    keySkills: p.skills.filter(s => !s.id.startsWith("term:") && s.family !== "language").sort((a, b) => (b.evidence === "work" ? 1 : 0) - (a.evidence === "work" ? 1 : 0) || b.months - a.months).slice(0, 8).map(s => s.name),
    city: p.india.currentCity || "not stated",
    relocate: p.india.willingToRelocate === null ? "not stated" : p.india.willingToRelocate ? "yes" : "no",
    education: EDUCATION[best] || "not stated",
    notice: noticeBand(p.india.noticeDays),
    expectedCtc: ctcBand(p.india.ctcExpectedInr),
    score: Math.round(score),
    explanation,
    assessed,
  };
  return redactLeaks(preview, sensitiveTerms(p));
}

/** Defence in depth: replace any sensitive term or contact-like pattern that slipped into a preview. */
export function redactLeaks<T>(value: T, terms: string[]): T {
  const patterns = [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, /(?:https?:\/\/|www\.)\S+/gi, /\b(?:linkedin|github)\.com\/\S*/gi, /(?:\+?91[\s-]?)?[6-9](?:[\s-]?\d){9}/g];
  const scrub = (s: string) => {
    let out = s;
    for (const re of patterns) out = out.replace(re, "[hidden]");
    for (const term of terms) out = out.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "[hidden]");
    return out;
  };
  const walk = (v: unknown): unknown => typeof v === "string" ? scrub(v) : Array.isArray(v) ? v.map(walk) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "ref" ? x : walk(x)])) : v;
  return walk(value) as T;
}

export const describeCtc = formatLpa;
