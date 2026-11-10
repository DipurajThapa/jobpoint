// One vacancy record (merge 2). A vacancy is a client job (`jds`). A role shown
// on the public website is the same vacancy: its website listing (`jobs`:
// location, sector, salary text, the wording candidates read) carries the same
// id as the client job. So a role posted in the owner console and the job a
// recruiter works in the Recruiting tool are one record, and an application made
// on the website enters that job's shortlist and pipeline.
//
// A role that belongs to no client is held by a house client, "Jobboard300".

import { audit, newId, nowIso, PortalError, type Db } from "./db";
import { activateCompany, enqueue } from "./company";
import { parsePortalJd } from "./jd";
import { ROLE_FAMILIES } from "./roles";
import { SENIORITY_ORDER } from "./india";

export const HOUSE_CLIENT_ID = "house-jobboard300";

// The house client accepts any role: every family, level and city.
const HOUSE_PARAMS = { minScore: 40, roleFamilies: ROLE_FAMILIES.map(r => r.id), seniority: [...SENIORITY_ORDER], cities: [], allowRemote: true, ctcBands: [], maxNoticeDays: null, mandatoryFilters: [], maxReleasePerJd: 200, maxLiveJds: 100 };

export type RoleListing = { id: string; title: string; location: string; workMode?: string | null; description: string; requirements?: string | null; status: string };

/** The house client that holds roles belonging to no client. Created on first use. */
export async function ensureHouseClient(db: Db, actor: string): Promise<string> {
  const row = await db.prepare("SELECT status FROM companies WHERE id = ?").bind(HOUSE_CLIENT_ID).first<{ status: string }>();
  if (row?.status === "active") return HOUSE_CLIENT_ID;
  if (!row) await db.prepare("INSERT OR IGNORE INTO companies (id, legal_name, display_name, city, status, notes, created_at) VALUES (?, 'Jobboard300', 'Jobboard300', '', 'applied', 'House client: holds website roles that belong to no client.', ?)").bind(HOUSE_CLIENT_ID, nowIso()).run();
  if (row && row.status !== "applied") throw new PortalError("COMPANY_NOT_ACTIVE", "The house client (Jobboard300) is suspended. Reactivate it under Job portal → Companies first.");
  await activateCompany(db, HOUSE_CLIENT_ID, HOUSE_PARAMS, actor);
  return HOUSE_CLIENT_ID;
}

const jdStatusFor = (roleStatus: string, current?: string) => roleStatus === "published" ? "live" : roleStatus === "closed" ? "closed" : current === "live" || current === "paused" ? "paused" : "draft";

/** The wording a recruiter and the matcher read: the listing's description and requirements together. */
function jdText(role: RoleListing) {
  const text = [role.description.trim(), role.requirements?.trim() ? `Requirements: ${role.requirements.trim()}` : "", `Location: ${role.location}.`].filter(Boolean).join("\n");
  return text.length >= 80 ? text : `${text}\nRole: ${role.title}. Apply on the Jobboard300 website with your CV.`;
}

/**
 * Make sure the website role has its vacancy record: a client job with the same
 * id, under the chosen client or the house client. Returns the client it is under.
 */
export async function vacancyForRole(db: Db, role: RoleListing, actor: string, companyId?: string | null): Promise<{ companyId: string; created: boolean }> {
  const existing = await db.prepare("SELECT company_id, status FROM jds WHERE id = ?").bind(role.id).first<{ company_id: string; status: string }>();
  if (existing) return { companyId: existing.company_id, created: false };
  let client = companyId || "";
  if (client && client !== HOUSE_CLIENT_ID) {
    const company = await db.prepare("SELECT status FROM companies WHERE id = ?").bind(client).first<{ status: string }>();
    if (company?.status !== "active") throw new PortalError("COMPANY_NOT_ACTIVE", "Choose an active client, or leave the role with Jobboard300.");
  } else client = await ensureHouseClient(db, actor);
  const text = jdText(role), at = nowIso(), status = jdStatusFor(role.status);
  const requirements = parsePortalJd({ title: role.title, text, location: role.location, workMode: role.workMode ?? undefined });
  await db.batch([
    db.prepare("INSERT INTO jds (id, company_id, title, raw_text, requirements, status, service, decided_by, decided_at, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'managed', ?, ?, ?, ?, ?)")
      .bind(role.id, client, role.title.slice(0, 160), text.slice(0, 12_000), JSON.stringify(requirements), status, status === "live" ? actor : null, status === "live" ? at : null, actor, at, at),
    ...(status === "live" ? [enqueue(db, "jd", role.id, "website_role")] : []),
  ]);
  await audit(db, actor, "vacancy.created", "jd", role.id, `website role; client ${client}`);
  return { companyId: client, created: true };
}

