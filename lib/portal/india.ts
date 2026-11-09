// Indian-market field parsers: CTC in rupees per year, notice period in days,
// seniority bands, city names and relocation willingness. Pure functions.

const LAKH = 100_000, CRORE = 10_000_000;

/** Parse a CTC phrase to rupees per year. Returns null when no amount is found. */
export function parseCtcInr(text: string): number | null {
  // "12 LPA fixed + 2 LPA variable" is a total CTC of 14 LPA.
  const parts = text.split(/\s\+\s|\s+plus\s+/i);
  if (parts.length > 1) {
    const values = parts.map(p => parseCtcInr(p));
    if (values.every(v => v !== null)) return values.reduce((sum, v) => sum! + v!, 0);
  }
  const s = text.toLowerCase().replace(/[₹]|rs\.?|inr/g, " ").replace(/,(?=\d)/g, "").replace(/\s+/g, " ").trim();
  const m = s.match(/(\d+(?:\.\d+)?)\s*(k|thousand|l|lac|lacs|lakh|lakhs|lpa|cr|crore|crores|cpa)?\b\s*(per month|\/\s*month|p\.?\s?m\.?|monthly|a month|per annum|p\.?\s?a\.?|\/\s*annum|per year|\/\s*year|yearly|annual|annually)?/);
  if (!m) return null;
  let value = Number(m[1]);
  const unit = m[2] ?? "", period = m[3] ?? "";
  if (/^(l|lac|lacs|lakh|lakhs|lpa)$/.test(unit)) value *= LAKH;
  else if (/^(cr|crore|crores|cpa)$/.test(unit)) value *= CRORE;
  else if (/^(k|thousand)$/.test(unit)) value *= 1000;
  const monthly = /month|p\.?\s?m/.test(period) || (!unit && !period && value >= 5000 && value < 300_000 && /month|in.?hand/.test(s));
  if (monthly) value *= 12;
  // A bare number below 100 with no unit is lakhs in Indian usage ("CTC: 4.5").
  if (!unit && !period && value > 0 && value < 100) value *= LAKH;
  if (value < 30_000 || value > 50 * CRORE) return null;
  return Math.round(value);
}

/** Parse a CTC range ("3–4.5 LPA", "up to 6 lakh", "₹25,000–35,000 per month"). */
export function parseCtcRange(text: string): { min: number | null; max: number | null } | null {
  const s = text.replace(/,(?=\d)/g, "");
  const range = s.match(/(\d+(?:\.\d+)?)\s*(k|l|lac|lakhs?|lpa)?\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(k|l|lac|lacs|lakhs?|lpa|cr|crores?)?\s*(per month|\/\s*month|p\.?\s?m\.?|monthly|per annum|p\.?\s?a\.?|lpa)?/i);
  if (range) {
    const unit = range[4] ?? range[2] ?? "", period = range[5] ?? "";
    const min = parseCtcInr(`${range[1]} ${unit} ${period}`), max = parseCtcInr(`${range[3]} ${unit} ${period}`);
    if (min && max && max >= min) return { min, max };
  }
  const upTo = s.match(/(?:up\s*to|upto|max(?:imum)?|not more than)\s*([^.;\n]{1,40})/i);
  if (upTo) { const max = parseCtcInr(upTo[1]); if (max) return { min: null, max }; }
  const from = s.match(/(?:from|min(?:imum)?|at least|starting)\s*([^.;\n]{1,40})/i);
  if (from) { const min = parseCtcInr(from[1]); if (min) return { min, max: null }; }
  return null;
}

export function formatLpa(inr: number | null): string {
  if (inr === null) return "not stated";
  return `₹${(inr / LAKH).toFixed(inr % LAKH === 0 ? 0 : 1)} LPA`;
}

