// Commercial and data-access policy for client companies.
//
// Jobboard300 works on a placement fee: a percentage of the hired person's
// annual salary, charged when they join, with a replacement guarantee. Clients
// do not browse, search or buy candidate profiles. A Jobboard300 recruiter
// submits each candidate, and the client can see that person only while the
// hiring process for them is open. How candidates are selected stays internal:
// clients never see scores, rankings, match counts or the reasons behind them.

export const FEE = { minPct: 7.5, maxPct: 8.33, defaultPct: 8.33, guaranteeDays: 60 } as const;

/** A live job's requirements can be changed this many times in the window; more needs a recruiter. Stops requirement changes being used to probe the matching. */
export const REQUIREMENT_EDITS = { max: 3, days: 30 } as const;

/** Stages in which the client may see the candidate's profile and CV. */
export const ACCESS_STAGES = ["submitted", "shortlisted", "interview", "offered", "offer_accepted"] as const;
/** Stages from which the client also gets the candidate's contact details. Before that, Jobboard300 arranges every interview. */
export const CONTACT_STAGES = ["offered", "offer_accepted"] as const;


export function feePercent(value: unknown): number {
  const n = Math.round(Number(value ?? FEE.defaultPct) * 100) / 100;
  if (!(n >= FEE.minPct && n <= FEE.maxPct)) throw new RangeError(`The placement fee must be between ${FEE.minPct}% and ${FEE.maxPct}% of annual salary.`);
  return n;
}

export const placementFee = (annualCtcInr: number | null | undefined, pct: number) => annualCtcInr ? Math.round(annualCtcInr * pct / 100) : null;

/** Remove email addresses, phone numbers and profile links from CV text. */
export function redactContacts(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[contact shared at offer stage]")
    .replace(/(?:https?:\/\/|www\.)\S+/gi, "[link removed]")
    .replace(/\b(?:linkedin|github|gitlab|twitter|x|t|wa)\.(?:com|me)\/\S+/gi, "[link removed]")
    .replace(/(?:\+?\d[\s().-]?){10,14}/g, m => m.replace(/\D/g, "").length >= 10 ? "[phone removed] " : m);
}

/** Company names compared without case, punctuation or legal suffixes. */
export const nameKey = (name: string) => name.toLowerCase().replace(/&/g, " and ").replace(/\b(pvt|private|ltd|limited|llp|inc|incorporated|corp|corporation|co|company|india)\b\.?/g, " ").replace(/[^a-z0-9]+/g, "");
