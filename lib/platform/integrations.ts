import { env } from "cloudflare:workers";
import { base64url } from "./crypto";

// Two separate keys, so one leaked key does not open everything:
// - PLATFORM_SECRET_KEY has also been the fallback for PORTAL_SECRET, which
//   names candidates to each company (their reference codes) and stamps CV
//   downloads. That use must never change, or every stored reference breaks.
// - INTEGRATION_SECRET_KEY, when set, encrypts stored credentials (integration
//   tokens, two-step sign-in secrets). Values written with it are tagged "v2".
// Values tagged "v1" were written with PLATFORM_SECRET_KEY and stay readable;
// rewrapStoredSecrets moves them to the new key.
type KeyName = "INTEGRATION_SECRET_KEY" | "PLATFORM_SECRET_KEY";
function keyBytes(name: KeyName): Uint8Array<ArrayBuffer> {
  const value = env[name];
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error("A server-side integration encryption key is not configured.");
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=";
  const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
  if (bytes.length !== 32) throw new Error("The integration encryption key is invalid.");
  return bytes;
}
const key = (name: KeyName) => crypto.subtle.importKey("raw", keyBytes(name), "AES-GCM", false, ["encrypt", "decrypt"]);
function decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0));
}
export async function encryptToken(token: string): Promise<string> {
  const dedicated = !!env.INTEGRATION_SECRET_KEY;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(dedicated ? "INTEGRATION_SECRET_KEY" : "PLATFORM_SECRET_KEY"), new TextEncoder().encode(token));
  return `${dedicated ? "v2" : "v1"}.${base64url(iv)}.${base64url(new Uint8Array(encrypted))}`;
}
export async function decryptToken(value: string): Promise<string> {
  if (!value) return "";
  const [version, iv, encrypted] = value.split(".");
  if ((version !== "v1" && version !== "v2") || !iv || !encrypted) throw new Error("Stored credential format is invalid.");
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(iv) }, await key(version === "v2" ? "INTEGRATION_SECRET_KEY" : "PLATFORM_SECRET_KEY"), decode(encrypted)));
}

type RewrapDb = { prepare(sql: string): { bind(...v: unknown[]): { run(): Promise<unknown> }; all<T>(): Promise<{ results: T[] }> } };
/** Re-encrypt every stored credential still under the old key with the dedicated key. Safe to run more than once. */
export async function rewrapStoredSecrets(db: RewrapDb): Promise<{ moved: number; alreadyDone: number }> {
  if (!env.INTEGRATION_SECRET_KEY) throw new Error("Set INTEGRATION_SECRET_KEY first.");
  let moved = 0, alreadyDone = 0;
  for (const [table, column] of [["platform_integrations", "encrypted_token"], ["platform_users", "totp_secret"]] as const) {
    const { results } = await db.prepare(`SELECT id, ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL AND ${column} != ''`).all<{ id: string; value: string }>();
    for (const row of results) {
      if (row.value.startsWith("v2.")) { alreadyDone++; continue; }
      await db.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ? AND ${column} = ?`).bind(await encryptToken(await decryptToken(row.value)), row.id, row.value).run();
      moved++;
    }
  }
  return { moved, alreadyDone };
}
export function endpointProblem(value: unknown): string {
  if (typeof value !== "string" || value.length > 500) return "Enter an HTTPS endpoint under 500 characters.";
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || url.hash || url.port && url.port !== "443" ||
      !/^[a-z0-9.-]+$/.test(host) || !host.includes(".") || /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host) ||
      /(^|\.)(localhost|local|internal|test|invalid|example)\./.test(host) || /\d+\.\d+\.\d+\.\d+/.test(host))
      return "Use an HTTPS endpoint on a public domain, without credentials, fragments or custom ports.";
    return "";
  } catch { return "Enter a valid HTTPS endpoint."; }
}
