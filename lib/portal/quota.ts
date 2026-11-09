// Plans, subscriptions and the account-level unlock quota. Quota is a ledger:
// grants add, unlocks subtract one. An unlock of the same candidate by the same
// company is charged once, however many of its JDs the candidate matches.

import { audit, newId, now, nowIso, PortalError, type Db } from "./db";

export type PlanSeed = { code: string; name: string; unlockQuota: number; validityDays: number; priceInr: number | null; isFree?: boolean };

export async function upsertPlans(db: Db, plans: PlanSeed[]) {
  await db.batch(plans.map(p => db.prepare("INSERT INTO plans (id, code, name, unlock_quota, validity_days, price_inr, is_free, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?) ON CONFLICT(code) DO UPDATE SET name = excluded.name, unlock_quota = excluded.unlock_quota, validity_days = excluded.validity_days, price_inr = excluded.price_inr, is_free = excluded.is_free")
    .bind(newId(), p.code, p.name, p.unlockQuota, p.validityDays, p.priceInr, p.isFree ? 1 : 0, nowIso())));
}

/** Admin assigns a plan (payments are a stub in Phase 1). The free allowance is granted once per company. */
export async function assignPlan(db: Db, companyId: string, planCode: string, adminId: string) {
  const plan = await db.prepare("SELECT id, unlock_quota, validity_days, is_free FROM plans WHERE code = ? AND active = 1").bind(planCode).first<{ id: string; unlock_quota: number; validity_days: number; is_free: number }>();
  if (!plan) throw new PortalError("NO_PLAN", `Plan "${planCode}" does not exist.`, 404);
  if (plan.is_free) {
    const had = await db.prepare("SELECT 1 FROM company_subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.company_id = ? AND p.is_free = 1").bind(companyId).first();
    if (had) throw new PortalError("FREE_USED", "The free allowance has already been granted to this company.", 409);
  }
  const start = now(), end = new Date(start.getTime() + plan.validity_days * 86_400_000);
  const subId = newId(), at = nowIso();
  // A stub payment intent records what would be charged once payments exist.
  const intentId = plan.is_free ? null : newId();
  const statements = [
    db.prepare("INSERT INTO company_subscriptions (id, company_id, plan_id, quota_total, starts_at, ends_at, assigned_by, payment_intent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(subId, companyId, plan.id, plan.unlock_quota, start.toISOString(), end.toISOString(), adminId, intentId, at),
    db.prepare("INSERT INTO quota_ledger (id, company_id, subscription_id, delta, reason, note, created_by, created_at) VALUES (?, ?, ?, ?, 'grant', ?, ?, ?)")
      .bind(newId(), companyId, subId, plan.unlock_quota, `Plan ${planCode}`, adminId, at),
  ];
  if (intentId) statements.push(db.prepare("INSERT INTO payment_intents (id, payer_kind, payer_id, purpose, ref_id, amount_inr, status, created_at) SELECT ?, 'company', ?, 'plan', ?, COALESCE(price_inr, 0), 'stub', ? FROM plans WHERE id = ?").bind(intentId, companyId, subId, at, plan.id));
  await db.batch(statements);
  await audit(db, adminId, "plan.assigned", "company", companyId, planCode);
  return subId;
}

export async function adjustQuota(db: Db, companyId: string, delta: number, note: string, adminId: string) {
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1000) throw new PortalError("INVALID", "Adjustment must be a whole number between -1000 and 1000.");
  if (note.trim().length < 5) throw new PortalError("REASON_REQUIRED", "Give a reason for the adjustment.");
  const sub = await activeSubscriptions(db, companyId);
  if (!sub.length) throw new PortalError("NO_SUBSCRIPTION", "The company has no active plan to adjust.", 409);
  const target = sub[sub.length - 1];
  if (delta < 0 && target.remaining + delta < 0) throw new PortalError("INVALID", "The adjustment would make the remaining quota negative.");
  await db.prepare("INSERT INTO quota_ledger (id, company_id, subscription_id, delta, reason, note, created_by, created_at) VALUES (?, ?, ?, ?, 'adjustment', ?, ?, ?)")
    .bind(newId(), companyId, target.id, delta, note.slice(0, 300), adminId, nowIso()).run();
  await audit(db, adminId, "quota.adjusted", "company", companyId, `${delta}: ${note}`);
}

type SubRow = { id: string; plan: string; ends_at: string; quota_total: number; remaining: number };

export async function activeSubscriptions(db: Db, companyId: string): Promise<SubRow[]> {
  const at = nowIso();
  const { results } = await db.prepare(`SELECT s.id, p.name AS plan, s.ends_at, s.quota_total, COALESCE((SELECT SUM(delta) FROM quota_ledger l WHERE l.subscription_id = s.id), 0) AS remaining
    FROM company_subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.company_id = ? AND s.starts_at <= ? AND s.ends_at > ? ORDER BY s.ends_at ASC`).bind(companyId, at, at).all<SubRow>();
  return results;
}

