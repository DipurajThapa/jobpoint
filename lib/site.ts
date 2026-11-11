const DEFAULT_SITE_URL = "https://jobboard300.dippurajthapa.chatgpt.site";

/**
 * Reads an optional PUBLIC_SITE_URL (for example when the site moves to its own domain).
 * Anything that is not a plain https address is ignored, so a typing mistake cannot break
 * the test and commitment links that are built from this value.
 */
function configuredSiteUrl(): string {
  const raw = typeof process !== "undefined" ? process.env?.PUBLIC_SITE_URL : undefined;
  if (!raw) return DEFAULT_SITE_URL;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" ? parsed.origin : DEFAULT_SITE_URL;
  } catch { return DEFAULT_SITE_URL; }
}

/**
 * How to reach Jobboard300. Shown in the footer, the contact section and the privacy notice.
 * The postal address is still to come from the owner.
 */
export const CONTACT = { phone: "+91 96119 87667", phoneHref: "tel:+919611987667", email: "dipuraj.thapa@gmail.com", city: "Bengaluru, India" } as const;

/** The pilot: one city and three role families. Public copy names only these; other roles are not covered yet. */
export const PILOT = { city: "Bengaluru", roles: ["Accounts and finance", "Sales and business development", "Customer support and operations"] } as const;

/** The public address of the site, used in links sent to candidates and in search metadata. No trailing slash. */
export const SITE_URL = configuredSiteUrl();
