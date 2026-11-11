// Transactional email (acknowledgements, sign-in links, hiring updates).
//
// Providers, chosen with MAIL_PROVIDER:
// - "brevo" (recommended for the pilot): free plan, 300 emails a day, and a single verified sender address is
//   enough to start (no domain needed). API: https://developers.brevo.com/reference/sendtransacemail
// - "resend": free plan, 3,000 a month (100 a day); needs a verified domain to send to anyone but yourself.
// - "zeptomail" (the default when MAIL_PROVIDER is not set, for compatibility): paid credits.
//
// Every attempt is written to `email_log` with the address masked (r***@example.com), the outcome and the
// provider's reason, so the owner console shows what was delivered and what failed.
//
// Without a configured key: local development returns the link to the caller to show on screen; production
// reports that email is unavailable so the admin can issue the link from the console instead.

import { env } from "cloudflare:workers";

export type Mail = { to: string; subject: string; text: string; html?: string; kind?: string };
export type SendResult = { sent: boolean; devLink?: string; reason?: string };
export type Provider = "brevo" | "resend" | "zeptomail";

const escapeHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const htmlOf = (mail: Mail) => mail.html ?? `<p>${escapeHtml(mail.text).replace(/\n/g, "<br>")}</p>`;

/** "riya.sen@example.com" → "r***@example.com". The log never holds a full address. */
export const maskEmail = (email: string) => { const [user, domain] = email.split("@"); return domain ? `${(user ?? "").slice(0, 1)}***@${domain}` : "***"; };

export function mailProvider(): Provider {
  const p = String(env.MAIL_PROVIDER ?? "").toLowerCase();
  return p === "brevo" || p === "resend" ? p : "zeptomail";
}

export const mailConfigured = () => !!(env.MAIL_API_KEY && env.MAIL_FROM);

function request(provider: Provider, key: string, from: string, mail: Mail): [string, RequestInit] {
  if (provider === "brevo") return ["https://api.brevo.com/v3/smtp/email", {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json", "api-key": key },
    body: JSON.stringify({ sender: { name: "Jobboard300", email: from }, to: [{ email: mail.to }], subject: mail.subject, textContent: mail.text, htmlContent: htmlOf(mail) }),
  }];
  if (provider === "resend") return ["https://api.resend.com/emails", {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: `Jobboard300 <${from}>`, to: [mail.to], subject: mail.subject, text: mail.text, html: htmlOf(mail) }),
  }];
  return [env.MAIL_API_URL ?? "https://api.zeptomail.com/v1.1/email", {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json", authorization: `Zoho-enczapikey ${key}` },
    body: JSON.stringify({ from: { address: from, name: "Jobboard300" }, to: [{ email_address: { address: mail.to } }], subject: mail.subject, textbody: mail.text, htmlbody: htmlOf(mail) }),
  }];
}

async function log(mail: Mail, provider: string, status: "sent" | "failed" | "not_configured", detail: string) {
  try {
    await env.DB?.prepare("INSERT INTO email_log (id, kind, recipient, subject, provider, status, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), (mail.kind ?? "").slice(0, 60), maskEmail(mail.to), mail.subject.slice(0, 160), provider, status, detail.slice(0, 300), new Date().toISOString()).run();
  } catch { /* the log must never stop an email or a request */ }
}

export async function sendMail(mail: Mail, link?: string): Promise<SendResult> {
  const key = env.MAIL_API_KEY, from = env.MAIL_FROM, provider = mailProvider();
  if (!key || !from) {
    await log(mail, provider, "not_configured", "MAIL_API_KEY or MAIL_FROM is not set");
    // Fail closed: a one-time link is shown on screen only in an explicit development or test run.
    if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") return { sent: false, devLink: link, reason: "Email is not configured; showing the link because this is local development." };
    return { sent: false, reason: "Email delivery is not configured yet. Ask Jobboard300 to send your link." };
  }
  try {
    const [url, init] = request(provider, key, from, mail);
    const response = await fetch(url, init);
    if (!response.ok) {
      const body = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
      await log(mail, provider, "failed", `HTTP ${response.status} ${body}`);
      return { sent: false, reason: `The email service returned ${response.status}.` };
    }
    await log(mail, provider, "sent", `HTTP ${response.status}`);
    return { sent: true };
  } catch (error) {
    await log(mail, provider, "failed", String((error as Error)?.message ?? error));
    return { sent: false, reason: "The email service could not be reached." };
  }
}
