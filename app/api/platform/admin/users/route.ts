import { apiError, apiJson, auditStatement, authorizeApi, db, issueToken, linkUrl, newId, nowIso } from "@/lib/platform/auth";
import { accessStatements, cleanEmail, cleanName, listUsers, parseAccess, recentPlatformActivity, validEmail } from "@/lib/platform/users";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await authorizeApi(request, { admin: true });
  if (user instanceof Response) return user;
  const [users, activity] = await Promise.all([listUsers(), recentPlatformActivity()]);
  return apiJson({ users, activity, me: user.id });
}

// Invite a team member. The one-time link is returned once for the administrator to pass on.
export async function POST(request: Request) {
  const admin = await authorizeApi(request, { admin: true, mutate: true });
  if (admin instanceof Response) return admin;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return apiError("The request was not readable."); }
  const email = cleanEmail(body.email);
  const name = cleanName(body.name);
  const role = body.role === "admin" ? "admin" : "member";
  if (!validEmail(email)) return apiError("Enter a valid email address.");
  const existing = await db().prepare("SELECT id FROM platform_users WHERE email = ?").bind(email).first();
  if (existing) return apiError("This email already has an account. Use Create invite link or Reset link on that person instead.", 409, "EXISTS");
  const id = newId("u");
  const now = nowIso();
  const access = role === "admin" ? {} : parseAccess(body.access);
  await db().batch([
    db().prepare("INSERT INTO platform_users (id, email, name, role, status, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, 'invited', ?, ?, ?)").bind(id, email, name, role, now, now, admin.id),
    ...accessStatements(id, access, admin.id),
    auditStatement(`platform:${admin.id}`, `platform.user_invited.${role}`, "platform_user", id),
    ...Object.entries(access).filter(([, l]) => l !== "none").map(([tool, level]) => auditStatement(`platform:${admin.id}`, `platform.access.${tool}.${level}`, "platform_user", id)),
  ]);
  const token = await issueToken(id, "invite", admin.id, 72);
  return apiJson({ ok: true, id, link: linkUrl(request.url, "invite", token), expiresInHours: 72 }, 201);
}
