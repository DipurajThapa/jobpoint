// Rule-based CV parser: plain text in, structured CandidateProfile out.
// Works without any external service. Personal characteristics that must not
// influence screening (date of birth, gender, religion, caste, marital status,
// family names, identity numbers) are removed before anything else happens.

import { ATS_ENGINE_VERSION, type CandidateProfile, type CandidateSkill, type EducationEntry, type SkillEvidence, type WorkEntry } from "./types";
import { findSkills, normalise, resolveSkill } from "./taxonomy";

type Section = "header" | "summary" | "experience" | "education" | "skills" | "certifications" | "languages" | "projects" | "personal" | "other";
type Line = { text: string; section: Section };

const HEADINGS: [Section, RegExp][] = [
  ["summary", /^(professional |profile |career |executive )?(summary|profile|objective|career objective|about me|overview|introduction)$/],
  ["experience", /^(work |professional |employment |career |job |relevant |industry |organisational |organizational )?(experience|experiences|history|employment|employment history|work history|career history|background|exposure)( details| summary)?$|^internships?$|^work experience and internships?$/],
  ["education", /^(educational |academic |education |scholastic )?(education|qualifications?|academics|academic details|academic background|credentials)( details)?$|^educational qualifications?$|^academic qualifications?$/],
  ["skills", /^(key |technical |core |professional |it |computer |software |soft |functional |relevant )?(skills|skill set|skillset|competencies|competences|expertise|strengths|proficiency|proficiencies|tools|technologies|tools and technologies)$|^areas of expertise$|^technical proficiency$/],
  ["certifications", /^(certifications?|certificates?|courses|trainings?|certification courses|professional development|licen[cs]es( and certifications)?|courses and certifications|trainings and certifications)$/],
  ["languages", /^(languages?|languages known|language proficiency|linguistic (skills|proficiency))$/],
  ["projects", /^(academic |key |major |personal )?projects?$/],
  ["personal", /^personal (details|information|profile|data|particulars)$/],
  ["other", /^(hobbies|interests|hobbies and interests|achievements|awards|awards and achievements|accomplishments|declaration|references|extra.?curricular( activities)?|activities|co.?curricular( activities)?|volunteering|publications)$/],
];

// Labels of personal fields removed before parsing. Values are never stored.
const PERSONAL_FIELDS: [string, RegExp][] = [
  ["date of birth", /^(date of birth|d\.?\s?o\.?\s?b\.?|birth ?date|born on)\b/i],
  ["age", /^age\b/i],
  ["gender", /^(gender|sex)\b/i],
  ["marital status", /^marital( status)?\b/i],
  ["religion", /^religion\b/i],
  ["caste or category", /^(caste|category\s*[:\-–]\s*(general|gen|obc|sc|st|ews))/i],
  ["nationality", /^(nationality|citizenship)\b/i],
  ["family member names", /^(father'?s?|mother'?s?|husband'?s?|wife'?s?|spouse'?s?|guardian'?s?)\s*(name)?\b/i],
  ["physical details", /^(height|weight|blood group|complexion)\b/i],
  ["identity numbers", /^(aadhaa?r|pan( card)?( no| number)?|passport( no| number)?|voter id|driving licen[cs]e (no|number))\b/i],
];

