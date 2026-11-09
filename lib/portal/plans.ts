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
