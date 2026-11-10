// Request and page helpers for portal sign-in (Workers runtime only).
import { env } from "cloudflare:workers";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { accessProblem, accountFromToken, type Account, type Need } from "./accounts";
import { PortalError, type Db } from "./db";

const SECURE_COOKIE = "__Host-jp_portal", LOCAL_COOKIE = "jp_portal";
export const NO_STORE = { "cache-control": "no-store, private", "x-content-type-options": "nosniff" };

export function portalDb(): Db {
  if (!env.DB) throw new Error("Database unavailable.");
  return env.DB as unknown as Db;
}

/** Secret for per-company candidate references and watermark trace IDs. */
export function portalSecret(): string {
  const value = env.PORTAL_SECRET ?? env.PLATFORM_SECRET_KEY;
  if (value && value.length >= 32) return value;
  // Fail closed: the built-in secret is used only when the runtime says it is a development or test run.
  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") return "local-development-portal-secret-not-for-production";
  throw new Error("PORTAL_SECRET is not configured.");
}

const secureUrl = (url: string) => new URL(url).protocol === "https:";
function readCookie(header: string | null, name: string) {
  for (const part of (header ?? "").split(";")) { const [k, ...v] = part.trim().split("="); if (k === name) return v.join("=") || null; }
  return null;
}
export const tokenFrom = (request: Request) => readCookie(request.headers.get("cookie"), SECURE_COOKIE) ?? (secureUrl(request.url) ? null : readCookie(request.headers.get("cookie"), LOCAL_COOKIE));

export function sessionCookie(requestUrl: string, token: string) {
  const secure = secureUrl(requestUrl);
  return `${secure ? SECURE_COOKIE : LOCAL_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${14 * 86_400}${secure ? "; Secure" : ""}`;
}
export const clearCookie = (requestUrl: string) => `${secureUrl(requestUrl) ? SECURE_COOKIE : LOCAL_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureUrl(requestUrl) ? "; Secure" : ""}`;

/** A link on this site, built from the address the request came to (so it is right on any domain, preview or local run). */
export const siteLink = (request: Request, path: string) => new URL(path, request.url).toString();

export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: NO_STORE });
export const fail = (message: string, status = 400, code = "ERROR") => json({ error: message, code }, status);
export function failFrom(error: unknown) {
  if (error instanceof PortalError) return fail(error.message, error.status, error.code);
  console.error(error);
  return fail("Something went wrong. Please try again.", 503, "UNAVAILABLE");
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !!origin && origin === new URL(request.url).origin && request.headers.get("sec-fetch-site") !== "cross-site";
}

export async function ipHash(request: Request) {
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`jp-portal:${ip}`));
  return [...new Uint8Array(digest)].slice(0, 12).map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Every portal API calls this first. Mutations also require a same-origin request. */
export async function requireApi(request: Request, need: Need, mutate = false): Promise<Account | Response> {
  if (mutate && !sameOrigin(request)) return fail("Cross-site requests are not accepted.", 403, "ORIGIN");
  const account = await accountFromToken(portalDb(), tokenFrom(request));
  if (!account) return fail("Sign in to continue.", 401, "SIGN_IN");
  const problem = accessProblem(account, need);
  if (problem) return fail(problem.message, problem.status, problem.code);
  return account;
}

export async function pageAccount(): Promise<Account | null> {
  const store = await cookies(), h = await headers();
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(h.get("host") ?? "");
  const token = store.get(SECURE_COOKIE)?.value ?? (local ? store.get(LOCAL_COOKIE)?.value : undefined) ?? null;
  return accountFromToken(portalDb(), token);
}

export async function requirePage(need: "candidate" | "company", path: string): Promise<Account> {
  const account = await pageAccount();
  if (!account) redirect(`/portal/sign-in?next=${encodeURIComponent(path)}`);
  if (need === "candidate" && account.kind !== "candidate") redirect("/company");
  if (need === "company" && account.kind !== "company_user") redirect("/candidate");
  // A suspended or closed company is signed out of its workspace.
  if (accessProblem(account, need)?.code === "COMPANY_INACTIVE") redirect("/portal/sign-in?inactive=1");
  return account;
}
