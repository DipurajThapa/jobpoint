import { readLimitedForm, limitContact } from "@/lib/intake-security";
import { limitSubmission } from "@/lib/http";
import { env } from "cloudflare:workers";
import { DEMO_MODE, demoSubmissionResponse } from "@/lib/demo";
import { registerPublic } from "@/lib/portal/registration";
import { portalDb, sameOrigin, ipHash, json, fail, failFrom } from "@/lib/portal/session";
import { withinLimits } from "@/lib/portal/access";
import { PortalError } from "@/lib/portal/db";
import { issuePortalToken } from "@/lib/portal/accounts";
import { sendMail } from "@/lib/portal/mailer";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (DEMO_MODE) return demoSubmissionResponse();
  if (!sameOrigin(request)) return fail("Cross-site requests are not accepted.", 403);
  if (Number(request.headers.get("content-length") ?? 0) > 5 * 1024 * 1024 + 40_000) return fail("The upload exceeds the 5 MB limit.", 413);
  try {
    const db = portalDb(), ip = await ipHash(request);
    if (!(await withinLimits(db, ip, "register")).ok) return fail("Too many registrations. Please try again later.", 429);
    if (!await limitSubmission(request, "registration")) return fail("Too many submissions. Please try again later.", 429);
    const form = await readLimitedForm(request, 5 * 1024 * 1024 + 40000);
    if (form.get("website")) return json({ title: "Thank you", message: "Your request has been received." }, 201);
    await limitContact(db, String(form.get("email") ?? "").slice(0, 254), String(form.get("phone") ?? "").slice(0, 30));
    let result;
    try { result = await registerPublic(db, env.BUCKET ?? null, form, ip); }
    catch (error) {
      if (!(error instanceof PortalError) || error.code !== "ACCOUNT_EXISTS") throw error;
      const email = String(form.get("email") ?? "").trim().toLowerCase();
      // Same public reply for new/existing emails; do not overwrite profiles or disclose membership.
      const existing = await db.prepare("SELECT id, status FROM portal_accounts WHERE email = ?").bind(email).first<{ id: string; status: string }>();
      result = { accountId: existing?.status === "pending" ? existing.id : null, kind: String(form.get("kind")), email, reference: "" };
    }
    let sent = false, devLink: string | undefined;
    try {
      if (!result.accountId) {
        const mail = await sendMail({ to: result.email, subject: "Your Jobboard300 account", text: `If you requested registration, you already have an account. Sign in or recover access: ${new URL(request.url).origin}/portal/forgot. Your saved details have not changed.` });
        sent = mail.sent;
      } else {
      const token = await issuePortalToken(db, result.accountId, "verify", 48);
      const link = `${new URL(request.url).origin}/portal/verify?token=${token}`;
      const mail = await sendMail({ to: result.email, subject: "Verify your Jobboard300 account", text: `Verify your email to access your ${result.kind === "company" ? "business" : "candidate"} dashboard (link valid for 48 hours):\n${link}\n\nReference: ${result.reference}\nIf you did not register, ignore this email.` }, link);
      sent = mail.sent; devLink = mail.devLink;
      }
    } catch { /* The committed account remains recoverable through resend/reset. */ }
    return json({ title: "Your registration request", emailed: sent, devLink, message: `For a new email address, your ${result.kind === "company" ? "business account and hiring enquiry" : "candidate account, CV and consent preferences"} are saved together. If you have registered before, your existing details stay unchanged: sign in or recover account access. ${sent ? "Check your email for the next step. New accounts need email verification before sign-in." : "We could not send an account email. New accounts remain pending verification. Use ‘Resend verification email’ on the sign-in page to try again; if it remains unavailable, contact Jobboard300."}` }, 201);
  } catch (error) { return failFrom(error); }
}
