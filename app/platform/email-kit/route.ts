import page from "virtual:email-kit/page";
import { NO_STORE, audit, requestUser, signInPath, toolEnabled } from "@/lib/platform/auth";
import { randomToken } from "@/lib/platform/crypto";
import { LEVEL_LABEL } from "@/lib/platform/tools";
import { TOOL } from "@/lib/email-kit/server";

export const dynamic = "force-dynamic";

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function csp(nonce: string) {
  return [
    "default-src 'none'", `script-src 'nonce-${nonce}'`, "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com", "img-src 'self' data: blob:", "connect-src 'self'", "base-uri 'none'",
    "form-action 'self'", "frame-ancestors 'none'",
  ].join("; ");
}

const htmlHeaders = (nonce?: string) => ({
  ...NO_STORE, "content-type": "text/html; charset=utf-8", "x-frame-options": "DENY", "referrer-policy": "same-origin",
  "x-robots-tag": "noindex, nofollow", ...(nonce ? { "content-security-policy": csp(nonce) } : { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" }),
});

const denied = (title: string, text: string, status: number) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} | Working Platform</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f7fb;font:16px/1.55 'Segoe UI',Arial,sans-serif;color:#0A1F5C;padding:16px}main{max-width:480px;background:#fff;border:1px solid #DEE3E8;border-radius:14px;padding:28px}a{display:inline-block;margin-top:8px;color:#fff;background:#1D4ED8;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:700}</style></head>
<body><main><h1>${title}</h1><p>${text}</p><a href="/platform">Back to Working Platform</a></main></body></html>`, { status, headers: htmlHeaders() });

// Serves Email Kit only to signed-in people with Email Kit access. The page holds
// no client records; it loads them from the permission-checked Email Kit API.
export async function GET(request: Request) {
  const user = await requestUser(request).catch(() => null);
  if (!user) return new Response(null, { status: 307, headers: { ...NO_STORE, location: signInPath("/platform/email-kit") } });
  const level = user.access[TOOL];
  if (!level) return denied("No access to Email Kit", "Your account does not include Email Kit. Ask an administrator if you need it.", 403);
  if (!await toolEnabled(TOOL)) return denied("Email Kit is unavailable", "An administrator has disabled this tool.", 403);
  await audit(`platform:${user.id}`, "platform.tool_opened.email_kit", "tool", TOOL);

  const nonce = randomToken(18);
  const name = user.name || user.email;
  const session = JSON.stringify({ access: level, user: { id: user.id, name } }).replace(/</g, "\\u003c");
  const bar = `<header class="ek-bar" role="banner"><a href="/platform" aria-label="Back to Working Platform dashboard">&larr; Working Platform</a><span class="ek-title">Email Kit</span><span class="ek-level">${LEVEL_LABEL[level]} access</span><span class="ek-who">${escape(name)}</span><form method="post" action="/api/platform/auth/sign-out"><button type="submit">Sign out</button></form></header>
${level === "view" ? `<p class="ek-readonly" role="note">You have view-only access. You can read records and drafts; an administrator can give you Edit access.</p>` : ""}
<p class="ek-lost" role="alert"><span id="ekLostText">Your session has ended.</span> <a href="${signInPath("/platform/email-kit")}">Sign in again</a></p>
<script>window.EMAIL_KIT_SESSION = ${session};</script>`;

  const html = page
    .replace("<body>", `<body data-access="${level}">`)
    .replace("<!--__PLATFORM_BAR__-->", () => bar)
    .replaceAll("<script", `<script nonce="${nonce}"`);
  return new Response(html, { status: 200, headers: htmlHeaders(nonce) });
}
