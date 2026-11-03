import { verifyPassword } from "@/lib/platform/crypto";
import { apiError, apiJson, audit, clientKey, createSession, db, readInput, safePlatformPath, sameOriginRequest, seeOther, sessionCookie, withinLimit } from "@/lib/platform/auth";

export const dynamic = "force-dynamic";
const GENERIC = "Email or password is incorrect.";

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return apiError("This request must come from the Working Platform.", 403);
  const input = await readInput(request);
  const next = safePlatformPath(input?.data.next);
  const fail = (message: string, status: number, code: string) => input?.form
    ? seeOther(`/platform/sign-in?error=${code}&next=${encodeURIComponent(next)}`)
    : apiError(message, status, code);
  const email = typeof input?.data.email === "string" ? input.data.email.trim().toLowerCase().slice(0, 254) : "";
  const password = typeof input?.data.password === "string" ? input.data.password.slice(0, 200) : "";
  if (!email || !password) return fail("Enter your email and password.", 400, "MISSING");
  try {
    const ip = await clientKey(request);
    const [byIp, byEmail] = await Promise.all([withinLimit(`wp-signin-ip:${ip}`, 900, 10), withinLimit(`wp-signin-email:${email}`, 900, 20)]);
    if (!byIp || !byEmail) return fail("Too many sign-in attempts. Wait 15 minutes, then try again.", 429, "RATE_LIMIT");
    const user = await db().prepare("SELECT id, status, password_hash AS passwordHash FROM platform_users WHERE email = ?").bind(email).first<{ id: string; status: string; passwordHash: string | null }>();
    const valid = await verifyPassword(password, user?.passwordHash);
    if (!user || !valid || user.status !== "active") {
      if (user) await audit(`platform:${user.id}`, "platform.sign_in_failed", "platform_user", user.id);
      return fail(GENERIC, 401, "INVALID");
    }
    const token = await createSession(user.id, request.headers.get("user-agent") ?? "");
    await audit(`platform:${user.id}`, "platform.sign_in", "platform_user", user.id);
    const cookie = sessionCookie(request.url, token);
    return input?.form ? seeOther(next, [cookie]) : apiJson({ ok: true }, 200, { "set-cookie": cookie });
  } catch {
    return fail("Sign-in is temporarily unavailable.", 503, "UNAVAILABLE");
  }
}
