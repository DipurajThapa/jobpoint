declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    PLATFORM_SECRET_KEY?: string;
    /** Optional. Enables Claude-assisted CV extraction in the admin screening tool. */
    ANTHROPIC_API_KEY?: string;
  }
}
