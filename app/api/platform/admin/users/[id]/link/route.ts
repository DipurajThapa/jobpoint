import { apiError, apiJson, audit, authorizeApi, db, issueToken, linkUrl } from "@/lib/platform/auth";

export const dynamic = "force-dynamic";

// Creates a fresh invitation link (72 h) or password-reset link (24 h).
// No email provider is configured, so the administrator passes the link on.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await authorizeApi(request, { admin: true, mutate: true });
  if (admin instanceof Response) return admin;
  const { id } = await params;
  let body: { purpose?: unknown };
  try { body = await request.json(); } catch { return apiError("The request was not readable."); }
  const purpose = body.purpose === "reset" ? "reset" : body.purpose === "invite" ? "invite" : null;
  if (!purpose) return apiError("Choose an invitation or reset link.");
  if (purpose === "invite") {
    const policy = await db().prepare("SELECT value FROM platform_settings WHERE key='invites_enabled'").first<{value:string}>();
    if (policy?.value === "false") return apiError("Invitations are paused in system settings.",403,"INVITES_PAUSED");
  }
  if (!/^u_[A-Za-z0-9_-]{8,40}$/.test(id)) return apiError("That person was not found.", 404);
  const user = await db().prepare("SELECT id, status, password_hash AS passwordHash FROM platform_users WHERE id = ?").bind(id).first<{ id: string; status: string; passwordHash: string | null }>();
  if (!user) return apiError("That person was not found.", 404);
  if (user.status === "disabled") return apiError("Enable this account before creating a link.", 409);
  if (purpose === "invite" && user.status !== "invited") return apiError("This person has already accepted their invitation. Create a reset link instead.", 409);
  if (purpose === "reset" && user.status !== "active") return apiError("This person has not accepted their invitation yet. Create a new invitation link instead.", 409);
  const hours = purpose === "invite" ? 72 : 24;
  const token = await issueToken(id, purpose, admin.id, hours);
  await audit(`platform:${admin.id}`, `platform.${purpose}_link_created`, "platform_user", id);
  return apiJson({ ok: true, link: linkUrl(request.url, purpose, token), expiresInHours: hours });
}
