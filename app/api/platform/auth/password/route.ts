import { hashPassword, passwordProblem, sha256, verifyPassword } from "@/lib/platform/crypto";
import { apiError, apiJson, auditStatement, authorizeApi, db, nowIso, readInput, seeOther } from "@/lib/platform/auth";

export const dynamic = "force-dynamic";

// A signed-in user changes their own password. Other sessions of that user end.
export async function POST(request: Request) {
  const user = await authorizeApi(request, { mutate: true });
  if (user instanceof Response) return user;
  const input = await readInput(request);
  if (!input) return apiError("The request was not readable.");
  const body = input.data;
  const fail = (message: string, code = "INVALID") => input.form ? seeOther(`/platform/account?error=${encodeURIComponent(message)}`) : apiError(message, 400, code);
  const current = typeof body.current === "string" ? body.current : "";
  const next = typeof body.next === "string" ? body.next : "";
  const row = await db().prepare("SELECT password_hash AS passwordHash FROM platform_users WHERE id = ?").bind(user.id).first<{ passwordHash: string | null }>();
  if (!await verifyPassword(current, row?.passwordHash)) return fail("Your current password is not correct.", "CURRENT");
  const problem = passwordProblem(next, user.email);
  if (body.confirm !== undefined && body.confirm !== next) return fail("The two new passwords do not match.");
  if (problem) return fail(problem);
  const cookie = request.headers.get("cookie") ?? "";
  const token = /(?:^|;\s*)(?:__Host-wp_session|wp_session)=([A-Za-z0-9_-]+)/.exec(cookie)?.[1] ?? "";
  await db().batch([
    db().prepare("UPDATE platform_users SET password_hash = ?, updated_at = ? WHERE id = ?").bind(await hashPassword(next), nowIso(), user.id),
    db().prepare("DELETE FROM platform_sessions WHERE user_id = ? AND token_hash != ?").bind(user.id, await sha256(token)),
    auditStatement(`platform:${user.id}`, "platform.password_changed", "platform_user", user.id),
  ]);
  return input.form ? seeOther("/platform/account?changed=1") : apiJson({ ok: true });
}
