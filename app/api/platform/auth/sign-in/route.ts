import { verifyPassword } from "@/lib/platform/crypto";
import { apiError, apiJson, audit, clientKey, createSession, db, sameOriginRequest, sessionCookie, withinLimit } from "@/lib/platform/auth";

export const dynamic = "force-dynamic";
const GENERIC = "Email or password is incorrect.";

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return apiError("This request must come from the Working Platform.", 403);
  let body: { email?: unknown; password?: unknown };
  try { body = await request.json(); } catch { return apiError("Enter your email and password."); }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
  const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
  if (!email || !password) return apiError("Enter your email and password.");
  try {
    const ip = await clientKey(request);
    const [byIp, byEmail] = await Promise.all([withinLimit(`wp-signin-ip:${ip}`, 900, 10), withinLimit(`wp-signin-email:${email}`, 900, 20)]);
    if (!byIp || !byEmail) return apiError("Too many sign-in attempts. Wait 15 minutes, then try again.", 429, "RATE_LIMIT");
    const user = await db().prepare("SELECT id, status, password_hash AS passwordHash FROM platform_users WHERE email = ?").bind(email).first<{ id: string; status: string; passwordHash: string | null }>();
    const valid = await verifyPassword(password, user?.passwordHash);
    if (!user || !valid || user.status !== "active") {
      if (user) await audit(`platform:${user.id}`, "platform.sign_in_failed", "platform_user", user.id);
      return apiError(GENERIC, 401, "INVALID");
    }
    const token = await createSession(user.id, request.headers.get("user-agent") ?? "");
    await audit(`platform:${user.id}`, "platform.sign_in", "platform_user", user.id);
    return apiJson({ ok: true }, 200, { "set-cookie": sessionCookie(request.url, token) });
  } catch {
    return apiError("Sign-in is temporarily unavailable.", 503);
  }
}
