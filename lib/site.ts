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

/** The public address of the site, used in links sent to candidates and in search metadata. No trailing slash. */
export const SITE_URL = configuredSiteUrl();
