import { portalDb, json, fail, failFrom, sameOrigin, ipHash, sessionCookie, clearCookie, tokenFrom, NO_STORE } from "@/lib/portal/session";
import { createAccount, endPortalSession, issuePortalToken, redeemToken, signIn } from "@/lib/portal/accounts";
import { createCandidate } from "@/lib/portal/candidate";
import { applyCompany } from "@/lib/portal/company";
import { withinLimits } from "@/lib/portal/access";
import { sendMail } from "@/lib/portal/mailer";
import { audit } from "@/lib/portal/db";

export const dynamic = "force-dynamic";

const str = (v: unknown, max = 200) => typeof v === "string" ? v.trim().slice(0, max) : "";

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  if (!sameOrigin(request)) return fail("Cross-site requests are not accepted.", 403, "ORIGIN");
  const { action } = await context.params;
  const db = portalDb(), ip = await ipHash(request);
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const origin = new URL(request.url).origin;
    if (action === "register") {
      if (!(await withinLimits(db, ip, "register")).ok) return fail("Too many sign-ups from this connection. Try again later.", 429, "RATE_LIMIT");
      const kind = body.kind === "company" ? "company_user" : "candidate";
      if (body.adult !== true && kind === "candidate") return fail("Job Point is for adults aged 18 or over.", 400, "AGE");
      if (body.terms !== true) return fail("Accept the terms to continue.", 400, "TERMS");
      const accountId = await createAccount(db, kind, str(body.email, 254), String(body.password ?? ""), str(body.phone, 20));
      if (kind === "candidate") await createCandidate(db, { accountId, displayName: str(body.name, 120), email: str(body.email, 254), phone: str(body.phone, 20), currentCity: str(body.city, 80) });
      else {
        if (!str(body.companyName) || !str(body.legalName)) return fail("Enter the company's name and registered legal name.", 400, "COMPANY");
        await applyCompany(db, { accountId, displayName: str(body.companyName, 120), legalName: str(body.legalName, 160), city: str(body.city, 80), website: str(body.website), gstin: str(body.gstin, 15) });
      }
      const token = await issuePortalToken(db, accountId, "verify", 48);
      const link = `${origin}/portal/verify?token=${token}`;
      const mail = await sendMail({ to: str(body.email, 254), subject: "Verify your Job Point account", text: `Open this link to verify your email address (valid for 48 hours):\n${link}\n\nIf you did not create this account, ignore this email.` }, link);
      await audit(db, accountId, "portal.registered", kind, accountId);
      return json({ message: mail.sent ? "Check your email for a verification link." : mail.reason, devLink: mail.devLink }, 201);
    }
    if (action === "verify") { await redeemToken(db, str(body.token, 120), "verify"); return json({ message: "Email verified. You can sign in now." }); }
    if (action === "sign-in") {
      if (!(await withinLimits(db, ip, "auth")).ok) return fail("Too many sign-in attempts. Wait 15 minutes.", 429, "RATE_LIMIT");
      const token = await signIn(db, str(body.email, 254), String(body.password ?? ""), request.headers.get("user-agent") ?? "");
      const { accountFromToken } = await import("@/lib/portal/accounts");
      const account = await accountFromToken(db, token);
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
        devLink = (await sendMail({ to: str(body.email, 254), subject: "Reset your Job Point password", text: `Open this link to choose a new password (valid for 2 hours):\n${link}` }, link)).devLink;
      }
      return json({ message: "If an account exists for that email, a reset link has been sent.", devLink });
    }
    if (action === "reset") { await redeemToken(db, str(body.token, 120), "reset", String(body.password ?? "")); return json({ message: "Password changed. Sign in with your new password." }); }
    return fail("Unknown action.", 404);
  } catch (error) { return failFrom(error); }
}
