// Default plans, from research on Indian job-portal pricing (docs/PORTAL_PHASE1_PLAN.md):
// a one-time free allowance plus three tiers priced between Naukri Resdex Lite
// (~₹40 per CV) and Indeed India (~₹330 per contact). Prices exclude GST and
// are indicative; the admin can change them. Payments are a stub in Phase 1.
import type { PlanSeed } from "./quota";

export const DEFAULT_PLANS: PlanSeed[] = [
  { code: "free", name: "Free allowance", unlockQuota: 5, validityDays: 30, priceInr: 0, isFree: true },
  { code: "starter", name: "Starter", unlockQuota: 100, validityDays: 90, priceInr: 7999 },
  { code: "growth", name: "Growth", unlockQuota: 250, validityDays: 180, priceInr: 17999 },
  { code: "pro", name: "Pro", unlockQuota: 500, validityDays: 365, priceInr: 29999 },
];

/**
 * Future candidate services (Phase 2). Seeded inactive with no price: the data
 * model (services → service_orders → service_enrolments, payment_intents) is
 * ready, but there are no service screens or payment flow in Phase 1.
 */
export const DEFAULT_SERVICES = [
  { code: "cv-writing", category: "cv_writing", name: "Professional CV writing", deliveryMode: "online", durationDays: 7 },
  { code: "linkedin-optimisation", category: "linkedin_optimisation", name: "LinkedIn profile optimisation", deliveryMode: "online", durationDays: 5 },
  { code: "spoken-english", category: "spoken_english", name: "Spoken English course", deliveryMode: "hybrid", durationDays: 60 },
  { code: "tally-gst-training", category: "technical_training", name: "Tally Prime and GST training", deliveryMode: "hybrid", durationDays: 45 },
] as const;

export async function seedServices(db: import("./db").Db) {
  const { newId, nowIso } = await import("./db");
  await db.batch(DEFAULT_SERVICES.map(s => db.prepare("INSERT OR IGNORE INTO services (id, code, category, name, delivery_mode, duration_days, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)")
    .bind(newId(), s.code, s.category, s.name, s.deliveryMode, s.durationDays, nowIso())));
}
