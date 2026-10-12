import { headers } from "next/headers";

// Verified owner account returned by Sites access settings; SIWC supplies this verified email.
const OWNER_EMAIL = "dipuraj.thapa@gmail.com";

export async function isSiteOwner() {
  const h = await headers();
  const email = h.get("oai-authenticated-user-email")?.toLowerCase();
  if (!h.get("oai-authenticated-user-id")) return false;
  if (email === OWNER_EMAIL) return true;
  return process.env.NODE_ENV !== "production" && email === "seedy@sites.test";
}

export async function isOwnerRequest(request: Request) {
  if (!request.headers.get("oai-authenticated-user-id")) return false;
  const email = request.headers.get("oai-authenticated-user-email")?.toLowerCase();
  return email === OWNER_EMAIL || (process.env.NODE_ENV !== "production" && email === "seedy@sites.test");
}
