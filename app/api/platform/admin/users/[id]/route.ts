import { apiError, apiJson, auditStatement, authorizeApi, db, nowIso } from "@/lib/platform/auth";
import { accessStatements, cleanName, otherActiveAdmins, parseAccess } from "@/lib/platform/users";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
type Target = { id: string; role: string; status: string; passwordHash: string | null };

async function target(id: string) {
  if (!/^u_[A-Za-z0-9_-]{8,40}$/.test(id)) return null;
  return db().prepare("SELECT id, role, status, password_hash AS passwordHash FROM platform_users WHERE id = ?").bind(id).first<Target>();
}

// Change role, status (active/disabled), name or per-tool access.
export async function PATCH(request: Request, { params }: Params) {
  const admin = await authorizeApi(request, { admin: true, mutate: true });
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const user = await target(id);
  if (!user) return apiError("That person was not found.", 404);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return apiError("The request was not readable."); }

  const role = body.role === "admin" || body.role === "member" ? body.role : undefined;
  const status = body.status === "active" || body.status === "disabled" ? body.status : undefined;
  const name = body.name !== undefined ? cleanName(body.name) : undefined;
  const access = body.access !== undefined ? parseAccess(body.access) : undefined;

  const removesAdmin = user.role === "admin" && user.status === "active" && (role === "member" || status === "disabled");
  if (removesAdmin && user.id === admin.id) return apiError("You cannot remove your own administrator access. Ask another administrator.", 409, "SELF");
  if (removesAdmin && await otherActiveAdmins(user.id) === 0) return apiError("At least one active administrator must remain.", 409, "LAST_ADMIN");

  // Re-enabling someone who never set a password returns them to "invited".
  const nextStatus = status === "active" && !user.passwordHash ? "invited" : status;
  const actor = `platform:${admin.id}`;
  const now = nowIso();
  // Re-checked inside the write, so two administrators cannot remove each other at once.
  const keepsAdmin = removesAdmin ? " AND (SELECT COUNT(*) FROM platform_users WHERE role = 'admin' AND status = 'active' AND id != ?) > 0" : "";
  const guardArgs = removesAdmin ? [id] : [];
  const statements = [];
  if (role && role !== user.role) statements.push(db().prepare(`UPDATE platform_users SET role = ?, updated_at = ? WHERE id = ?${keepsAdmin}`).bind(role, now, id, ...guardArgs), auditStatement(actor, `platform.role.${role}`, "platform_user", id));
  if (nextStatus && nextStatus !== user.status) {
    statements.push(db().prepare(`UPDATE platform_users SET status = ?, updated_at = ? WHERE id = ?${keepsAdmin}`).bind(nextStatus, now, id, ...guardArgs), auditStatement(actor, `platform.user_${nextStatus === "disabled" ? "disabled" : "enabled"}`, "platform_user", id));
    if (nextStatus === "disabled") statements.push(
      db().prepare("DELETE FROM platform_sessions WHERE user_id = ?").bind(id),
      db().prepare("UPDATE platform_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL").bind(now, id));
  }
  if (name !== undefined && name) statements.push(db().prepare("UPDATE platform_users SET name = ?, updated_at = ? WHERE id = ?").bind(name, now, id));
  if (access) {
    statements.push(...accessStatements(id, access, admin.id));
    for (const [tool, level] of Object.entries(access)) statements.push(auditStatement(actor, `platform.access.${tool}.${level}`, "platform_user", id));
  }
  if (statements.length) {
    const results = await db().batch(statements);
    if (removesAdmin && !results[0].meta.changes) return apiError("At least one active administrator must remain.", 409, "LAST_ADMIN");
  }
  return apiJson({ ok: true });
}

// Permanently removes the account, its sessions, links and permissions.
// Email Kit records keep the person's id in their history for traceability.
export async function DELETE(request: Request, { params }: Params) {
  const admin = await authorizeApi(request, { admin: true, mutate: true });
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const user = await target(id);
  if (!user) return apiError("That person was not found.", 404);
  if (user.id === admin.id) return apiError("You cannot delete your own account.", 409, "SELF");
  if (user.role === "admin" && user.status === "active" && await otherActiveAdmins(user.id) === 0) return apiError("At least one active administrator must remain.", 409, "LAST_ADMIN");
  const results = await db().batch([
    db().prepare("DELETE FROM platform_sessions WHERE user_id = ?").bind(id),
    db().prepare("DELETE FROM platform_tokens WHERE user_id = ?").bind(id),
    db().prepare("DELETE FROM platform_tool_access WHERE user_id = ?").bind(id),
    db().prepare("DELETE FROM platform_users WHERE id = ? AND (role != 'admin' OR status != 'active' OR (SELECT COUNT(*) FROM platform_users WHERE role = 'admin' AND status = 'active' AND id != ?) > 0)").bind(id, id),
    auditStatement(`platform:${admin.id}`, "platform.user_deleted", "platform_user", id),
  ]);
  if (!results[3].meta.changes) return apiError("At least one active administrator must remain.", 409, "LAST_ADMIN");
  // Jobs assigned to this person go back to unassigned, so the team can pick them up.
  await db().prepare("UPDATE jds SET recruiter_id = NULL WHERE recruiter_id = ?").bind(id).run();
  return apiJson({ ok: true });
}
