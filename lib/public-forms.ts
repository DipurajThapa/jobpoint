// What happens after someone sends a public form: the acknowledgement by
// email (and by WhatsApp only when they ticked that box), and the times an
// employer can ask for a call with a consultant.
//
// Email goes through the transactional mailer and is sent only when it is
// configured (MAIL_API_KEY, MAIL_FROM). WhatsApp has no provider connected
// yet: with consent the message is queued, exactly as candidate updates are.
import { sendMail } from "./portal/mailer";
import { SITE_URL } from "./site";

export type AckStatus = "sent" | "not_configured" | "failed";
export type WhatsappStatus = "queued" | "no_consent" | "not_configured";

// ---------------------------------------------------------------- call slots

/** Calls are offered Monday to Saturday, 10:00 to 18:00 India time (not 13:00 to 14:00), in 30-minute slots, from the next day, two weeks ahead. */
export const CALL = { minutes: 30, firstHour: 10, lastHour: 18, lunchHour: 13, days: 14 } as const;
const IST_OFFSET_MS = 5.5 * 3_600_000;

/** Every slot that may be asked for, as UTC instants (ISO strings), earliest first. */
export function callSlots(now = new Date()): string[] {
  const out: string[] = [];
  // Work in India time by shifting the clock, then shift back.
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  // From tomorrow, so that a consultant always has notice of a call.
  for (let d = 1; d <= CALL.days; d++) {
    const day = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + d));
    if (day.getUTCDay() === 0) continue; // Sunday
    for (let m = CALL.firstHour * 60; m < CALL.lastHour * 60; m += CALL.minutes) {
      if (Math.floor(m / 60) === CALL.lunchHour) continue;
      out.push(new Date(day.getTime() + m * 60_000 - IST_OFFSET_MS).toISOString());
    }
  }
  return out;
}

/** "Thursday 12 November 2026, 11:00 am India time" */
export const callTimeText = (iso: string) => `${new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" })} India time`;

// ---------------------------------------------------------------- acknowledgements

async function email(to: string, subject: string, text: string): Promise<AckStatus> {
  try { const r = await sendMail({ to, subject, text }); return r.sent ? "sent" : r.reason?.includes("not configured") ? "not_configured" : "failed"; }
  catch { return "failed"; }
}

const SIGN_OFF = `Jobboard300\n${SITE_URL}`;

export function applicationAckText(input: { name: string; reference: string; roleTitle: string | null; whatsapp: boolean; share?: boolean; future?: boolean }) {
  const subject = input.roleTitle ? `We have your application for ${input.roleTitle}` : "We have your CV";
  const text = [
    `Dear ${input.name},`,
    input.roleTitle ? `Thank you for applying for ${input.roleTitle}. Your CV is with Jobboard300.` : "Thank you for registering your CV with Jobboard300.",
    `Your reference is ${input.reference}. Please quote it if you write to us.`,
    `What happens next:\n- A recruiter reviews your CV against the roles we are filling.\n- We contact you when a role fits.${input.share ? "" : " We will ask you before your CV goes to an employer."}`,
    `Your choices on the form:\n- Share my CV with ${input.roleTitle ? "the employer for this role" : "an employer for a role that suits me"}: ${input.share ? "yes" : "no"}\n- Keep my CV and contact me about other roles: ${input.future ? "yes" : "no"}\n- WhatsApp updates: ${input.whatsapp ? "yes" : "no"}`,
    `Registering and applying are free. To correct your details, replace your CV, or withdraw your consent, use the request form at ${SITE_URL}/privacy#privacy-request.`,
    SIGN_OFF,
  ].join("\n\n");
  const whatsapp = `Jobboard300: we have your ${input.roleTitle ? `application for ${input.roleTitle}` : "CV"}. Reference ${input.reference}. A recruiter will review it and contact you when a role fits. To stop WhatsApp updates, use the request form at ${SITE_URL}/privacy#privacy-request`;
  return { subject, text, whatsapp };
}

export function enquiryAckText(input: { name: string; company: string; reference: string; meetingAt: string | null; whatsapp: boolean }) {
  const subject = input.meetingAt ? "Your hiring enquiry and call request" : "We have your hiring enquiry";
  const text = [
    `Dear ${input.name},`,
    `Thank you for your enquiry on behalf of ${input.company}. Your reference is ${input.reference}.`,
    input.meetingAt
      ? `You asked for a call on ${callTimeText(input.meetingAt)}. A Jobboard300 consultant will confirm this time, or offer another, by email.`
      : `A Jobboard300 consultant will contact you within one working day to arrange a call.`,
    "On the call we go through the role, the salary range, the location and your timeline. If we are a fit, we then agree the terms in a recruitment services agreement before we start. Nothing is charged for the enquiry, the call or a shortlist: the fee applies only when a person you choose joins.",
    `Our terms for employers: ${SITE_URL}/terms/employers`,
    SIGN_OFF,
  ].join("\n\n");
  const whatsapp = `Jobboard300: we have your hiring enquiry for ${input.company}. Reference ${input.reference}. ${input.meetingAt ? `Call requested for ${callTimeText(input.meetingAt)}; a consultant will confirm.` : "A consultant will contact you within one working day."} To stop WhatsApp messages, reply to our email.`;
  return { subject, text, whatsapp };
}

export const sendApplicationAck = (to: string, input: Parameters<typeof applicationAckText>[0]) => { const m = applicationAckText(input); return email(to, m.subject, m.text); };
export const sendEnquiryAck = (to: string, input: Parameters<typeof enquiryAckText>[0]) => { const m = enquiryAckText(input); return email(to, m.subject, m.text); };

/** The short confirmation shown on the page after a form is sent. It never claims a message that was not sent. */
export function confirmation(kind: "application" | "enquiry", input: { email: string; reference: string; emailed: AckStatus; meetingAt?: string | null }) {
  const sent = input.emailed === "sent";
  const title = kind === "application" ? "Thank you. Your CV is with us." : "Thank you. Your enquiry is with us.";
  // The reference always stays on the page: an email handed to the mail service may still not arrive.
  const lines = [
    `Your reference is ${input.reference}.`,
    ...(sent ? [`We have sent the details to ${input.email}. Check your spam folder if you do not see it.`] : []),
    kind === "application" ? "A recruiter will review your CV and contact you when a role fits."
      : input.meetingAt ? `You asked for a call on ${callTimeText(input.meetingAt)}. A consultant will confirm the time.` : "A consultant will contact you within one working day to arrange a call.",
  ];
  return { title, message: lines.join(" ") };
}