const BULLET = /^[•\-*–▪●◦➢✓✔>·o]\s+/;
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const MONTH_NC = MONTH.replace(/^\(/, "(?:");
const DATE = `(?:${MONTH_NC}[\\s.,'’-]*(?:\\d{4}|'?\\d{2})|(?:0?[1-9]|1[0-2])[\\/.-](?:(?:19|20)\\d{2}|\\d{2})|(?:19|20)\\d{2}[\\/.-](?:0?[1-9]|1[0-2])(?!\\d)|(?:19|20)\\d{2})`;
const PRESENT = "(?:present|current|currently|till date|till now|to date|todate|now|ongoing|continuing|date)";
const RANGE = new RegExp(`(${DATE})\\s*(?:-|–|—|to|till|until|~)\\s*(${DATE}|${PRESENT})\\b`, "i");
const SINCE = new RegExp(`\\b(?:since|from)\\s+(${DATE})\\b(?!\\s*(?:-|–|—|to|till|until))`, "i");
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

const TITLE_WORDS = /\b(executive|manager|accountant|engineer|developer|associate|assistant|officer|intern|internship|analyst|coordinator|co-ordinator|lead|head|specialist|consultant|clerk|representative|agent|supervisor|trainee|designer|administrator|admin|operator|technician|teacher|tutor|nurse|pharmacist|cashier|receptionist|advisor|adviser|recruiter|telecaller|tele caller|caller|director|founder|owner|partner|programmer|architect|tester|auditor|controller|incharge|in-charge|in charge|staff|worker|helper|driver|guard|salesman|sales|marketing|hr|support|operations|faculty|lecturer|professor|apprentice|storekeeper|merchandiser|foreman|fitter|electrician|welder|chef|cook|steward|captain)\b/i;
const COMPANY_WORDS = /\b(pvt|private|ltd|limited|llp|inc|corp|corporation|company|co\.|industries|enterprises?|solutions|services|technologies|technology|tech|systems|bank|group|traders|trading|hospital|clinic|school|college|university|institute|agency|associates|consultancy|consultants|exports|imports|motors|steels?|mills?|foods|pharma|logistics|infotech|infosys|tcs|wipro|accenture|cognizant|reliance|tata|limited\.|plc|gmbh|& co|and co|firm|store|stores|mart|retail|bpo)\b/i;
const LEGAL_SUFFIX = /\b(pvt|private limited|ltd|limited|llp|inc|corp|corporation|plc|gmbh|& co|and co)\b/i;
const PLACE_WORDS = /\b(durgapur|asansol|kolkata|calcutta|howrah|bardhaman|burdwan|siliguri|kharagpur|bankura|purulia|raniganj|bolpur|haldia|dhanbad|jamshedpur|ranchi|bokaro|patna|bhubaneswar|cuttack|delhi|new delhi|noida|gurgaon|gurugram|mumbai|pune|bengaluru|bangalore|hyderabad|chennai|ahmedabad|jaipur|lucknow|guwahati|india|west bengal|jharkhand|bihar|odisha|remote)\b/i;

export type ParseInput = { text: string; fileName: string; fileType: "pdf" | "docx" | "text"; pages: number | null; sha256: string; knownName?: string; knownLocation?: string; now?: Date };

export function parseCv(input: ParseInput): CandidateProfile {
  const now = input.now ?? new Date();
  const { lines: rawLines, excluded } = removePersonalFields(input.text);
  const lines = assignSections(rawLines);
  const sections = new Set(lines.map(l => l.section).filter(s => s !== "header" && s !== "other"));
  const warnings: string[] = [];

  const contact = parseContact(input.text, lines, input.knownName, input.knownLocation);
  const work = parseWork(lines, now, warnings);
  const education = parseEducation(lines);
  const sectionText = (s: Section) => lines.filter(l => l.section === s).map(l => l.text.replace(BULLET, "")).join("\n");
  const summary = sectionText("summary").replace(/\s+/g, " ").slice(0, 700);
  const certifications = lines.filter(l => l.section === "certifications").map(l => l.text.replace(BULLET, "").trim()).filter(t => t.length > 3 && t.length <= 140).slice(0, 15);
  const languages = parseLanguages(lines);
  const full = lines.map(l => l.text).join("\n");

  const profile: CandidateProfile = {
    schemaVersion: "1.0",
    source: { method: "rules", model: null, fileName: input.fileName, fileType: input.fileType, textCharacters: input.text.length, pages: input.pages, sha256: input.sha256, extractedAt: now.toISOString(), engineVersion: ATS_ENGINE_VERSION },
    contact,
    headline: parseHeadline(lines, contact.name),
    summary,
    totalExperienceMonths: 0,
    statedExperienceYears: statedYears(full),
    work,
    education,
    skills: [],
    certifications,
    languages,
    noticePeriod: matchValue(full, /notice period\s*(?:of|is)?\s*[:\-–]?\s*([^\n|]{2,40})/i) || (/\bimmediate(ly)?\s+(joiner|joining|available)\b|\bavailable immediately\b/i.test(full) ? "Immediate" : ""),
    currentCtc: matchValue(full, /(?:current|present)\s*(?:ctc|salary|package)\s*[:\-–]?\s*([^\n|]{2,40})/i),
    expectedCtc: matchValue(full, /expected\s*(?:ctc|salary|package)\s*[:\-–]?\s*([^\n|]{2,40})/i),
    gaps: [],
    excludedPersonalFields: excluded,
    parse: { confidence: 0, sectionsFound: [...sections], warnings },
  };
  profile.skills = collectSkills(lines, work, now);
  return finaliseProfile(profile, input.text, now);
}

/** Shared by the rule and AI paths: totals, gaps, skill usage and confidence. */
export function finaliseProfile(profile: CandidateProfile, text: string, now: Date): CandidateProfile {
  const intervals = profile.work.filter(w => w.start).map(w => [toIndex(w.start!), w.current || !w.end ? nowIndex(now) : toIndex(w.end)] as [number, number]).filter(([a, b]) => b >= a).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of intervals) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b); else merged.push([a, b]);
  }
  profile.totalExperienceMonths = merged.reduce((sum, [a, b]) => sum + (b - a + 1), 0);
  profile.gaps = [];
  for (let i = 1; i < merged.length; i++) {
    const months = merged[i][0] - merged[i - 1][1] - 1;
    if (months >= 6) profile.gaps.push({ from: fromIndex(merged[i - 1][1]), to: fromIndex(merged[i][0]), months });
  }
  attachSkillUsage(profile.skills, profile.work, now);
  const p = profile.parse;
  const listed = profile.skills.filter(s => s.evidence === "listed").length;
  if (listed > 40) p.warnings.push("The skills list is unusually long. Skills backed by work history carry more weight.");
  if (profile.statedExperienceYears !== null && profile.work.length && Math.abs(profile.statedExperienceYears * 12 - profile.totalExperienceMonths) > 24)
    p.warnings.push(`The CV states about ${profile.statedExperienceYears} years of experience, but the dated roles add up to ${(profile.totalExperienceMonths / 12).toFixed(1)} years. Confirm with the candidate.`);
  let confidence = 0.2;
  if (text.replace(/\s/g, "").length >= 800) confidence += 0.2;
  if (profile.contact.email || profile.contact.phone) confidence += 0.15;
  if (p.sectionsFound.length >= 2 || profile.source.method === "ai") confidence += 0.15;
  if (profile.work.some(w => w.start) || (!p.sectionsFound.includes("experience") && profile.education.length)) confidence += 0.15;
  if (profile.skills.length >= 3) confidence += 0.15;
  p.confidence = Math.min(1, Math.round(confidence * 100) / 100);
  return profile;
}

