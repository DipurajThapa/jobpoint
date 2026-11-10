// Data inventory: how many rows the main tables hold, grouped by the areas of
// docs/WORKFLOWS_AND_MERGE_PLAN.md (the merges are done). Counts only:
// no names, emails or other personal data leave the database. Read-only.

type Stmt = { first<T = Record<string, unknown>>(): Promise<T | null> };
type Db = { prepare(sql: string): Stmt };

export type InventoryLine = { label: string; table: string; rows: number | null };
export type InventoryGroup = { merge: string; title: string; lines: InventoryLine[] };

// [label, table, optional WHERE clause]. Table names are fixed here, never taken from a request.
const PLAN: { merge: string; title: string; lines: [string, string, string?][] }[] = [
  { merge: "1", title: "People", lines: [
    ["Candidate records (all)", "candidates"],
    ["Candidate records with a portal account", "candidates", "account_id IS NOT NULL AND status NOT IN ('merged','deleted')"],
    ["Candidate records from the website only", "candidates", "account_id IS NULL AND status NOT IN ('merged','deleted')"],
    ["Live candidate records with no email on the record", "candidates", "status IN ('active','review') AND email = ''"],
    ["Live candidate records with no phone on the record", "candidates", "status IN ('active','review') AND phone = ''"],
    ["Website applications", "applications"],
    ["Website applications not yet in the candidate list", "applications", "NOT EXISTS (SELECT 1 FROM candidate_sources s WHERE s.kind = 'website_application' AND s.ref_id = applications.id)"],
    ["Possible duplicates waiting for review", "duplicate_flags", "status = 'open'"],
  ] },
  { merge: "2", title: "Vacancies and pipeline", lines: [
    ["Website roles (all)", "jobs"],
    ["Website roles, published", "jobs", "status = 'published'"],
    ["Website roles without a vacancy record yet", "jobs", "NOT EXISTS (SELECT 1 FROM jds d WHERE d.id = jobs.id)"],
    ["Client jobs (all)", "jds"],
    ["Client jobs, live", "jds", "status = 'live'"],
    ["Applications to a job", "portal_applications"],
    ["Pipeline entries", "pipeline"],
    ["Placements", "placements"],
  ] },
  { merge: "3", title: "Candidates shared with clients", lines: [
    ["Submissions to a client (releases)", "releases"],
    ["Client access records (unlocks)", "unlocks"],
  ] },
  { merge: "4", title: "Tests", lines: [
    ["Question banks", "question_banks"],
    ["Adaptive tests taken", "adaptive_tests"],
  ] },
  { merge: "5", title: "Orders", lines: [
    ["Orders (all)", "orders"],
    ["Fast Track orders", "orders", "kind = 'fast_track'"],
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
  return [`Jobboard300 data inventory, ${inv.takenAt}`, ...inv.groups.flatMap(g => ["", `${g.merge}. ${g.title}`, ...g.lines.map(l => `  ${l.label}: ${l.rows ?? "table removed"}`)])].join("\n");
}
