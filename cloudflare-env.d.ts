declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    PLATFORM_SECRET_KEY?: string;
  }
}