export function removePersonalFields(text: string): { lines: string[]; excluded: string[] } {
  const excluded = new Set<string>();
  const lines: string[] = [];
  for (const raw of text.split("\n")) {
    // A line can hold several "Label: value" pairs separated by | or tabs.
    const kept = raw.split(/\s*[|\t]\s*/).filter(segment => {
      const s = segment.replace(BULLET, "").trim();
      const hit = PERSONAL_FIELDS.find(([, re]) => re.test(s) && (/[:\-–]/.test(s.slice(0, 40)) || s.split(/\s+/).length <= 3));
      if (hit) excluded.add(hit[0]);
      return !hit;
    });
    if (kept.length) lines.push(kept.join(" | ").trim());
    else lines.push("");
  }
  return { lines, excluded: [...excluded] };
}

function headingOf(text: string): Section | null {
  const t = text.replace(BULLET, "").replace(/[:：\-–_=*#]+\s*$/, "").replace(/^[#*=_\s]+/, "").trim().toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ");
  if (!t || t.length > 45) return null;
  for (const [section, re] of HEADINGS) if (re.test(t)) return section;
  return null;
}

function assignSections(raw: string[]): Line[] {
  const out: Line[] = [];
  let section: Section = "header";
  for (const original of raw) {
    const text = original.trim();
    if (!text) continue;
    const heading = headingOf(text);
    if (heading) { section = heading; continue; }
    // Inline headings: "Key Skills: Tally, GST, Excel" or "Languages known - English, Bengali".
    const inline = text.match(/^([A-Za-z &/]{3,40})\s*[:：\-–]\s+(.+)$/);
    const inlineSection = inline ? headingOf(inline[1]) : null;
    if (inline && inlineSection) { section = inlineSection; out.push({ text: inline[2], section }); continue; }
    out.push({ text, section });
  }
  return out;
}

function parseContact(text: string, lines: Line[], knownName?: string, knownLocation?: string) {
  const email = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0] ?? "";
  // Indian mobile numbers in any grouping ("98300 12345", "983-001-2345"), then international or landline forms.
  const phone = text.match(/(?:\+?91[\s-]?|\b0)?(?<!\d)[6-9](?:[\s-]?\d){9}(?!\d)|\+\d{1,3}[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}(?!\d)/)?.[0]?.trim() ?? "";
  const links = [...new Set((text.match(/(?:https?:\/\/|www\.)[^\s|,]+|(?:linkedin\.com|github\.com)\/[^\s|,]+/gi) ?? []).map(l => l.replace(/[).;]+$/, "")))].slice(0, 5);
  let name = knownName?.trim() ?? "";
  if (!name) {
    const candidate = lines.slice(0, 8).find(l => /^[A-Za-z][A-Za-z.' ]{2,48}$/.test(l.text) && l.text.trim().split(/\s+/).length >= 2 && l.text.trim().split(/\s+/).length <= 4 && !/resume|curriculum|vitae|\bcv\b|profile|summary/i.test(l.text) && !TITLE_WORDS.test(l.text));
    name = candidate ? titleCase(candidate.text.trim()) : "";
  }
  const addressLine = lines.find(l => /^(address|location|city|current location|residence|based in|present address|permanent address)\b/i.test(l.text))?.text ?? "";
  // Keep only city/state from an address, never the street address.
  const fromCv = addressLine ? addressLine.replace(/^[^:\-–]*[:\-–]\s*/, "").split(",").map(s => s.trim()).filter(s => s && !/\d{3}/.test(s)).slice(-2).join(", ") : "";
  const placeInHeader = lines.filter(l => l.section === "header").map(l => l.text.match(PLACE_WORDS)?.[0]).find(Boolean) ?? "";
  return { name, email, phone, location: knownLocation?.trim() || fromCv || titleCase(placeInHeader), links };
}

function parseHeadline(lines: Line[], name: string): string {
  const header = lines.filter(l => l.section === "header").map(l => l.text);
  return header.find(t => t !== name && t.length <= 90 && !/@|\d{5}|https?:|www\.|linkedin/i.test(t) && TITLE_WORDS.test(t)) ?? "";
}

type DatePoint = { index: number; yearOnly: boolean };

function parseDate(raw: string, now: Date, isEnd: boolean): DatePoint | null {
  const s = raw.toLowerCase().trim();
  if (new RegExp(`^${PRESENT}$`, "i").test(s)) return { index: nowIndex(now), yearOnly: false };
  const named = s.match(new RegExp(`^${MONTH}[\\s.,'’-]*('?\\d{2,4})$`, "i"));
  if (named) return point(year(named[2]), MONTHS[named[1].slice(0, 3)], false);
  const mmyy = s.match(/^(\d{1,2})[/.-](\d{2,4})$/);
  if (mmyy) return point(year(mmyy[2]), Number(mmyy[1]), false);
  const yymm = s.match(/^(\d{4})[/.-](\d{1,2})$/);
  if (yymm) return point(Number(yymm[1]), Number(yymm[2]), false);
  const y = s.match(/^((?:19|20)\d{2})$/);
  // Year-only ranges are counted from January of the start year to January of the end year.
  if (y) return point(Number(y[1]), 1, true);
  return null;
  function point(yr: number, month: number, yearOnly: boolean): DatePoint | null {
    if (!yr || month < 1 || month > 12 || yr < 1960 || yr * 12 + month - 1 > nowIndex(now) + 1) return isEnd && yr === now.getFullYear() ? { index: nowIndex(now), yearOnly } : null;
    return { index: yr * 12 + month - 1, yearOnly };
  }
  function year(v: string) {
    const n = Number(v.replace("'", ""));
    if (v.replace("'", "").length === 4) return n;
    return n + (n <= (now.getFullYear() % 100) + 1 ? 2000 : 1900);
  }
}

function findRange(text: string, now: Date) {
  const m = text.match(RANGE);
  if (m) {
    const start = parseDate(m[1], now, false), end = parseDate(m[2], now, true);
    if (start && end && end.index >= start.index) {
      const current = new RegExp(`^${PRESENT}$`, "i").test(m[2].trim());
      return { start, end, current, matched: m[0], yearOnly: start.yearOnly || end.yearOnly };
    }
  }
  const since = text.match(SINCE);
  if (since) {
    const start = parseDate(since[1], now, false);
    if (start) return { start, end: { index: nowIndex(now), yearOnly: false }, current: true, matched: since[0], yearOnly: start.yearOnly };
  }
  return null;
}

const EDUCATION_LINE = /\b(university|college|school|vidyalaya|board|cbse|icse|wbbse|wbchse|b\.?\s?com|bba|bca|b\.?\s?sc|b\.?\s?tech|m\.?\s?com|mba|mca|m\.?\s?sc|m\.?\s?tech|10th|12th|hsc|ssc|diploma|graduat\w*|bachelor|master|madhyamik|higher secondary|cgpa|gpa|percentage|marks)\b/i;

function headerish(text: string) {
  const sentenceEnd = /;$/.test(text) || (/\.$/.test(text) && !/\b(ltd|co|inc|pvt|corp|llp|bros)\.$/i.test(text));
  return !!text && !BULLET.test(text) && text.length <= 110 && !sentenceEnd && text.split(/\s+/).length <= 14 && !headingOf(text);
}

function parseWork(lines: Line[], now: Date, warnings: string[]): WorkEntry[] {
  const inExperience = lines.some(l => l.section === "experience");
  const scope = lines.filter(l => inExperience ? l.section === "experience" : !["education", "certifications", "projects", "languages", "personal", "skills"].includes(l.section));
  const texts = scope.map(l => l.text);
  const dated = texts.map((t, i) => ({ i, range: EDUCATION_LINE.test(t) && !TITLE_WORDS.test(t) ? null : findRange(t, now) })).filter(d => d.range);
  // Without an experience heading, only accept date lines that look like a role.
  const accepted = inExperience ? dated : dated.filter(d => TITLE_WORDS.test(texts[d.i]) || TITLE_WORDS.test(texts[d.i - 1] ?? "") || COMPANY_WORDS.test(texts[d.i]) || COMPANY_WORDS.test(texts[d.i - 1] ?? ""));
  if (inExperience && !accepted.length) warnings.push("No dated roles were found in the experience section; total experience could not be calculated.");
  const jobs: WorkEntry[] = [];
  let yearOnly = false;
  const ownedUntil: number[] = [];
  accepted.forEach((d, k) => {
    const range = d.range!;
    yearOnly ||= range.yearOnly;
    const floor = k > 0 ? accepted[k - 1].i + 1 : 0;
    const rest = texts[d.i].replace(range.matched, " ").replace(/[()[\]]/g, " ").replace(/^\s*[|,:\-–—]+|[|,:\-–—]+\s*$/g, "").trim();
    const before: string[] = [];
    for (let j = d.i - 1; j >= floor && before.length < 2; j--) {
      if (!headerish(texts[j])) break;
      before.unshift(texts[j]);
    }
    const headerStart = d.i - before.length;
    if (k > 0) ownedUntil[k - 1] = headerStart;
    const after: string[] = [];
    let consumed = 0;
    if (!rest && !before.length) {
      for (let j = d.i + 1; j < texts.length && after.length < 2 && (k + 1 >= accepted.length || j < accepted[k + 1].i); j++) {
        if (!headerish(texts[j])) break;
        after.push(texts[j]); consumed++;
      }
    }
    const parts = [...before, rest, ...after].filter(Boolean);
    const { title, employer, location } = splitHeader(parts);
    jobs.push({ title, employer, location, start: fromIndex(range.start.index), end: range.current ? null : fromIndex(range.end.index), current: range.current, months: range.end.index - range.start.index + (range.yearOnly ? 0 : 1) || 6, highlights: [String(d.i + 1 + consumed)] });
  });
  // Fill highlights now that each job's header region is known.
  jobs.forEach((job, k) => {
    const from = Number(job.highlights[0]);
    const to = k + 1 < jobs.length ? ownedUntil[k] : texts.length;
    job.highlights = texts.slice(from, to).map(t => t.replace(BULLET, "").trim()).filter(t => t.length > 2).slice(0, 12).map(t => t.slice(0, 300));
  });
  if (yearOnly) warnings.push("Some roles give years without months, so experience totals are approximate.");
  return jobs.sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0) || (b.end ?? "9999").localeCompare(a.end ?? "9999") || (b.start ?? "").localeCompare(a.start ?? ""));
}

