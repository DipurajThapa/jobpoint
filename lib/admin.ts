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

export async function isSiteOwner() {
  const h = await headers();
  return isOwnerIdentity(h.get("oai-authenticated-user-id"), h.get("oai-authenticated-user-email"), process.env.NODE_ENV, h.get("host"));
}

export async function isOwnerRequest(request: Request) {
  return isOwnerIdentity(request.headers.get("oai-authenticated-user-id"), request.headers.get("oai-authenticated-user-email"), process.env.NODE_ENV, new URL(request.url).host);
}
