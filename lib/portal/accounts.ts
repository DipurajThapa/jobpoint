// Candidate and company-user accounts (separate from internal team accounts).
// Passwords use the Working Platform's PBKDF2 helper; session and one-time
// tokens are stored only as SHA-256 hashes.

import { hashPassword, passwordProblem, randomToken, sha256, verifyPassword } from "../platform/crypto";
import { newId, now, nowIso, PortalError, type Db } from "./db";

export const SESSION_IDLE_MS = 12 * 3600_000, SESSION_ABSOLUTE_MS = 14 * 24 * 3600_000;

export type Account = { id: string; kind: "candidate" | "company_user"; email: string; status: string; candidateId: string | null; companyId: string | null; companyRole: "owner" | "recruiter" | null; companyStatus: string | null };

export async function createAccount(db: Db, kind: Account["kind"], email: string, password: string, phone = "") {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean) || clean.length > 254) throw new PortalError("INVALID_EMAIL", "Enter a valid email address.");
  const problem = passwordProblem(password, clean);
  if (problem) throw new PortalError("WEAK_PASSWORD", problem);
  const existing = await db.prepare("SELECT id FROM portal_accounts WHERE email = ?").bind(clean).first();
  if (existing) throw new PortalError("EMAIL_TAKEN", "An account with this email already exists. Sign in or reset your password.", 409);
  const id = newId();
  await db.prepare("INSERT INTO portal_accounts (id, kind, email, phone, password_hash, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)")
    .bind(id, kind, clean, phone.replace(/[^\d+]/g, "").slice(0, 16), await hashPassword(password), nowIso()).run();
  return id;
}