function splitHeader(parts: string[]): { title: string; employer: string; location: string } {
  const segments = parts.flatMap(p => p.split(/\s+(?:at|@)\s+|\s*[|•·]\s*|\s+[–—-]\s+|\t|,\s*(?=[A-Z])/)).map(s => s.trim().replace(/^[,:\-–]+|[,:\-–]+$/g, "").trim()).filter(Boolean);
  let title = "", employer = "", location = "";
  const rest: string[] = [];
  for (const s of segments) {
    if (!location && PLACE_WORDS.test(s) && s.split(/\s+/).length <= 3 && !COMPANY_WORDS.test(s)) location = s;
    else if (!employer && LEGAL_SUFFIX.test(s)) employer = s;
    else if (!title && TITLE_WORDS.test(s)) title = s;
    else if (!employer && COMPANY_WORDS.test(s)) employer = s;
    else rest.push(s);
  }
  if (!title && rest.length) title = rest.shift()!;
  if (!employer && rest.length) employer = rest.shift()!;
  return { title: title.slice(0, 120), employer: employer.slice(0, 120), location: location.slice(0, 80) };
}

export const DEGREES: [RegExp, string, number][] = [
  [/\b(ph\.?\s?d|doctorate)\b/i, "PhD", 6],
  [/\bm\.?\s?b\.?\s?a\b|\bpgdm\b|\bpgdba\b/i, "MBA / PGDM", 5],
  [/\bm\.?\s?com\b/i, "M.Com", 5],
  [/\bm\.?\s?c\.?\s?a\b/i, "MCA", 5],
  [/\bm\.?\s?tech\b|\bm\.\s?e\.?\b/i, "M.Tech / M.E.", 5],
  [/\bm\.?\s?sc\b/i, "M.Sc", 5],
  [/\bm\.\s?a\.?\b|\bmaster of arts\b/i, "M.A.", 5],
  [/\bchartered accountant\b|\bca final\b|\bfca\b|\baca\b|\bca\b(?!\s*(inter|foundation|ipcc|cpt))/i, "Chartered Accountant", 5],
  [/\bcma\b(?!\s*inter)|\bicwa\b|\bcompany secretary\b/i, "CMA / CS", 5],
  [/\bllm\b|\bm\.?\s?ed\b|\bmasters?\b|\bpost[\s-]?graduat\w*/i, "Master's degree", 5],
  [/\bb\.?\s?com\b/i, "B.Com", 4],
  [/\bb\.?\s?b\.?\s?a\b|\bbbm\b/i, "BBA", 4],
  [/\bb\.?\s?c\.?\s?a\b/i, "BCA", 4],
  [/\bb\.?\s?tech\b|\bb\.\s?e\.?\b|\bbachelor of engineering\b/i, "B.Tech / B.E.", 4],
  [/\bb\.?\s?sc\b/i, "B.Sc", 4],
  [/\bb\.?\s?pharm\b/i, "B.Pharm", 4],
  [/\bb\.\s?a\.?\b|\bbachelor of arts\b/i, "B.A.", 4],
  [/\bllb\b|\bb\.?\s?ed\b|\bbachelor'?s?\b|\bgraduat(e|ion)\b|\bhons\b/i, "Bachelor's degree", 4],
  [/\bca\s*(inter|ipcc)\b|\bcma\s*inter\b/i, "CA / CMA Intermediate", 4],
  [/\bdiploma\b|\bpolytechnic\b|\biti\b|\bd\.?\s?pharm\b|\bgnm\b|\banm\b|\bdmlt\b/i, "Diploma / ITI", 3],
  [/\b(12th|xii|h\.?s\.?c|higher secondary|intermediate|class 12|10\s?\+\s?2|isc|plus two|uchha madhyamik)\b/i, "Higher secondary (12th)", 2],
  [/\b(10th|ssc|s\.s\.c|secondary|matric\w*|madhyamik|class 10|icse)\b/i, "Secondary (10th)", 1],
];
const FIELDS = /\b(commerce|accountancy|accounting|accounts|finance|financial|economics|business administration|management|marketing|human resources?|hr|computer science|computer applications|information technology|it|science|physics|chemistry|mathematics|maths|biology|arts|english|history|geography|political science|sociology|psychology|mechanical|electrical|electronics|civil|chemical|metallurgy|instrumentation|pharmacy|nursing|hotel management|law|education|statistics)\b/i;
const INSTITUTION = /\b(university|college|institute|institution|school|vidyalaya|academy|iit|nit|iim|board|cbse|icse|wbbse|wbchse|wbscte|polytechnic|mahavidyalaya)\b/i;

function parseEducation(lines: Line[]): EducationEntry[] {
  const inSection = lines.some(l => l.section === "education");
  const scope = lines.filter(l => inSection ? l.section === "education" : l.section !== "experience");
  const out: EducationEntry[] = [];
  scope.forEach((line, i) => {
    const text = line.text;
    const hit = DEGREES.find(([re]) => re.test(text));
    if (!hit) return;
    // Outside an education section, demand an institution or year nearby to avoid false hits.
    const nearby = [scope[i - 1]?.text ?? "", text, scope[i + 1]?.text ?? "", scope[i + 2]?.text ?? ""];
    if (!inSection && !INSTITUTION.test(nearby.join(" ")) && !/(19|20)\d{2}/.test(text)) return;
    const years = (nearby.slice(1, 3).join(" ").match(/\b(19[6-9]\d|20[0-4]\d)\b/g) ?? []).map(Number);
    const institutionLine = nearby.find(t => INSTITUTION.test(t) && !DEGREES.some(([re]) => re.test(t) && t !== text)) ?? "";
    // Keep just the part that names the institution ("Example University"), not the whole line.
    const institution = institutionLine.split(/\s*[,|;]\s*|\s+[–—-]\s+/).find(part => INSTITUTION.test(part) && !DEGREES.some(([re]) => re.test(part))) ?? institutionLine.split(/\s*[,|]\s*/).find(part => INSTITUTION.test(part)) ?? "";
    const field = text.match(/\bin\s+([A-Za-z &]{3,40})/)?.[1]?.trim() || text.match(/\(([A-Za-z &]{3,40})\)/)?.[1]?.trim() || text.match(FIELDS)?.[0] || "";
    const entry = { qualification: hit[1], level: hit[2], field: titleCase(field), institution: institution.replace(BULLET, "").slice(0, 120), year: years.length ? Math.max(...years) : null };
    if (!out.some(e => e.qualification === entry.qualification && e.year === entry.year)) out.push(entry);
  });
  return out.sort((a, b) => b.level - a.level).slice(0, 8);
}

function parseLanguages(lines: Line[]): string[] {
  const text = lines.filter(l => l.section === "languages" || /\blanguages?\s*(known|spoken)?\s*[:\-–]/i.test(l.text)).map(l => l.text).join(" ");
  return findSkills(text).filter(f => f.skill.family === "language").map(f => f.skill.label);
}

function statedYears(text: string): number | null {
  const values = [...text.matchAll(/(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years?|yrs?)(?:\s+and\s+\d{1,2}\s*months?)?\s+(?:of\s+)?(?:\w+\s+){0,3}?experience/gi)].map(m => Number(m[1])).filter(n => n > 0 && n <= 45);
  return values.length ? Math.max(...values) : null;
}

const EVIDENCE_RANK: Record<SkillEvidence, number> = { work: 5, certification: 4, summary: 3, other: 2, listed: 1 };

function collectSkills(lines: Line[], work: WorkEntry[], now: Date): CandidateSkill[] {
  const skills = new Map<string, CandidateSkill>();
  const add = (id: string, name: string, family: string, evidence: SkillEvidence, snippet: string) => {
    const current = skills.get(id);
    if (!current || EVIDENCE_RANK[evidence] > EVIDENCE_RANK[current.evidence]) skills.set(id, { id, name, family, evidence, months: current?.months ?? 0, lastUsedYear: current?.lastUsedYear ?? null, snippet: snippet.slice(0, 160) });
  };
  const evidenceFor: Partial<Record<Section, SkillEvidence>> = { experience: "work", summary: "summary", certifications: "certification", projects: "other", skills: "listed", header: "summary", languages: "listed", other: "other" };
  for (const line of lines) {
    const evidence = evidenceFor[line.section];
    if (!evidence) continue;
    const short = line.section === "skills" || line.section === "certifications";
    for (const f of findSkills(line.text, { allowShortAliases: short })) add(f.skill.id, f.skill.label, f.skill.family, evidence, line.text);
  }
  // Skills listed in the skills section that the taxonomy does not know yet.
  // Re-join items that a PDF wrapped across lines ("Excel (VLOOKUP, pivot" + "tables)").
  const skillLines: string[] = [];
  for (const line of lines.filter(l => l.section === "skills")) {
    const last = skillLines[skillLines.length - 1];
    if (last !== undefined && (last.match(/\(/g)?.length ?? 0) > (last.match(/\)/g)?.length ?? 0)) skillLines[skillLines.length - 1] = `${last} ${line.text}`;
    else skillLines.push(line.text.replace(BULLET, ""));
  }
  for (const line of skillLines) {
    for (const item of splitTopLevel(line)) {
      const t = item.replace(/^[^:]{2,30}:\s*/, "").replace(/^[\s([]+|[\s)\].]+$/g, "").trim();
      if (!/[a-z]{2}/i.test(t)) continue;
      if (t.length < 2 || t.length > 40 || t.split(/\s+/).length > 4 || findSkills(t, { allowShortAliases: true }).length) continue;
      const resolved = resolveSkill(t);
      if (resolved && skills.size < 120) add(resolved.id, resolved.name, resolved.family, "listed", line);
    }
  }
  const out = [...skills.values()];
  attachSkillUsage(out, work, now);
  return out;
}

/** Months used and last-used year from dated roles whose title or highlights mention the skill. */
function attachSkillUsage(skills: CandidateSkill[], work: WorkEntry[], now: Date) {
  const nowYear = now.getFullYear();
  for (const skill of skills) {
    let months = 0, last: number | null = null;
    for (const job of work) {
      const text = [job.title, ...job.highlights].join("\n");
      const mentioned = skill.id.startsWith("term:") ? normalise(text).includes(` ${skill.id.slice(5)} `) : findSkills(text, { allowShortAliases: false }).some(f => f.skill.id === skill.id);
      if (!mentioned) continue;
      months += job.months;
      const year = job.current || !job.end ? nowYear : Number(job.end.slice(0, 4));
      last = Math.max(last ?? 0, year);
      if (skill.evidence !== "work") { skill.evidence = "work"; skill.snippet = (job.highlights.find(h => normalise(h).includes(normalise(skill.name).trim())) ?? job.title).slice(0, 160); }
    }
    skill.months = months;
    skill.lastUsedYear = last;
  }
  skills.sort((a, b) => EVIDENCE_RANK[b.evidence] - EVIDENCE_RANK[a.evidence] || b.months - a.months || a.name.localeCompare(b.name));
}

/** Split a skills line on separators that are not inside brackets: "Excel (VLOOKUP, pivots), Tally". */
function splitTopLevel(text: string): string[] {
  const out: string[] = [];
  let depth = 0, current = "";
  for (const ch of text) {
    if (ch === "(" || ch === "[") depth++;
    if ((ch === ")" || ch === "]") && depth > 0) depth--;
    if (depth === 0 && /[,;|•·]/.test(ch)) { out.push(current); current = ""; } else current += ch;
  }
  out.push(current);
  return out.flatMap(item => item.split(/\s+\/\s+/)).map(item => item.trim()).filter(Boolean);
}

function matchValue(text: string, re: RegExp) {
  return text.match(re)?.[1]?.trim().replace(/[.,;]+$/, "") ?? "";
}
const nowIndex = (now: Date) => now.getFullYear() * 12 + now.getMonth();
const toIndex = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
const fromIndex = (index: number) => `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());

