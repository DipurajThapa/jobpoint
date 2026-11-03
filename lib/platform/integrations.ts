import { env } from "cloudflare:workers";
import { base64url } from "./crypto";

function keyBytes(): Uint8Array<ArrayBuffer> {
  const value = env.PLATFORM_SECRET_KEY;
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error("A server-side integration encryption key is not configured.");
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=";
  const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
  if (bytes.length !== 32) throw new Error("The integration encryption key is invalid.");
  return bytes;
}
async function key() { return crypto.subtle.importKey("raw", keyBytes(), "AES-GCM", false, ["encrypt", "decrypt"]); }
function decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0));
}
export async function encryptToken(token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(token));
  return `v1.${base64url(iv)}.${base64url(new Uint8Array(encrypted))}`;
}
export async function decryptToken(value: string): Promise<string> {
  if (!value) return "";
  const [version, iv, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !encrypted) throw new Error("Stored credential format is invalid.");
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(iv) }, await key(), decode(encrypted)));
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
