// Two-step sign-in settings for the signed-in staff member, and an
// administrator's reset for someone who lost their phone.
import { verifyPassword } from "@/lib/platform/crypto";
import { apiError, apiJson, audit, authorizeApi, clientKey, db, readInput, withinLimit } from "@/lib/platform/auth";
import { beginSetup, confirmSetup, checkSecondStep, turnOff, twoFactorOn } from "@/lib/platform/two-factor";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await authorizeApi(request);
  if (user instanceof Response) return user;
  return apiJson({ on: await twoFactorOn(user.id) });
}

export async function POST(request: Request) {
  const user = await authorizeApi(request, { mutate: true });
  if (user instanceof Response) return user;
  const input = await readInput(request);
  if (!input) return apiError("The request was not readable.");
  const body = input.data, text = (v: unknown, max = 200) => typeof v === "string" ? v.slice(0, max) : "";
  if (!await withinLimit(`wp-2fa:${user.id}:${await clientKey(request)}`, 900, 15)) return apiError("Too many attempts. Wait 15 minutes, then try again.", 429, "RATE_LIMIT");
  const passwordOk = async () => verifyPassword(text(body.password), (await db().prepare("SELECT password_hash AS h FROM platform_users WHERE id = ?").bind(user.id).first<{ h: string | null }>())?.h);
  try {
    if (body.action === "setup") {
      if (!await passwordOk()) return apiError("Enter your current password to set up two-step sign-in.", 403, "PASSWORD");
      const out = await beginSetup(user.id);
      await audit(`platform:${user.id}`, "platform.two_factor_setup_started", "platform_user", user.id);
      return apiJson(out);
    }
    if (body.action === "enable") {
      const codes = await confirmSetup(user.id, text(body.code, 20));
      if (!codes) return apiError("That code is not right. Check the time on your phone and try the next code.", 400, "CODE");
      await audit(`platform:${user.id}`, "platform.two_factor_enabled", "platform_user", user.id);
      return apiJson({ on: true, recoveryCodes: codes });
    }
    if (body.action === "disable") {
      if (!await passwordOk() || !await checkSecondStep(user.id, text(body.code, 20))) return apiError("Enter your password and a current code to turn two-step sign-in off.", 403, "CONFIRM");
      await turnOff(user.id);
      await audit(`platform:${user.id}`, "platform.two_factor_disabled", "platform_user", user.id);
      return apiJson({ on: false });
    }
    if (body.action === "reset") {
      // An administrator clears it for a colleague who lost their phone. Not for themselves: that needs the code or a recovery code.
      if (user.role !== "admin") return apiError("Only an administrator can do this.", 403, "ADMIN_ONLY");
      const target = text(body.userId, 60);
      if (!target || target === user.id) return apiError("Choose another person's account.", 400);
      if (!await db().prepare("SELECT id FROM platform_users WHERE id = ?").bind(target).first()) return apiError("That person was not found.", 404);
      await turnOff(target);
      await audit(`platform:${user.id}`, "platform.two_factor_reset", "platform_user", target);
      return apiJson({ ok: true });
    }
    return apiError("Unknown action.", 400);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Two-step sign-in is unavailable.", 400);
  }
}