export async function quotaStatus(db: Db, companyId: string) {
  const subs = await activeSubscriptions(db, companyId);
  const used = await db.prepare("SELECT COUNT(*) AS n FROM unlocks WHERE company_id = ?").bind(companyId).first<{ n: number }>();
  return {
    remaining: subs.reduce((s, x) => s + Math.max(0, x.remaining), 0),
    plans: subs.map(s => ({ plan: s.plan, remaining: s.remaining, total: s.quota_total, endsAt: s.ends_at })),
    unlockedTotal: used?.n ?? 0,
  };
}

export type UnlockResult = { unlockId: string; charged: boolean; traceId: string; remaining: number };

/**
 * Unlock a released candidate for a company. Atomic and idempotent:
 * - already unlocked by this company (any JD) -> no charge;
 * - otherwise the unlock row and the -1 ledger entry are written in one
 *   transaction, and only if the chosen subscription still has quota.
 */
export async function unlockCandidate(db: Db, args: { companyId: string; userId: string; candidateRef: string; jdId: string; ipHash?: string }): Promise<UnlockResult> {
  const { companyId, userId, candidateRef, jdId } = args;
  const company = await db.prepare("SELECT status FROM companies WHERE id = ?").bind(companyId).first<{ status: string }>();
  if (company?.status !== "active") throw new PortalError("COMPANY_NOT_ACTIVE", "Your company account is not active.", 403);
  const existing = await db.prepare("SELECT id, trace_id, access_revoked_at FROM unlocks WHERE company_id = ? AND candidate_ref = ?").bind(companyId, candidateRef).first<{ id: string; trace_id: string; access_revoked_at: string | null }>();
  if (existing) {
    if (existing.access_revoked_at) throw new PortalError("CONSENT_WITHDRAWN", "The candidate has withdrawn consent; this profile is no longer available.", 410);
    return { unlockId: existing.id, charged: false, traceId: existing.trace_id, remaining: (await quotaStatus(db, companyId)).remaining };
  }
  // The candidate must be currently released to this company for the JD named.
  const release = await db.prepare(`SELECT r.candidate_id FROM releases r JOIN jds j ON j.id = r.jd_id WHERE r.company_id = ? AND r.candidate_ref = ? AND r.jd_id = ? AND r.revoked_at IS NULL AND j.company_id = ?`)
    .bind(companyId, candidateRef, jdId, companyId).first<{ candidate_id: string }>();
  if (!release) throw new PortalError("NOT_RELEASED", "This profile is not available to your company.", 404);
  const subs = (await activeSubscriptions(db, companyId)).filter(s => s.remaining > 0);
  if (!subs.length) throw new PortalError("QUOTA_EXHAUSTED", "Your unlock quota is used up or your plan has expired. Upgrade your plan to unlock more profiles.", 402);
  const sub = subs[0];
  const unlockId = newId(), traceId = newId().replace(/-/g, "").slice(0, 12).toUpperCase(), at = nowIso();
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO unlocks (id, company_id, candidate_id, candidate_ref, first_jd_id, unlocked_by, subscription_id, trace_id, unlocked_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM unlocks WHERE company_id = ? AND candidate_id = ?)
        AND (SELECT COALESCE(SUM(delta), 0) FROM quota_ledger WHERE subscription_id = ?) > 0`)
      .bind(unlockId, companyId, release.candidate_id, candidateRef, jdId, userId, sub.id, traceId, at, companyId, release.candidate_id, sub.id),
    db.prepare(`INSERT INTO quota_ledger (id, company_id, subscription_id, delta, reason, unlock_id, created_by, created_at)
      SELECT ?, ?, ?, -1, 'unlock', ?, ?, ? WHERE EXISTS (SELECT 1 FROM unlocks WHERE id = ?)`).bind(newId(), companyId, sub.id, unlockId, userId, at, unlockId),
    db.prepare(`UPDATE portal_applications SET status = 'viewed', updated_at = ? WHERE candidate_id = ? AND status IN ('applied','released') AND jd_id IN (SELECT id FROM jds WHERE company_id = ?)`).bind(at, release.candidate_id, companyId),
    db.prepare("INSERT INTO access_log (id, actor_kind, actor_id, company_id, action, jd_id, candidate_ref, ip_hash, at) SELECT ?, 'company_user', ?, ?, 'unlock', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM unlocks WHERE id = ?)")
      .bind(newId(), userId, companyId, jdId, candidateRef, args.ipHash ?? "", at, unlockId),
  ]);
  const row = await db.prepare("SELECT id, trace_id FROM unlocks WHERE company_id = ? AND candidate_id = ?").bind(companyId, release.candidate_id).first<{ id: string; trace_id: string }>();
  if (!row) throw new PortalError("QUOTA_EXHAUSTED", "Your unlock quota is used up. Upgrade your plan to unlock more profiles.", 402);
  return { unlockId: row.id, charged: row.id === unlockId, traceId: row.trace_id, remaining: (await quotaStatus(db, companyId)).remaining };
}
