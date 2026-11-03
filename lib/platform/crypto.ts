// Password hashing and token helpers for Working Platform.
// Workers WebCrypto caps PBKDF2 at 100,000 iterations, which is used here.
const ITERATIONS = 100_000;
const encoder = new TextEncoder();

export function base64url(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

/** 32 random bytes, URL-safe. Used for sessions, invites and reset links. */
export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, "0")).join("");
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2-sha256$${ITERATIONS}$${base64url(salt)}$${base64url(hash)}`;
}

/** Always performs one derivation, so unknown accounts take as long as known ones. */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = (stored ?? "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") {
    await derive(password, new Uint8Array(16), ITERATIONS);
    return false;
  }
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 10_000 || iterations > ITERATIONS) return false;
  const actual = await derive(password, fromBase64url(parts[2]), iterations);
  return equalBytes(actual, fromBase64url(parts[3]));
}

/** Returns a reason the password is unacceptable, or "" when it is acceptable. */
export function passwordProblem(password: string, email = ""): string {
  if (typeof password !== "string" || password.length < 12) return "Use a password of at least 12 characters.";
  if (password.length > 200) return "Use a password of at most 200 characters.";
  if (email && password.toLowerCase().includes(email.toLowerCase().split("@")[0]) && email.split("@")[0].length >= 4) return "Do not include your email name in the password.";
  if (new Set(password).size < 5) return "Use a less repetitive password.";
  return "";
}
