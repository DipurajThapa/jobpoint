// Two-step sign-in for staff accounts: turning it on, checking a code at
// sign-in, recovery codes, and turning it off. Optional per person.
import { db, nowIso } from "./auth";
import { sha256 } from "./crypto";
import { decryptToken, encryptToken } from "./integrations";
import { newRecoveryCodes, newSecret, normaliseRecovery, provisioningUri, verifyCode } from "./totp";

type Row = { email: string; totp_secret: string | null; totp_enabled_at: string | null; totp_last_counter: number; totp_recovery: string };
const load = (userId: string) => db().prepare("SELECT email, totp_secret, totp_enabled_at, totp_last_counter, totp_recovery FROM platform_users WHERE id = ?").bind(userId).first<Row>();

export async function twoFactorOn(userId: string): Promise<boolean> { return !!(await load(userId))?.totp_enabled_at; }

/** Step 1: create a secret to add to the authenticator app. Nothing is enforced until it is confirmed. */
export async function beginSetup(userId: string): Promise<{ secret: string; uri: string }> {
  const row = await load(userId);
  if (!row) throw new Error("Account not found.");
  if (row.totp_enabled_at) throw new Error("Two-step sign-in is already on. Turn it off first to set it up again.");
  const secret = newSecret();
  await db().prepare("UPDATE platform_users SET totp_secret = ?, totp_last_counter = 0 WHERE id = ?").bind(await encryptToken(secret), userId).run();
  return { secret, uri: provisioningUri(secret, row.email) };
}

/** Step 2: confirm with a code from the app. Returns the recovery codes, shown once. */
export async function confirmSetup(userId: string, code: string): Promise<string[] | null> {
  const row = await load(userId);
  if (!row?.totp_secret || row.totp_enabled_at) return null;
  const counter = await verifyCode(await decryptToken(row.totp_secret), code, Date.now());
  if (counter === null) return null;
  const codes = newRecoveryCodes();
  const hashes = await Promise.all(codes.map(c => sha256(normaliseRecovery(c))));
  await db().prepare("UPDATE platform_users SET totp_enabled_at = ?, totp_last_counter = ?, totp_recovery = ? WHERE id = ?").bind(nowIso(), counter, JSON.stringify(hashes), userId).run();
  return codes;
}

/** At sign-in: an authenticator code (never reusable) or an unused recovery code (used up by this call). */
export async function checkSecondStep(userId: string, code: string): Promise<boolean> {
  const row = await load(userId);
  if (!row?.totp_enabled_at || !row.totp_secret) return true;
  if (!code) return false;
  const counter = await verifyCode(await decryptToken(row.totp_secret), code, Date.now(), row.totp_last_counter);
  if (counter !== null) {
    // Only the request that moves the counter forward wins, so two requests cannot share one code.
    const moved = await db().prepare("UPDATE platform_users SET totp_last_counter = ? WHERE id = ? AND totp_last_counter < ?").bind(counter, userId, counter).run();
    return !!moved.meta.changes;
  }
  const recovery = normaliseRecovery(code);
  if (recovery.length !== 8) return false;
  const hash = await sha256(recovery);
  let stored: string[] = []; try { stored = JSON.parse(row.totp_recovery); } catch { /* none */ }
  if (!stored.includes(hash)) return false;
  const used = await db().prepare("UPDATE platform_users SET totp_recovery = ? WHERE id = ? AND totp_recovery = ?").bind(JSON.stringify(stored.filter(h => h !== hash)), userId, row.totp_recovery).run();
  return !!used.meta.changes;
}

export async function turnOff(userId: string) {
  await db().batch([
    db().prepare("UPDATE platform_users SET totp_secret = NULL, totp_enabled_at = NULL, totp_last_counter = 0, totp_recovery = '[]' WHERE id = ?").bind(userId),
    // Signing in again proves the person still holds the password.
    db().prepare("DELETE FROM platform_sessions WHERE user_id = ?").bind(userId),
  ]);
}