export async function issuePortalToken(db: Db, accountId: string, purpose: "verify" | "reset" | "invite", hours: number) {
  const token = randomToken(), at = now();
  await db.batch([
    db.prepare("UPDATE portal_tokens SET used_at = ? WHERE account_id = ? AND purpose = ? AND used_at IS NULL").bind(at.toISOString(), accountId, purpose),
    db.prepare("INSERT INTO portal_tokens (token_hash, account_id, purpose, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(await sha256(token), accountId, purpose, at.toISOString(), new Date(at.getTime() + hours * 3600_000).toISOString()),
  ]);
  return token;
}

/** Redeem a one-time token. Verification activates the account; reset sets a new password. */
export async function redeemToken(db: Db, token: string, purpose: "verify" | "reset" | "invite", newPassword?: string) {
  if (!/^[A-Za-z0-9_-]{30,100}$/.test(token)) throw new PortalError("INVALID_LINK", "This link is invalid or has expired.");
  const hash = await sha256(token);
  const row = await db.prepare("SELECT t.account_id, t.expires_at, t.used_at, a.email, a.status FROM portal_tokens t JOIN portal_accounts a ON a.id = t.account_id WHERE t.token_hash = ? AND t.purpose = ?")
    .bind(hash, purpose).first<{ account_id: string; expires_at: string; used_at: string | null; email: string; status: string }>();
  if (!row || row.used_at || Date.parse(row.expires_at) < now().getTime() || row.status === "deleted" || row.status === "suspended") throw new PortalError("INVALID_LINK", "This link is invalid or has expired.");
  const at = nowIso();
  const statements = [db.prepare("UPDATE portal_tokens SET used_at = ? WHERE token_hash = ?").bind(at, hash)];
  if (purpose === "verify") statements.push(db.prepare("UPDATE portal_accounts SET status = 'active', email_verified_at = ? WHERE id = ? AND status = 'pending'").bind(at, row.account_id));
  else {
    const problem = passwordProblem(newPassword ?? "", row.email);
    if (problem) throw new PortalError("WEAK_PASSWORD", problem);
    statements.push(db.prepare("UPDATE portal_accounts SET password_hash = ?, status = CASE WHEN status = 'pending' THEN 'active' ELSE status END, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?").bind(await hashPassword(newPassword!), at, row.account_id));
    statements.push(db.prepare("DELETE FROM portal_sessions WHERE account_id = ?").bind(row.account_id));
  }
  await db.batch(statements);
  return row.account_id;
}

export async function signIn(db: Db, email: string, password: string, userAgent: string) {
  const row = await db.prepare("SELECT id, password_hash, status FROM portal_accounts WHERE email = ?").bind(email.trim().toLowerCase()).first<{ id: string; password_hash: string | null; status: string }>();
  const ok = await verifyPassword(password, row?.password_hash);
  if (!row || !ok) throw new PortalError("BAD_CREDENTIALS", "Email or password is incorrect.", 401);
  if (row.status === "pending") throw new PortalError("UNVERIFIED", "Verify your email address first. Check your inbox for the link.", 403);
  if (row.status !== "active") throw new PortalError("ACCOUNT_INACTIVE", "This account is not active.", 403);
  // A suspended or closed company cannot sign in: say so, instead of bouncing the person between sign-in and the workspace.
  const company = await db.prepare("SELECT co.status FROM company_users cu JOIN companies co ON co.id = cu.company_id WHERE cu.account_id = ?").bind(row.id).first<{ status: string }>();
  if (company && (company.status === "suspended" || company.status === "closed")) throw new PortalError("COMPANY_INACTIVE", "This company account is not active. Contact Jobboard300 to have it reactivated.", 403);
  const token = randomToken(), at = now();
  await db.batch([
    db.prepare("INSERT INTO portal_sessions (token_hash, account_id, created_at, last_seen_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(await sha256(token), row.id, at.toISOString(), at.toISOString(), new Date(at.getTime() + SESSION_ABSOLUTE_MS).toISOString(), userAgent.slice(0, 200)),
    db.prepare("UPDATE portal_accounts SET last_sign_in_at = ? WHERE id = ?").bind(at.toISOString(), row.id),
    db.prepare("DELETE FROM portal_sessions WHERE expires_at < ?").bind(at.toISOString()),
  ]);
  return token;
}

/** Resolve a session token to the account and what it may act for. */
export async function accountFromToken(db: Db, token: string | null): Promise<Account | null> {
  if (!token || !/^[A-Za-z0-9_-]{30,100}$/.test(token)) return null;
  const hash = await sha256(token);
  const row = await db.prepare(`SELECT s.last_seen_at, s.expires_at, a.id, a.kind, a.email, a.status,
      (SELECT id FROM candidates c WHERE c.account_id = a.id AND c.status NOT IN ('merged','deleted') LIMIT 1) AS candidate_id,
      cu.company_id, cu.role AS company_role, co.status AS company_status
    FROM portal_sessions s JOIN portal_accounts a ON a.id = s.account_id
    LEFT JOIN company_users cu ON cu.account_id = a.id LEFT JOIN companies co ON co.id = cu.company_id
    WHERE s.token_hash = ?`).bind(hash).first<{ last_seen_at: string; expires_at: string; id: string; kind: Account["kind"]; email: string; status: string; candidate_id: string | null; company_id: string | null; company_role: Account["companyRole"]; company_status: string | null }>();
  if (!row) return null;
  const t = now().getTime();
  if (row.status !== "active" || t > Date.parse(row.expires_at) || t - Date.parse(row.last_seen_at) > SESSION_IDLE_MS) {
    await db.prepare("DELETE FROM portal_sessions WHERE token_hash = ?").bind(hash).run();
    return null;
  }
  if (t - Date.parse(row.last_seen_at) > 5 * 60_000) await db.prepare("UPDATE portal_sessions SET last_seen_at = ? WHERE token_hash = ?").bind(nowIso(), hash).run();
  return { id: row.id, kind: row.kind, email: row.email, status: row.status, candidateId: row.candidate_id, companyId: row.company_id, companyRole: row.company_role, companyStatus: row.company_status };
}

export type Need = "candidate" | "company" | "company_owner" | "any";

/**
 * Why this account may not act in the given role, or null when it may.
 * A company user works only while the company is active: a suspended or closed
 * client loses its pipeline, candidate profiles and CV downloads at once.
 * ("applied" companies keep their sign-in so they can see the approval state.)
 */
export function accessProblem(account: Account, need: Need): { message: string; status: number; code: string } | null {
  if (account.kind === "company_user" && account.companyId && (account.companyStatus === "suspended" || account.companyStatus === "closed"))
    return { message: "This company account is not active. Contact Jobboard300.", status: 403, code: "COMPANY_INACTIVE" };
  if (need === "candidate" && (account.kind !== "candidate" || !account.candidateId)) return { message: "This is for candidate accounts.", status: 403, code: "CANDIDATE_ONLY" };
  if ((need === "company" || need === "company_owner") && (account.kind !== "company_user" || !account.companyId)) return { message: "This is for company accounts.", status: 403, code: "COMPANY_ONLY" };
  if (need === "company_owner" && account.companyRole !== "owner") return { message: "Only the company owner can do this.", status: 403, code: "OWNER_ONLY" };
  return null;
}

export async function endPortalSession(db: Db, token: string | null) {
  if (token) await db.prepare("DELETE FROM portal_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}
