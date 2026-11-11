import { readLimitedForm, readLimitedJson } from "../intake-security";
import { env } from "cloudflare:workers";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomToken, sha256 } from "./crypto";
import { TOOLS, levelAtLeast, isAccessLevel, type AccessLevel } from "./tools";

export type PlatformUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  status: "invited" | "active" | "disabled";
  access: Record<string, AccessLevel>;
  /** True when this person signs in with a second step (authenticator code). */
  twoFactor: boolean;
};

const SECURE_COOKIE = "__Host-wp_session";
const LOCAL_COOKIE = "wp_session";
const IDLE_MS = 12 * 3600_000;
const ABSOLUTE_MS = 7 * 24 * 3600_000;
const TOUCH_MS = 5 * 60_000;

export const db = () => {
  if (!env.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  return env.DB;
};
export async function toolEnabled(key: string): Promise<boolean> {
  const row = await db().prepare("SELECT enabled FROM platform_features WHERE tool_key=?").bind(key).first<{enabled:number}>();
  return row?.enabled !== 0;
}

export const NO_STORE = { "cache-control": "no-store, private", "x-content-type-options": "nosniff" };
export const apiJson = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  Response.json(data, { status, headers: { ...NO_STORE, ...extra } });
export const apiError = (message: string, status = 400, code?: string) => apiJson({ error: message, ...(code ? { code } : {}) }, status);

const isSecureUrl = (url: string) => new URL(url).protocol === "https:";

function readCookie(header: string | null, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

// The unprefixed cookie exists only for plain-HTTP local development; on HTTPS only the
// __Host- cookie (which cannot be planted by a subdomain or over HTTP) is accepted.
function tokenFromCookieHeader(header: string | null, secure: boolean): string | null {
  const value = readCookie(header, SECURE_COOKIE) ?? (secure ? null : readCookie(header, LOCAL_COOKIE));
  return value && /^[A-Za-z0-9_-]{30,100}$/.test(value) ? value : null;
}

export function sessionCookie(requestUrl: string, token: string): string {
  const secure = isSecureUrl(requestUrl);
  const maxAge = Math.floor(ABSOLUTE_MS / 1000);
  return `${secure ? SECURE_COOKIE : LOCAL_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookies(requestUrl: string): string[] {
  const secure = isSecureUrl(requestUrl);
  return [
    `${LOCAL_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`,
    ...(secure ? [`${SECURE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`] : []),
  ];
}

export const newId = (prefix: string) => `${prefix}_${randomToken(12)}`;
const iso = (ms = Date.now()) => new Date(ms).toISOString();

export async function loadAccess(userId: string, role: string): Promise<Record<string, AccessLevel>> {
  if (role === "admin") return Object.fromEntries(TOOLS.map(t => [t.key, "manage" as AccessLevel]));
  const rows = await db().prepare("SELECT tool_key AS toolKey, level FROM platform_tool_access WHERE user_id = ?").bind(userId).all<{ toolKey: string; level: string }>();
  const access: Record<string, AccessLevel> = {};
  for (const row of rows.results ?? []) if (TOOLS.some(t => t.key === row.toolKey) && isAccessLevel(row.level)) access[row.toolKey] = row.level;
  return access;
}

type SessionRow = { userId: string; email: string; name: string; role: "admin" | "member"; status: PlatformUser["status"]; createdAt: string; lastSeenAt: string; expiresAt: string; twoFactorAt: string | null };

/** Resolves a session token to an active user. Expired or orphaned sessions are deleted. */
export async function userFromToken(token: string | null): Promise<PlatformUser | null> {
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await db().prepare(`SELECT s.user_id AS userId, s.created_at AS createdAt, s.last_seen_at AS lastSeenAt, s.expires_at AS expiresAt,
      u.email, u.name, u.role, u.status, u.totp_enabled_at AS twoFactorAt FROM platform_sessions s JOIN platform_users u ON u.id = s.user_id WHERE s.token_hash = ?`).bind(tokenHash).first<SessionRow>();
  if (!row) return null;
  const now = Date.now();
  const lastSeen = Date.parse(row.lastSeenAt);
  if (row.status !== "active" || now > Date.parse(row.expiresAt) || now - lastSeen > IDLE_MS) {
    await db().prepare("DELETE FROM platform_sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  if (now - lastSeen > TOUCH_MS) await db().prepare("UPDATE platform_sessions SET last_seen_at = ? WHERE token_hash = ?").bind(iso(now), tokenHash).run();
  return { id: row.userId, email: row.email, name: row.name, role: row.role, status: row.status, access: await loadAccess(row.userId, row.role), twoFactor: !!row.twoFactorAt };
}

export async function createSession(userId: string, userAgent: string): Promise<string> {
  const token = randomToken();
  const now = Date.now();
  await db().batch([
    db().prepare("INSERT INTO platform_sessions (token_hash, user_id, created_at, last_seen_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(await sha256(token), userId, iso(now), iso(now), iso(now + ABSOLUTE_MS), userAgent.slice(0, 200)),
    db().prepare("UPDATE platform_users SET last_sign_in_at = ? WHERE id = ?").bind(iso(now), userId),
    db().prepare("DELETE FROM platform_sessions WHERE expires_at < ?").bind(iso(now)),
  ]);
  return token;
}

export async function endSession(request: Request): Promise<string | null> {
  const token = tokenFromCookieHeader(request.headers.get("cookie"), isSecureUrl(request.url));
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await db().prepare("SELECT user_id AS userId FROM platform_sessions WHERE token_hash = ?").bind(tokenHash).first<{ userId: string }>();
  await db().prepare("DELETE FROM platform_sessions WHERE token_hash = ?").bind(tokenHash).run();
  return row?.userId ?? null;
}

export const requestUser = (request: Request) => userFromToken(tokenFromCookieHeader(request.headers.get("cookie"), isSecureUrl(request.url)));

/** For server components: the signed-in user or null. */
export async function pageUser(): Promise<PlatformUser | null> {
  const store = await cookies();
  const h = await headers();
  const secure = (h.get("x-forwarded-proto") ?? "").includes("https") || !!h.get("cf-visitor")?.includes("https") || !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(h.get("host") ?? "");
  const token = store.get(SECURE_COOKIE)?.value ?? (secure ? null : store.get(LOCAL_COOKIE)?.value) ?? null;
  return userFromToken(token && /^[A-Za-z0-9_-]{30,100}$/.test(token) ? token : null);
}

const safeNext = (path: string) => (path.startsWith("/platform") && !path.startsWith("//") ? path : "/platform");
export const signInPath = (next = "/platform") => `/platform/sign-in?next=${encodeURIComponent(safeNext(next))}`;

/** Every protected page calls this first. Unauthenticated visitors are redirected before any data is read. */
export async function requirePlatformPage(path: string): Promise<PlatformUser> {
  const user = await pageUser();
  if (!user) redirect(signInPath(path));
  return user;
}

export async function requireAdminPage(path: string): Promise<PlatformUser | null> {
  const user = await requirePlatformPage(path);
  return user.role === "admin" ? user : null;
}

/** Same-origin check for state-changing requests (CSRF defence alongside SameSite cookies). */
export function sameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return false;
  return request.headers.get("sec-fetch-site") !== "cross-site";
}

type ApiOptions = { tool?: string; min?: AccessLevel; admin?: boolean; mutate?: boolean };

/** Every protected API calls this first and returns the Response when access is refused. */
export async function authorizeApi(request: Request, options: ApiOptions = {}): Promise<PlatformUser | Response> {
  if (options.mutate && !sameOriginRequest(request)) return apiError("This request must come from the Working Platform.", 403, "ORIGIN");
  const user = await requestUser(request);
  if (!user) return apiError("Sign in to continue.", 401, "SIGN_IN");
  if (options.admin && user.role !== "admin") return apiError("Only an administrator can do this.", 403, "ADMIN_ONLY");
  if (options.tool) {
    if (!await toolEnabled(options.tool)) return apiError("This tool is currently disabled by an administrator.", 403, "TOOL_DISABLED");
    const level = user.access[options.tool];
    if (!level) return apiError("You do not have access to this tool.", 403, "NO_TOOL_ACCESS");
    if (options.min && !levelAtLeast(level, options.min)) return apiError(`This needs ${options.min} access to the tool. Ask an administrator.`, 403, "LEVEL");
  }
  return user;
}

export const auditStatement = (actor: string, action: string, targetType: string, targetId: string, detail = "") =>
  db().prepare("INSERT INTO audit_events (id, actor_id, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actor.slice(0, 200), action.slice(0, 120), targetType.slice(0, 60), targetId.slice(0, 200), detail.slice(0, 2000));

export async function audit(actor: string, action: string, targetType: string, targetId: string, detail = "") {
  await auditStatement(actor, action, targetType, targetId, detail).run();
}

/** Fixed-window limiter over the existing rate_limits table. Returns false when the limit is exceeded. */
export async function withinLimit(key: string, windowSeconds: number, max: number): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const row = await db().prepare(`INSERT INTO rate_limits (key, window_start, hits) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET
      window_start = CASE WHEN ? - rate_limits.window_start >= ? THEN ? ELSE rate_limits.window_start END,
      hits = CASE WHEN ? - rate_limits.window_start >= ? THEN 1 ELSE rate_limits.hits + 1 END RETURNING hits`)
    .bind(key, now, now, windowSeconds, now, now, windowSeconds).first<{ hits: number }>();
  return (row?.hits ?? max + 1) <= max;
}

export async function clientKey(request: Request): Promise<string> {
  // Only the edge-set header is trusted; x-forwarded-for is client-controlled.
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  return (await sha256(`wp:${ip}`)).slice(0, 24);
}

export const userAgentOf = async () => (await headers()).get("user-agent") ?? "";

/** One-time links for invitations and password resets. Earlier unused links of the same purpose stop working. */
export async function issueToken(userId: string, purpose: "invite" | "reset", createdBy: string, hours: number): Promise<string> {
  const token = randomToken();
  const now = Date.now();
  await db().batch([
    db().prepare("UPDATE platform_tokens SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL").bind(iso(now), userId, purpose),
    db().prepare("INSERT INTO platform_tokens (token_hash, user_id, purpose, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(await sha256(token), userId, purpose, createdBy, iso(now), iso(now + hours * 3600_000)),
  ]);
  return token;
}

export type TokenRow = { tokenHash: string; userId: string; purpose: "invite" | "reset"; expiresAt: string; usedAt: string | null; email: string; name: string; status: string };

export async function findToken(token: string): Promise<TokenRow | null> {
  if (!/^[A-Za-z0-9_-]{30,100}$/.test(token)) return null;
  const row = await db().prepare(`SELECT t.token_hash AS tokenHash, t.user_id AS userId, t.purpose, t.expires_at AS expiresAt, t.used_at AS usedAt, u.email, u.name, u.status
      FROM platform_tokens t JOIN platform_users u ON u.id = t.user_id WHERE t.token_hash = ?`).bind(await sha256(token)).first<TokenRow>();
  if (!row || row.usedAt || Date.parse(row.expiresAt) < Date.now()) return null;
  if (row.status === "disabled") return null;
  return row;
}

export const linkUrl = (requestUrl: string, purpose: "invite" | "reset", token: string) =>
  `${new URL(requestUrl).origin}/platform/${purpose === "invite" ? "accept" : "reset"}?token=${token}`;

export const nowIso = () => iso();

/** Reads JSON or a plain form post. Forms keep working (and never put secrets in a URL) before scripts load. */
export async function readInput(request: Request): Promise<{ data: Record<string, unknown>; form: boolean } | null> {
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
      const fields = await readLimitedForm(request, 16000);
      return { data: Object.fromEntries([...fields.entries()].filter(([, v]) => typeof v === "string")), form: true };
    }
    const data = await readLimitedJson(request, 16000);
    return data && typeof data === "object" ? { data: data as Record<string, unknown>, form: false } : null;
  } catch { return null; }
}

export function seeOther(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ ...NO_STORE, location });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(null, { status: 303, headers });
}

export const safePlatformPath = (value: unknown) =>
  typeof value === "string" && value.startsWith("/platform") && !value.startsWith("//") && !value.includes("\\") && !value.includes("\n") ? value : "/platform";
