import { isOwnerRequest } from "@/lib/admin";
import { hashPassword, passwordProblem } from "@/lib/platform/crypto";
import { apiError, apiJson, auditStatement, clientKey, db, issueToken, linkUrl, newId, nowIso, sameOriginRequest, audit, withinLimit } from "@/lib/platform/auth";
import { cleanEmail, cleanName, validEmail } from "@/lib/platform/users";

export const dynamic = "force-dynamic";

// Site-owner bootstrap and recovery. Identity comes from Sign in with ChatGPT,
// the same check that protects /admin. Non-owners receive 404.
export async function POST(request: Request) {
  if (!await isOwnerRequest(request)) return apiError("Not found.", 404);
  if (!sameOriginRequest(request)) return apiError("This request must come from the Working Platform.", 403);
  const ownerEmail = request.headers.get("oai-authenticated-user-email")?.toLowerCase() ?? "owner";
  if (!await withinLimit(`wp-owner:${await clientKey(request)}`, 900, 10)) return apiError("Too many attempts. Wait 15 minutes, then try again.", 429);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return apiError("The request was not readable."); }
  const admins = await db().prepare("SELECT COUNT(*) AS n FROM platform_users WHERE role = 'admin' AND status = 'active'").first<{ n: number }>();

  if (body.action === "create-admin") {
    if ((admins?.n ?? 0) > 0) return apiError("An administrator already exists. Use a reset link instead.", 409);
    const email = cleanEmail(body.email);
    const name = cleanName(body.name);
    const password = typeof body.password === "string" ? body.password : "";
    if (!validEmail(email) || !name) return apiError("Enter a name and a valid email address.");
    const problem = passwordProblem(password, email);
    if (problem) return apiError(problem);
    const now = nowIso();
    const existing = await db().prepare("SELECT id FROM platform_users WHERE email = ?").bind(email).first<{ id: string }>();
    const id = existing?.id ?? newId("u");
    await db().batch([
      existing
        ? db().prepare("UPDATE platform_users SET name = ?, role = 'admin', status = 'active', password_hash = ?, updated_at = ? WHERE id = ?").bind(name, await hashPassword(password), now, id)
        : db().prepare("INSERT INTO platform_users (id, email, name, role, status, password_hash, created_at, updated_at, created_by) VALUES (?, ?, ?, 'admin', 'active', ?, ?, ?, ?)")
          .bind(id, email, name, await hashPassword(password), now, now, `owner:${ownerEmail}`),
      auditStatement(`owner:${ownerEmail}`, "platform.first_admin_created", "platform_user", id),
    ]);
    return apiJson({ ok: true });
  }

  if (body.action === "reset-admin") {
    const email = cleanEmail(body.email);
    const user = await db().prepare("SELECT id, status FROM platform_users WHERE email = ? AND role = 'admin'").bind(email).first<{ id: string; status: string }>();
    if (!user) return apiError("No administrator has that email.", 404);
    if (user.status === "disabled") {
      if ((admins?.n ?? 0) > 0) return apiError("That administrator is disabled. Ask an active administrator to enable them.", 409);
      await db().prepare("UPDATE platform_users SET status = 'active', updated_at = ? WHERE id = ? AND password_hash IS NOT NULL").bind(nowIso(), user.id).run();
    }
    const fresh = await db().prepare("SELECT status FROM platform_users WHERE id = ?").bind(user.id).first<{ status: string }>();
    const purpose = fresh?.status === "invited" ? "invite" : "reset";
    const token = await issueToken(user.id, purpose, `owner:${ownerEmail}`, 24);
    await audit(`owner:${ownerEmail}`, `platform.owner_${purpose}_link_created`, "platform_user", user.id);
    return apiJson({ ok: true, link: linkUrl(request.url, purpose, token), expiresInHours: 24 });
  }
  return apiError("Unknown action.");
}