/** The owner published, unpublished or closed a website role: its vacancy record follows. */
export async function syncRoleStatus(db: Db, roleId: string, roleStatus: string, actor: string) {
  const jd = await db.prepare("SELECT status FROM jds WHERE id = ?").bind(roleId).first<{ status: string }>();
  if (!jd) return false;
  const next = jdStatusFor(roleStatus, jd.status);
  if (next === jd.status) return true;
  const at = nowIso();
  await db.batch([
    db.prepare("UPDATE jds SET status = ?, decided_by = CASE WHEN ? = 'live' THEN ? ELSE decided_by END, decided_at = CASE WHEN ? = 'live' THEN ? ELSE decided_at END, updated_at = ? WHERE id = ?").bind(next, next, actor, next, at, at, roleId),
    ...(next === "live" ? [enqueue(db, "jd", roleId, "website_role")] : []),
  ]);
  await audit(db, actor, "vacancy.status", "jd", roleId, `${jd.status} to ${next}`);
  return true;
}

/** Website roles that have no vacancy record yet (roles posted before merge 2). Creates up to `limit` of them. */
export async function backfillVacancies(db: Db, actor: string, limit = 25): Promise<number> {
  const { results } = await db.prepare(`SELECT j.id, j.title, j.location, j.work_mode AS workMode, j.description, j.requirements, j.status FROM jobs j
    WHERE NOT EXISTS (SELECT 1 FROM jds d WHERE d.id = j.id) ORDER BY j.created_at LIMIT ?`).bind(limit).all<RoleListing>();
  for (const role of results) await vacancyForRole(db, role, actor);
  return results.length;
}

/**
 * A website application to a role is an application to that vacancy: it is
 * recorded against the client job so the recruiter sees the person in the job's
 * shortlist as "applied on the website". Nothing is shared with a client by this.
 */
export async function recordRoleApplication(db: Db, candidateId: string, roleId: string, applicationId: string) {
  const jd = await db.prepare("SELECT status FROM jds WHERE id = ?").bind(roleId).first<{ status: string }>();
  if (!jd) return false;
  const at = nowIso();
  await db.batch([
    db.prepare("INSERT INTO portal_applications (id, candidate_id, jd_id, status, created_at, updated_at) VALUES (?, ?, ?, 'applied', ?, ?) ON CONFLICT(candidate_id, jd_id) DO UPDATE SET status = CASE WHEN portal_applications.status = 'withdrawn' THEN 'applied' ELSE portal_applications.status END, updated_at = excluded.updated_at")
      .bind(newId(), candidateId, roleId, at, at),
    db.prepare("INSERT INTO portal_application_events (id, application_id, status, actor, note, at) SELECT ?, id, 'applied', 'website', ?, ? FROM portal_applications WHERE candidate_id = ? AND jd_id = ?").bind(newId(), `website application ${applicationId}`.slice(0, 200), at, candidateId, roleId),
  ]);
  return true;
}

/** Did this person tick "share my CV with the employer for this role" on the website form for this vacancy? */
export async function sharedForRole(db: Db, candidateId: string, roleId: string): Promise<boolean> {
  return !!await db.prepare(`SELECT 1 AS x FROM applications a JOIN candidate_sources s ON s.kind = 'website_application' AND s.ref_id = a.id
    WHERE s.candidate_id = ? AND a.job_id = ? AND a.share_consent = 1 LIMIT 1`).bind(candidateId, roleId).first();
}
