// Minimal D1 interface used by the portal domain modules, so the same code runs
// on Cloudflare D1 and in tests against SQLite.

export interface Stmt {
  bind(...values: unknown[]): Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes?: number } }>;
}
export interface Db {
  prepare(sql: string): Stmt;
  batch(statements: Stmt[]): Promise<unknown[]>;
}

let clock: () => Date = () => new Date();
/** Tests can pin the clock. */
export function setClock(fn: () => Date) { clock = fn; }
export const now = () => clock();
export const nowIso = () => clock().toISOString();
export const newId = () => crypto.randomUUID();

export class PortalError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) { super(message); this.code = code; this.status = status; }
}

const encoder = new TextEncoder();
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Per-company pseudonymous candidate reference: stable across a company's JDs, unlinkable across companies. */
export async function candidateRef(secret: string, companyId: string, candidateId: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${companyId}:${candidateId}`)));
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  return "c_" + [...mac.slice(0, 12)].map(b => alphabet[b % 32]).join("");
}

export async function audit(db: Db, actor: string, action: string, targetType: string, targetId: string, detail = "") {
  await db.prepare("INSERT INTO audit_events (id, actor_id, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?, ?)").bind(newId(), actor, action, targetType, targetId, detail.slice(0, 200)).run();
}

export const parseJson = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== "string") return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};
