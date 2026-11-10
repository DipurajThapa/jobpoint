// Time-based one-time passwords (RFC 6238: HMAC-SHA1, 6 digits, 30-second
// steps), the scheme every authenticator app supports. No dependency: the
// Workers runtime provides HMAC through WebCrypto.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP_SECONDS = 30;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Uint8Array<ArrayBuffer> {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  if (!/^[A-Z2-7]+$/.test(clean)) throw new Error("Invalid base32 secret.");
  const out = new Uint8Array(Math.floor(clean.length * 5 / 8));
  let bits = 0, value = 0, index = 0;
  for (const char of clean) {
    value = (value << 5) | ALPHABET.indexOf(char); bits += 5;
    if (bits >= 8) { out[index++] = (value >>> (bits - 8)) & 255; bits -= 8; }
  }
  return out;
}

export const newSecret = () => base32Encode(crypto.getRandomValues(new Uint8Array(20)));
export const counterAt = (ms: number) => Math.floor(ms / 1000 / STEP_SECONDS);

/** The 6-digit code for one 30-second step. */
export async function codeFor(secret: string, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", base32Decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const message = new Uint8Array(8);
  new DataView(message.buffer).setUint32(4, counter >>> 0); new DataView(message.buffer).setUint32(0, Math.floor(counter / 2 ** 32));
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  const offset = mac[19] & 15;
  const number = ((mac[offset] & 127) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(number % 1_000_000).padStart(6, "0");
}

/**
 * Check a code against the current step and one step either side (clock drift).
 * Returns the step it matched, or null. A step at or before `lastCounter` is
 * refused, so a code that was already used (or seen over a shoulder) cannot be replayed.
 */
export async function verifyCode(secret: string, code: string, nowMs: number, lastCounter = 0): Promise<number | null> {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const current = counterAt(nowMs);
  for (const counter of [current, current - 1, current + 1]) {
    if (counter <= lastCounter) continue;
    const expected = await codeFor(secret, counter);
    let diff = 0;
    for (let i = 0; i < 6; i++) diff |= expected.charCodeAt(i) ^ clean.charCodeAt(i);
    if (diff === 0) return counter;
  }
  return null;
}

/** The link an authenticator app reads (usually shown as a QR code). */
export const provisioningUri = (secret: string, account: string, issuer = "Jobboard300") =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;

/** Ten single-use recovery codes, shown once. Only their hashes are stored. */
export function newRecoveryCodes(): string[] {
  return Array.from({ length: 10 }, () => { const b = crypto.getRandomValues(new Uint8Array(5)); return base32Encode(b).toLowerCase().replace(/(.{4})/, "$1-"); });
}
export const normaliseRecovery = (code: string) => code.toLowerCase().replace(/[^a-z2-7]/g, "");