const MONTH_INDEX: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** Parse a notice period phrase to days. "Serving notice, LWD 15 Dec" counts days from `now`. */
export function parseNoticeDays(text: string, now = new Date()): number | null {
  const s = text.toLowerCase();
  if (/\bimmediate(ly)?\b|\bnone\b|\bno notice\b|\bavailable now\b|\bcurrently not working\b|\bnot employed\b/.test(s)) return 0;
  const lwd = s.match(/(?:lwd|last working day|relieving date|serving notice[^0-9a-z]*(?:till|until|up to)?)\D{0,12}(\d{1,2})(?:st|nd|rd|th)?[\s\-/.]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-/.,]*(\d{4})?/);
  if (lwd) {
    const year = lwd[3] ? Number(lwd[3]) : now.getFullYear();
    let date = new Date(Date.UTC(year, MONTH_INDEX[lwd[2]], Number(lwd[1])));
    if (!lwd[3] && date.getTime() < now.getTime() - 86_400_000) date = new Date(Date.UTC(year + 1, MONTH_INDEX[lwd[2]], Number(lwd[1])));
    return Math.max(0, Math.round((date.getTime() - now.getTime()) / 86_400_000));
  }
  const days = s.match(/(\d{1,3})\s*days?/);
  if (days) return Number(days[1]) <= 180 ? Number(days[1]) : null;
  const weeks = s.match(/(\d{1,2})\s*weeks?/);
  if (weeks) return Number(weeks[1]) * 7;
  const months = s.match(/(\d(?:\.\d)?|one|two|three|six)\s*months?/);
  if (months) { const n = ({ one: 1, two: 2, three: 3, six: 6 } as Record<string, number>)[months[1]] ?? Number(months[1]); return Math.round(n * 30); }
  return null;
}

export type Seniority = "fresher" | "junior" | "mid" | "senior" | "lead";
export const SENIORITY_ORDER: Seniority[] = ["fresher", "junior", "mid", "senior", "lead"];
// Bands follow common Indian recruiter usage: fresher, 1–3, 3–6, 6–10, 10+ years.
export const SENIORITY_LABEL: Record<Seniority, string> = { fresher: "Fresher (under 1 year)", junior: "Junior (1–3 years)", mid: "Mid-level (3–6 years)", senior: "Senior (6–10 years)", lead: "Lead or manager (10+ years or people lead)" };
export const bandForYears = (years: number) => years < 1 ? 0 : years < 3 ? 1 : years < 6 ? 2 : years < 10 ? 3 : 4;

const LEAD_TITLE = /\b(head|manager|lead|team lead|supervisor|in-?charge|director|vp|vice president|chief|principal|general manager|gm|agm|dgm)\b/i;
const SENIOR_TITLE = /\b(senior|sr\.?|specialist|consultant)\b/i;
const JUNIOR_TITLE = /\b(junior|jr\.?|trainee|intern|apprentice|assistant|associate)\b/i;

/** Seniority from years of experience, nudged one band by the most recent title. */
export function seniorityFor(years: number, recentTitle = ""): Seniority {
  let band = bandForYears(years);
  if (LEAD_TITLE.test(recentTitle) && !/assistant (manager)?/i.test(recentTitle) && years >= 5) band = Math.max(band, 4);
  else if (SENIOR_TITLE.test(recentTitle) && years >= 4) band = Math.max(band, 3);
  else if (JUNIOR_TITLE.test(recentTitle) && band > 1 && years < 5) band = 1;
  return SENIORITY_ORDER[band];
}

export function seniorityFromText(text: string): Seniority[] {
  const s = text.toLowerCase(), out = new Set<Seniority>();
  if (/\bfreshers?\b|\bentry[- ]level\b|\b0\s*(-|–|to)\s*1\b/.test(s)) out.add("fresher");
  if (/\bjunior\b|\bjr\b/.test(s)) out.add("junior");
  if (/\bmid[- ]?(level|senior)?\b/.test(s)) out.add("mid");
  if (/\bsenior\b|\bsr\b/.test(s)) out.add("senior");
  if (/\b(lead|head|manager)\b/.test(s)) out.add("lead");
  return [...out];
}

