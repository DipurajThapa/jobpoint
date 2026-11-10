import type { NextConfig } from "next";

// Content security policy. The browser may load code, styles, fonts and images
// only from this site (plus Google Fonts for the typeface and icons), and may
// send data only back to this site. A script injected into a page therefore
// has nowhere to send what it reads, and no other site can frame, embed or
// post into these pages.
// Inline scripts stay allowed because the framework writes its page data
// inline; everything that policy can do without a per-request nonce is on.
const dev = process.env.NODE_ENV === "development";
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "media-src 'self'",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
      { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
    ];
    // "/:path*" does not cover the home page on every host, so it is listed on its own as well.
    return [{ source: "/", headers }, { source: "/:path*", headers }];
  },
};

export default nextConfig;
