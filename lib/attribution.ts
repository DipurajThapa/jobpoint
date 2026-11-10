// Where a visitor came from, so that an application or an enquiry can be traced
// to the post or campaign that produced it. Read once, when the visitor arrives:
// the campaign tags on the link (utm_source, utm_medium, utm_campaign), the host
// name of the referring site and the first page opened. Kept in the browser tab
// (sessionStorage) and sent only with a form. No cookie, no visitor identifier.

export type Attribution = { source: string; medium: string; campaign: string; referrer: string; landing: string };
const KEY = "jb300.arrival";
const tidy = (value: unknown, max = 80) => typeof value === "string" ? value.trim().toLowerCase().replace(/[^a-z0-9 ._\-/]/g, "").slice(0, max) : "";

/** Call once per page load in the browser. The first arrival in the tab wins. */
export function captureAttribution() {
  try {
    if (sessionStorage.getItem(KEY)) return;
    const q = new URLSearchParams(location.search);
    let referrer = "";
    try { const host = document.referrer ? new URL(document.referrer).hostname : ""; referrer = host && host !== location.hostname ? host : ""; } catch { /* unreadable referrer */ }
    const arrival: Attribution = { source: tidy(q.get("utm_source")), medium: tidy(q.get("utm_medium")), campaign: tidy(q.get("utm_campaign")), referrer: tidy(referrer), landing: tidy(location.pathname, 120) };
    sessionStorage.setItem(KEY, JSON.stringify(arrival));
  } catch { /* storage unavailable: forms are simply sent without it */ }
}

/** The stored arrival, for a form about to be sent. Empty when nothing was captured. */
export function attributionFields(): Partial<Attribution> {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as Partial<Attribution>; } catch { return {}; }
}

/** Server side: accept only short plain values. */
export function cleanAttribution(get: (name: string) => unknown): Attribution {
  return { source: tidy(get("source")), medium: tidy(get("medium")), campaign: tidy(get("campaign")), referrer: tidy(get("referrer")), landing: tidy(get("landing"), 120) };
}

/** A short label for a card: "linkedin / spring-hiring", "google.com", or "direct". */
export const attributionLabel = (a: Partial<Attribution>) => [a.source || a.referrer || "direct", a.campaign].filter(Boolean).join(" / ");
