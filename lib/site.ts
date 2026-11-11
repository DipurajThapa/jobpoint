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
export const CONTACT = { phone: "+91 96119 87667", phoneHref: "tel:+919611987667", email: "dipuraj.thapa@gmail.com" } as const;

/** Equal coverage for IT and non-IT recruitment. */
export const RECRUITMENT = { roles: ["IT: Software development and testing", "IT: Data and analytics", "IT: Support and infrastructure", "Non-IT: Accounts and finance", "Non-IT: Sales and business development", "Non-IT: Customer support and operations"] } as const;

/** The public address of the site, used in links sent to candidates and in search metadata. No trailing slash. */
export const SITE_URL = configuredSiteUrl();
