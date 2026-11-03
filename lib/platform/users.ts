import { db } from "./auth";
import { TOOLS, isAccessLevel, type AccessLevel } from "./tools";

export type AdminUserView = {
  id: string; email: string; name: string; role: "admin" | "member"; status: "invited" | "active" | "disabled";
  createdAt: string; lastSignInAt: string | null; access: Record<string, AccessLevel>; pendingInvite: boolean;
};

export async function listUsers(): Promise<AdminUserView[]> {
  const [users, grants, invites] = await Promise.all([
    db().prepare("SELECT id, email, name, role, status, created_at AS createdAt, last_sign_in_at AS lastSignInAt FROM platform_users ORDER BY status = 'disabled', name COLLATE NOCASE, email").all<Omit<AdminUserView, "access" | "pendingInvite">>(),
    db().prepare("SELECT user_id AS userId, tool_key AS toolKey, level FROM platform_tool_access").all<{ userId: string; toolKey: string; level: string }>(),
    db().prepare("SELECT DISTINCT user_id AS userId FROM platform_tokens WHERE purpose = 'invite' AND used_at IS NULL AND expires_at > ?").bind(new Date().toISOString()).all<{ userId: string }>(),
  ]);
  const pending = new Set((invites.results ?? []).map(r => r.userId));
  return (users.results ?? []).map(u => {
    const access: Record<string, AccessLevel> = {};
    for (const g of grants.results ?? []) if (g.userId === u.id && isAccessLevel(g.level) && TOOLS.some(t => t.key === g.toolKey)) access[g.toolKey] = g.level;
    return { ...u, access, pendingInvite: pending.has(u.id) };
  });
}

/** Reads `{ "email-kit": "edit" | "none" | ... }` and keeps only known tools and levels. */
export function parseAccess(value: unknown): Record<string, AccessLevel | "none"> {
  const out: Record<string, AccessLevel | "none"> = {};
  if (!value || typeof value !== "object") return out;
  for (const tool of TOOLS) {
    const level = (value as Record<string, unknown>)[tool.key];
    if (level === "none" || isAccessLevel(level)) out[tool.key] = level;
  }
  return out;
}

export function accessStatements(userId: string, access: Record<string, AccessLevel | "none">, grantedBy: string) {
  return Object.entries(access).map(([tool, level]) => level === "none"
    ? db().prepare("DELETE FROM platform_tool_access WHERE user_id = ? AND tool_key = ?").bind(userId, tool)
    : db().prepare(`INSERT INTO platform_tool_access (user_id, tool_key, level, granted_by, granted_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, tool_key) DO UPDATE SET level = excluded.level, granted_by = excluded.granted_by, granted_at = excluded.granted_at`)
      .bind(userId, tool, level, grantedBy, new Date().toISOString()));
}

export async function otherActiveAdmins(excludingId: string): Promise<number> {
  const row = await db().prepare("SELECT COUNT(*) AS n FROM platform_users WHERE role = 'admin' AND status = 'active' AND id != ?").bind(excludingId).first<{ n: number }>();
  return row?.n ?? 0;
}

export const cleanName = (value: unknown) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 120) : "";
export const cleanEmail = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase().slice(0, 254) : "";
export const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

export async function recentPlatformActivity(limit = 100) {
  const rows = await db().prepare(`SELECT a.action, a.actor_id AS actorId, a.target_id AS targetId, a.created_at AS createdAt,
      actor.email AS actorEmail, target.email AS targetEmail
      FROM audit_events a
      LEFT JOIN platform_users actor ON a.actor_id = 'platform:' || actor.id
      LEFT JOIN platform_users target ON target.id = substr(a.target_id, 1, instr(a.target_id || ':', ':') - 1)
      WHERE a.action LIKE 'platform.%' OR a.action LIKE 'email_kit.%'
      ORDER BY a.created_at DESC LIMIT ?`).bind(limit).all<{ action: string; actorId: string; targetId: string; createdAt: string; actorEmail: string | null; targetEmail: string | null }>();
  return rows.results ?? [];
}
