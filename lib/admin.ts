import { headers } from "next/headers";

// Verified owner account returned by Sites access settings; SIWC supplies this verified email.
const OWNER_EMAIL = "dipuraj.thapa@gmail.com";
const DEV_OWNER_EMAIL = "seedy@sites.test";

/**
 * The local test owner is accepted only when the runtime explicitly reports a
 * development or test run AND the request is addressed to this machine. Anything
 * else (including a deployment whose NODE_ENV is unset) fails closed.
 */
export function devOwnerAllowed(nodeEnv: string | undefined, host: string | null | undefined): boolean {
  if (nodeEnv !== "development" && nodeEnv !== "test") return false;
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test((host ?? "").toLowerCase());
}

export function isOwnerIdentity(userId: string | null | undefined, email: string | null | undefined, nodeEnv: string | undefined, host: string | null | undefined): boolean {
  if (!userId) return false;
  const address = email?.toLowerCase();
  if (address === OWNER_EMAIL) return true;
  return address === DEV_OWNER_EMAIL && devOwnerAllowed(nodeEnv, host);
}

/**
 * One staff sign-in: a Working Platform administrator may also use the owner
 * console, but only when their account has two-step sign-in turned on. A
 * password alone never opens it. Team managers and team members never qualify.
 */
export function platformAdminAllowed(user: { role: string; status: string; twoFactor: boolean } | null | undefined): boolean {
  return !!user && user.role === "admin" && user.status === "active" && user.twoFactor === true;
}

const actors = new WeakMap<Request, string>();
/** Who is acting, for the audit log. Set by isOwnerRequest. */
export const adminActor = (request: Request) => actors.get(request) ?? request.headers.get("oai-authenticated-user-id") ?? "owner";

export async function isSiteOwner() {
  const h = await headers();
  if (isOwnerIdentity(h.get("oai-authenticated-user-id"), h.get("oai-authenticated-user-email"), process.env.NODE_ENV, h.get("host"))) return true;
  if (!/(^|;\s*)(__Host-)?wp_session=/.test(h.get("cookie") ?? "")) return false;
  const { pageUser } = await import("./platform/auth");
  return platformAdminAllowed(await pageUser());
}

export async function isOwnerRequest(request: Request) {
  if (isOwnerIdentity(request.headers.get("oai-authenticated-user-id"), request.headers.get("oai-authenticated-user-email"), process.env.NODE_ENV, new URL(request.url).host)) return true;
  if (!/(^|;\s*)(__Host-)?wp_session=/.test(request.headers.get("cookie") ?? "")) return false;
  const { requestUser } = await import("./platform/auth");
  const user = await requestUser(request);
  if (!platformAdminAllowed(user)) return false;
  actors.set(request, `platform:${user!.id}`);
  return true;
}
