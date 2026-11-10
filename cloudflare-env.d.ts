declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    PLATFORM_SECRET_KEY?: string;
    /** Dedicated key for stored credentials (integration tokens, two-step sign-in secrets). 43 base64url characters. Falls back to PLATFORM_SECRET_KEY. */
    INTEGRATION_SECRET_KEY?: string;
    /** Optional. Enables Claude-assisted CV extraction in the admin screening tool. */
    ANTHROPIC_API_KEY?: string;
    /** Secret for per-company candidate references and CV watermark trace IDs (32+ characters). */
    PORTAL_SECRET?: string;
    /** Transactional email: provider API key and sender address for portal verification and notices. */
    MAIL_API_KEY?: string;
    MAIL_FROM?: string;
    /** Optional override of the ZeptoMail endpoint (for example the India data-centre host). */
    MAIL_API_URL?: string;
    /** "true" opens portal registration in production (after legal sign-off). */
    PORTAL_OPEN?: string;
  }
}
