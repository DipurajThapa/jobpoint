import { NO_STORE, apiError, audit, clearSessionCookies, endSession, sameOriginRequest } from "@/lib/platform/auth";

export const dynamic = "force-dynamic";

// Accepts a plain form post (from Email Kit's top bar) or fetch.
export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return apiError("This request must come from the Working Platform.", 403);
  let userId: string | null = null;
  try { userId = await endSession(request); } catch { /* the cookie is cleared regardless */ }
  if (userId) { try { await audit(`platform:${userId}`, "platform.sign_out", "platform_user", userId); } catch { /* non-blocking */ } }
  const headers = new Headers({ ...NO_STORE, "clear-site-data": "\"cache\", \"storage\"" });
  for (const cookie of clearSessionCookies(request.url)) headers.append("set-cookie", cookie);
  const isForm = (request.headers.get("content-type") ?? "").includes("application/x-www-form-urlencoded");
  if (isForm) {
    headers.set("location", "/platform/sign-in?signed_out=1");
    return new Response(null, { status: 303, headers });
  }
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
