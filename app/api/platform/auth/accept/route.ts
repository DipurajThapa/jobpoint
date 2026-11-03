import { hashPassword, passwordProblem } from "@/lib/platform/crypto";
import { apiError, apiJson, auditStatement, clientKey, createSession, db, findToken, nowIso, readInput, sameOriginRequest, seeOther, sessionCookie, withinLimit } from "@/lib/platform/auth";

export const dynamic = "force-dynamic";

// Redeems a one-time invitation or password-reset link.
export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return apiError("This request must come from the Working Platform.", 403);
  const input = await readInput(request);
  if (!input) return apiError("The request was not readable.");
  const body = input.data;
  const purposeHint = body.purpose === "reset" ? "reset" : "accept";
  const fail = (message: string, status = 400, code = "INVALID") => input.form
    ? seeOther(`/platform/${purposeHint}?token=${encodeURIComponent(String(body.token ?? ""))}&error=${encodeURIComponent(message)}`)
    : apiError(message, status, code);
  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ").slice(0, 120) : "";
  try {
    if (!await withinLimit(`wp-token:${await clientKey(request)}`, 900, 20)) return fail("Too many attempts. Wait 15 minutes, then try again.", 429);
    const row = await findToken(token);
    if (!row) return fail("This link has expired or was already used. Ask an administrator for a new link.", 410, "LINK_INVALID");
    if (row.purpose === "invite" && !name) return fail("Enter your name.");
    const problem = passwordProblem(password, row.email);
    if (body.confirm !== undefined && body.confirm !== password) return fail("The two passwords do not match.");
    if (problem) return fail(problem);
    const now = nowIso();
    const hash = await hashPassword(password);
    // The token is consumed in the same transaction; a second use matches no row.
    const results = await db().batch([
      db().prepare("UPDATE platform_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL").bind(now, row.tokenHash),
      db().prepare(`UPDATE platform_users SET password_hash = ?, status = 'active', updated_at = ?${row.purpose === "invite" ? ", name = ?" : ""}
          WHERE id = ? AND status != 'disabled' AND EXISTS (SELECT 1 FROM platform_tokens WHERE token_hash = ? AND used_at = ?)`)
        .bind(...(row.purpose === "invite" ? [hash, now, name, row.userId, row.tokenHash, now] : [hash, now, row.userId, row.tokenHash, now])),
      db().prepare("DELETE FROM platform_sessions WHERE user_id = ? AND EXISTS (SELECT 1 FROM platform_tokens WHERE token_hash = ? AND used_at = ?)").bind(row.userId, row.tokenHash, now),
      auditStatement(`platform:${row.userId}`, row.purpose === "invite" ? "platform.invite_accepted" : "platform.password_reset", "platform_user", row.userId),
    ]);
    if (!results[1].meta.changes) return fail("This link has expired or was already used. Ask an administrator for a new link.", 410, "LINK_INVALID");
    const session = await createSession(row.userId, request.headers.get("user-agent") ?? "");
    const cookie = sessionCookie(request.url, session);
    return input.form ? seeOther("/platform", [cookie]) : apiJson({ ok: true }, 200, { "set-cookie": cookie });
  } catch {
    return fail("This link cannot be used right now. Try again shortly.", 503);
  }
}
