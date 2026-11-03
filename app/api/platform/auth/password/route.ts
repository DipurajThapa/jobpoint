import { hashPassword, passwordProblem, sha256, verifyPassword } from "@/lib/platform/crypto";
import { apiError, apiJson, auditStatement, authorizeApi, db, nowIso } from "@/lib/platform/auth";

export const dynamic = "force-dynamic";

// A signed-in user changes their own password. Other sessions of that user end.
export async function POST(request: Request) {
  const user = await authorizeApi(request, { mutate: true });
  if (user instanceof Response) return user;
  let body: { current?: unknown; next?: unknown };
  try { body = await request.json(); } catch { return apiError("The request was not readable."); }
  const current = typeof body.current === "string" ? body.current : "";
  const next = typeof body.next === "string" ? body.next : "";
  const row = await db().prepare("SELECT password_hash AS passwordHash FROM platform_users WHERE id = ?").bind(user.id).first<{ passwordHash: string | null }>();
  if (!await verifyPassword(current, row?.passwordHash)) return apiError("Your current password is not correct.", 400, "CURRENT");
  const problem = passwordProblem(next, user.email);
  if (problem) return apiError(problem);
  const cookie = request.headers.get("cookie") ?? "";
  const token = /(?:^|;\s*)(?:__Host-wp_session|wp_session)=([A-Za-z0-9_-]+)/.exec(cookie)?.[1] ?? "";
  await db().batch([
    db().prepare("UPDATE platform_users SET password_hash = ?, updated_at = ? WHERE id = ?").bind(await hashPassword(next), nowIso(), user.id),
    db().prepare("DELETE FROM platform_sessions WHERE user_id = ? AND token_hash != ?").bind(user.id, await sha256(token)),
    auditStatement(`platform:${user.id}`, "platform.password_changed", "platform_user", user.id),
  ]);
  return apiJson({ ok: true });
}
