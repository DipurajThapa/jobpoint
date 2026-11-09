// Transactional email for the portal (verification, password reset, notices).
// Provider: Zoho ZeptoMail (INR billing with GST invoice; chosen in research).
// Endpoint and auth header follow ZeptoMail's API docs
// (https://www.zoho.com/zeptomail/help/api/email-sending.html). The JSON body
// shape below is UNVERIFIED against a live send: confirm with one test email
// when MAIL_API_KEY is configured. India-region accounts may need
// MAIL_API_URL=https://api.zeptomail.in/v1.1/email.
//
// Without a configured key: local development returns the link to the caller
// to show on screen; production reports that email is unavailable so the admin
// can issue the link from the console instead.

import { env } from "cloudflare:workers";

export type Mail = { to: string; subject: string; text: string; html?: string };
export type SendResult = { sent: boolean; devLink?: string; reason?: string };

export async function sendMail(mail: Mail, link?: string): Promise<SendResult> {
  const key = env.MAIL_API_KEY, from = env.MAIL_FROM;
  if (!key || !from) {
    if (process.env.NODE_ENV !== "production") return { sent: false, devLink: link, reason: "Email is not configured; showing the link because this is local development." };
    return { sent: false, reason: "Email delivery is not configured yet. Ask Jobboard300 to send your link." };
  }
  const url = env.MAIL_API_URL ?? "https://api.zeptomail.com/v1.1/email";
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", authorization: `Zoho-enczapikey ${key}` },
    body: JSON.stringify({
      from: { address: from, name: "Jobboard300" },
      to: [{ email_address: { address: mail.to } }],
      subject: mail.subject,
      textbody: mail.text,
      htmlbody: mail.html ?? `<p>${mail.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`,
    }),
  });
  if (!response.ok) return { sent: false, reason: `The email service returned ${response.status}.` };
  return { sent: true };
}