const CITY_ALIASES: Record<string, string> = {
  calcutta: "Kolkata", kolkata: "Kolkata", howrah: "Howrah", "salt lake": "Kolkata", "new town": "Kolkata", bidhannagar: "Kolkata",
  bangalore: "Bengaluru", bengaluru: "Bengaluru", bombay: "Mumbai", mumbai: "Mumbai", "navi mumbai": "Navi Mumbai", thane: "Thane",
  gurgaon: "Gurugram", gurugram: "Gurugram", delhi: "Delhi", "new delhi": "Delhi", noida: "Noida", "greater noida": "Noida", ghaziabad: "Ghaziabad",
  madras: "Chennai", chennai: "Chennai", hyderabad: "Hyderabad", secunderabad: "Hyderabad", pune: "Pune", ahmedabad: "Ahmedabad", jaipur: "Jaipur", lucknow: "Lucknow",
  durgapur: "Durgapur", asansol: "Asansol", raniganj: "Raniganj", burdwan: "Bardhaman", bardhaman: "Bardhaman", bankura: "Bankura", purulia: "Purulia",
  siliguri: "Siliguri", kharagpur: "Kharagpur", haldia: "Haldia", bolpur: "Bolpur", panagarh: "Panagarh", kalyani: "Kalyani",
  dhanbad: "Dhanbad", jamshedpur: "Jamshedpur", ranchi: "Ranchi", bokaro: "Bokaro", patna: "Patna", bhubaneswar: "Bhubaneswar", cuttack: "Cuttack", guwahati: "Guwahati",
  kochi: "Kochi", cochin: "Kochi", coimbatore: "Coimbatore", indore: "Indore", bhopal: "Bhopal", nagpur: "Nagpur", chandigarh: "Chandigarh", vadodara: "Vadodara", surat: "Surat", visakhapatnam: "Visakhapatnam", vizag: "Visakhapatnam",
};
const REMOTE = /\b(remote|work from home|wfh|anywhere in india|pan[- ]india)\b/i;

/** Canonical city names found in free text, in order of appearance. */
export function citiesIn(text: string): string[] {
  const s = ` ${text.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ")} `;
  const hits: [number, string][] = [];
  for (const [alias, city] of Object.entries(CITY_ALIASES)) {
    const at = s.indexOf(` ${alias} `);
    if (at >= 0) hits.push([at, city]);
  }
  if (REMOTE.test(text)) hits.push([s.search(REMOTE) >= 0 ? s.search(REMOTE) : 9999, "Remote"]);
  return [...new Set(hits.sort((a, b) => a[0] - b[0]).map(h => h[1]))];
}

export const canonicalCity = (name: string) => citiesIn(name)[0] ?? name.trim().replace(/\b[a-z]/g, c => c.toUpperCase());

export function relocationFrom(text: string): boolean | null {
  const s = text.toLowerCase();
  if (/\b(not|un)\s*(willing|open|ready)\s*to\s*relocat|\bno relocation\b|\bcannot relocate\b|relocat\w*\s*[:\-–]\s*no\b/.test(s)) return false;
  if (/\b(willing|open|ready|happy)\s*to\s*relocat|\brelocat\w*\s*[:\-–]\s*yes\b|\bopen to relocation\b|\bany location\b|\banywhere in india\b|\bpan[- ]india\b/.test(s)) return true;
  return null;
}

/** Pull Indian-market fields from CV text (labels such as "Current CTC: 4.2 LPA"). */
export function indianCvFields(text: string, now = new Date()) {
  const line = (re: RegExp) => text.match(re)?.[1]?.trim() ?? "";
  const currentCtc = line(/(?:current|present|existing)\s*(?:ctc|salary|package|compensation)\s*(?:is|of)?\s*[:\-–]?\s*([^\n|]{2,50})/i);
  const expectedCtc = line(/(?:expected|desired)\s*(?:ctc|salary|package|compensation)\s*(?:is|of)?\s*[:\-–]?\s*([^\n|]{2,50})/i);
  const notice = line(/(notice period\s*(?:of|is)?\s*[:\-–]?\s*[^\n|]{1,60})/i) || line(/(serving notice[^\n|]{0,50})/i) || line(/(immediate(?:ly)?\s+(?:joiner|joining|available)[^\n|]{0,10})/i) || line(/(available\s+immediately)/i);
  const preferred = line(/(?:preferred|desired)\s*(?:job\s*)?(?:location|city|cities)s?\s*[:\-–]?\s*([^\n|]{2,120})/i);
  const current = line(/(?:current|present)\s*(?:location|city)\s*[:\-–]?\s*([^\n|]{2,80})/i) || line(/(?:^|\n)\s*(?:location|city|based in)\s*[:\-–]?\s*([^\n|]{2,80})/i);
  return {
    ctcCurrentInr: currentCtc ? parseCtcInr(currentCtc) : null,
    ctcExpectedInr: expectedCtc ? parseCtcInr(expectedCtc) : null,
    noticeDays: notice ? parseNoticeDays(notice, now) : null,
    preferredCities: preferred ? citiesIn(preferred) : [],
    currentCity: current ? citiesIn(current)[0] ?? "" : "",
    willingToRelocate: relocationFrom(text),
  };
}
