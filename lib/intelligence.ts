/** Validation shared by the supervised dashboard and its API. */
export const SOURCE_CATEGORIES = ["Government", "Employer", "Industry", "Research", "News", "Education"] as const;
export const RELIABILITY = ["unreviewed", "trusted", "watch", "blocked"] as const;
export const AUDIENCES = ["Candidates", "Employers", "Both"] as const;
export const PRIORITIES = ["high", "medium", "low"] as const;
export const OPPORTUNITY_STATES = ["idea", "researching", "verified", "drafting", "review", "approved", "rejected"] as const;

export function externalUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 1500) return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password && url.hostname.includes(".") ? url.href : "";
  } catch { return ""; }
}
export function words(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "";
}
export function oneOf<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return values.includes(value as T) ? value as T : fallback;
}
export function verifiedEvidence(primary: string, corroboration: string, note: string): boolean {
  // Distinct hostnames are a minimum input check, NOT proof of independent reporting.
  return !!primary && !!corroboration && new URL(primary).hostname !== new URL(corroboration).hostname && note.length >= 30;
}
