// Data inventory: how many rows each table holds, grouped by the merge in
// docs/WORKFLOWS_AND_MERGE_PLAN.md that would move or retire it. Counts only:
// no names, emails or other personal data leave the database. Read-only.

type Stmt = { first<T = Record<string, unknown>>(): Promise<T | null> };
type Db = { prepare(sql: string): Stmt };

export type InventoryLine = { label: string; table: string; rows: number | null };
export type InventoryGroup = { merge: string; title: string; lines: InventoryLine[] };

// [label, table, optional WHERE clause]. Table names are fixed here, never taken from a request.
const PLAN: { merge: string; title: string; lines: [string, string, string?][] }[] = [
  { merge: "1", title: "One person record", lines: [
    ["Website applications", "applications"],
    ["Website applications not yet in the candidate list", "applications", "NOT EXISTS (SELECT 1 FROM candidate_sources s WHERE s.kind = 'website_application' AND s.ref_id = applications.id)"],
    ["Candidate records (all)", "candidates"],
    ["Candidate records with a portal account", "candidates", "account_id IS NOT NULL AND status NOT IN ('merged','deleted')"],
    ["Candidate records from the website only", "candidates", "account_id IS NULL AND status NOT IN ('merged','deleted')"],
    ["Website-only records whose email matches a verified portal account", "candidates", `account_id IS NULL AND status = 'active' AND dedupe_email_hash != '' AND EXISTS (
      SELECT 1 FROM candidates p JOIN portal_accounts a ON a.id = p.account_id WHERE p.dedupe_email_hash = candidates.dedupe_email_hash AND p.status = 'active' AND a.email_verified_at IS NOT NULL)`],
    ["Possible duplicates waiting for review", "duplicate_flags", "status = 'open'"],
  ] },
  { merge: "2", title: "One vacancy record and one pipeline", lines: [
    ["Public roles (all)", "jobs"],
    ["Public roles, published", "jobs", "status = 'published'"],
    ["Client jobs (all)", "jds"],
    ["Client jobs, live", "jds", "status = 'live'"],
    ["Website applications moved past 'new' in the owner console", "applications", "status != 'new'"],
    ["Website applications with recruiter notes", "applications", "recruiter_notes != ''"],
    ["CV screening (retired): role requirement profiles", "retired_ats_job_profiles"],
    ["CV screening (retired): results", "retired_ats_screenings"],
    ["Website roles without a vacancy record yet", "jobs", "NOT EXISTS (SELECT 1 FROM jds d WHERE d.id = jobs.id)"],
    ["Portal 'apply to a client job' records", "portal_applications"],
    ["Pipeline entries", "pipeline"],
  ] },
  { merge: "3", title: "Self-service mode (browse and unlock)", lines: [
    ["Anonymous releases", "releases"],
    ["Unlocks", "unlocks"],
    ["Plans", "plans"],
    ["Client subscriptions", "company_subscriptions"],
    ["Quota ledger entries", "quota_ledger"],
    ["Quota ledger entries for an unlock", "quota_ledger", "reason = 'unlock'"],
    ["Parameter change requests waiting", "company_parameters", "status = 'requested'"],
  ] },
  { merge: "4", title: "First test system (retired, kept until counted)", lines: [
    ["Tests", "retired_assessments"],
    ["Questions", "retired_assessment_items"],
    ["Attempts", "retired_assessment_attempts"],
    ["Attempts submitted (real results)", "retired_assessment_attempts", "status = 'submitted'"],
    ["Answers", "retired_assessment_responses"],
    ["Adaptive tests taken (kept)", "adaptive_tests"],
  ] },
  { merge: "5", title: "Services catalogue and orders (retired, kept until counted)", lines: [
    ["Services", "retired_services"],
    ["Services switched on", "retired_services", "active = 1"],
    ["Service orders", "retired_service_orders"],
    ["Service enrolments", "retired_service_enrolments"],
    ["Payment records", "retired_payment_intents"],
    ["Payment records marked paid", "retired_payment_intents", "status = 'paid'"],
    ["Fast Track orders (kept)", "orders", "kind = 'fast_track'"],
  ] },
  { merge: "6", title: "Employers", lines: [
    ["Employer enquiries", "employer_enquiries"],
    ["Employer enquiries linked to a client", "employer_enquiries", "company_id IS NOT NULL"],
    ["Clients", "companies"],
    ["Clients linked to an Email Kit organisation", "companies", "email_kit_org_id IS NOT NULL"],
    ["Email Kit organisations", "email_kit_records", "tbl = 'orgs'"],
    ["Email Kit contacts", "email_kit_records", "tbl = 'contacts'"],
  ] },
  { merge: "7", title: "Messages and logs", lines: [
    ["Audit log: changes", "audit_events", "kind = 'change'"],
    ["Audit log: views (the former access log)", "audit_events", "kind = 'access'"],
    ["Candidate inbox messages", "messages", "recipient_kind = 'candidate' AND channel = 'inbox'"],
    ["Client notices", "messages", "recipient_kind = 'company' AND channel = 'inbox'"],
    ["Outbound message queue", "messages", "channel != 'inbox'"],
  ] },
];

/** Row counts for every table a merge touches. A table that no longer exists reports `null`. */
export async function dataInventory(db: Db): Promise<{ takenAt: string; groups: InventoryGroup[] }> {
  const groups: InventoryGroup[] = [];
  for (const group of PLAN) {
    const lines: InventoryLine[] = [];
    for (const [label, table, where] of group.lines) {
      let rows: number | null = null;
      try { rows = Number((await db.prepare(`SELECT COUNT(*) AS n FROM ${table}${where ? ` WHERE ${where}` : ""}`).first<{ n: number }>())?.n ?? 0); }
      catch { rows = null; }
      lines.push({ label, table, rows });
    }
    groups.push({ merge: group.merge, title: group.title, lines });
  }
  return { takenAt: new Date().toISOString(), groups };
}

/** The same inventory as plain text, for pasting into a message. */
export function inventoryText(inv: { takenAt: string; groups: InventoryGroup[] }) {
  return [`Jobboard300 data inventory, ${inv.takenAt}`, ...inv.groups.flatMap(g => ["", `Merge ${g.merge}: ${g.title}`, ...g.lines.map(l => `  ${l.label}: ${l.rows ?? "table removed"}`)])].join("\n");
}
