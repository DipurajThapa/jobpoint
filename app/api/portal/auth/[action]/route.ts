import { portalDb, json, fail, failFrom, sameOrigin, ipHash, sessionCookie, clearCookie, tokenFrom, NO_STORE } from "@/lib/portal/session";
import { endPortalSession, issuePortalToken, redeemToken, signIn } from "@/lib/portal/accounts";
import { mergeVerifiedDuplicates } from "@/lib/portal/website";
import { withinLimits } from "@/lib/portal/access";
import { sendMail } from "@/lib/portal/mailer";

export const dynamic = "force-dynamic";

const str = (v: unknown, max = 200) => typeof v === "string" ? v.trim().slice(0, max) : "";

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  if (!sameOrigin(request)) return fail("Cross-site requests are not accepted.", 403, "ORIGIN");
  const { action } = await context.params;
  const db = portalDb(), ip = await ipHash(request);
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const origin = new URL(request.url).origin;
    if (action === "register") return fail("Use the registration pop-up to create your account with your CV or hiring enquiry.", 410, "USE_REGISTRATION_FORM");
    if (action === "resend-verification") {
      if (!(await withinLimits(db, ip, "auth")).ok) return fail("Too many requests. Try again later.", 429, "RATE_LIMIT");
      const email = str(body.email, 254).toLowerCase();
      const row = await db.prepare("SELECT id FROM portal_accounts WHERE email = ? AND status = 'pending'").bind(email).first<{ id: string }>();
      const { mailConfigured } = await import("@/lib/portal/mailer");
      if (!mailConfigured()) return fail("Verification email delivery is unavailable. Please contact Jobboard300 or try again later. Your registration remains saved.", 503, "MAIL_UNAVAILABLE");
      if (row) {
        const token = await issuePortalToken(db, row.id, "verify", 48);
        const link = `${origin}/portal/verify?token=${token}`;
        await sendMail({ to: email, subject: "Verify your Jobboard300 account", text: `Verify your email (valid for 48 hours):\n${link}\nIf you did not request this, ignore this email.` }, link);
      }
      return json({ message: "If this email has an account awaiting verification, a verification email has been requested. Check your inbox and spam folder. If it does not arrive, contact Jobboard300." });
    }
    if (action === "verify") {
      const id = await redeemToken(db, str(body.token, 120), "verify");
      await mergeVerifiedDuplicates(db, id);
      const account = await db.prepare("SELECT kind FROM portal_accounts WHERE id = ?").bind(id).first<{ kind: string }>();
      return json({ message: "Email verified. You can sign in now.", next: `/portal/sign-in?kind=${account?.kind === "company_user" ? "company" : "candidate"}` });
    }
    if (action === "sign-in") {
      if (!(await withinLimits(db, ip, "auth")).ok) return fail("Too many sign-in attempts. Wait 15 minutes.", 429, "RATE_LIMIT");
      const token = await signIn(db, str(body.email, 254), String(body.password ?? ""), request.headers.get("user-agent") ?? "");
      const { accountFromToken } = await import("@/lib/portal/accounts");
      const account = await accountFromToken(db, token);
      // One person record: website applications made with this verified email join the account (also covers records from before this existed).
      if (account?.kind === "candidate") await mergeVerifiedDuplicates(db, account.id);
      return new Response(JSON.stringify({ kind: account?.kind, next: account?.kind === "company_user" ? "/company" : "/candidate" }), { status: 200, headers: { ...NO_STORE, "content-type": "application/json", "set-cookie": sessionCookie(request.url, token) } });
    }
    if (action === "sign-out") {
      await endPortalSession(db, tokenFrom(request));
      return new Response(JSON.stringify({ message: "Signed out." }), { status: 200, headers: { ...NO_STORE, "content-type": "application/json", "set-cookie": clearCookie(request.url) } });
    }
    if (action === "reset-request") {
      if (!(await withinLimits(db, ip, "auth")).ok) return fail("Too many requests. Wait 15 minutes.", 429, "RATE_LIMIT");
      const row = await db.prepare("SELECT id FROM portal_accounts WHERE email = ? AND status IN ('active','pending')").bind(str(body.email, 254).toLowerCase()).first<{ id: string }>();
      let devLink: string | undefined;
      if (row) {
        const token = await issuePortalToken(db, row.id, "reset", 2);
        const link = `${origin}/portal/reset?token=${token}`;
        devLink = (await sendMail({ to: str(body.email, 254), subject: "Reset your Jobboard300 password", text: `Open this link to choose a new password (valid for 2 hours):\n${link}` }, link)).devLink;
      }
      return json({ message: "If an account exists for that email, a reset link has been sent.", devLink });
    }
    if (action === "reset") { await redeemToken(db, str(body.token, 120), "reset", String(body.password ?? "")); return json({ message: "Password changed. Sign in with your new password." }); }
    if (action === "accept") {
      if (!(await withinLimits(db, ip, "auth")).ok) return fail("Too many requests. Wait 15 minutes.", 429, "RATE_LIMIT");
      await redeemToken(db, str(body.token, 120), "invite", String(body.password ?? ""));
      return json({ message: "Your password is set. Sign in to open your hiring dashboard." });
    }
    return fail("Unknown action.", 404);
  } catch (error) { return failFrom(error); }
}
