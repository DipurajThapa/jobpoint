// Company onboarding, admin-approved matching parameters and JD approval gates.
// Nothing a company submits takes effect until the platform admin approves it.

import { audit, newId, nowIso, parseJson, PortalError, type Db } from "./db";
import { jdConflicts, sanitiseParams, type CompanyParams } from "./params";
import { parsePortalJd, sanitisePortalRequirements, type JdInput, type PortalRequirements } from "./jd";
import { assignPlan } from "./quota";

export async function applyCompany(db: Db, input: { accountId: string; legalName: string; displayName: string; city: string; website?: string; gstin?: string }) {
  const id = newId(), at = nowIso();
  await db.batch([
    db.prepare("INSERT INTO companies (id, legal_name, display_name, gstin, website, city, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'applied', ?)")
      .bind(id, input.legalName.trim().slice(0, 160), input.displayName.trim().slice(0, 120), (input.gstin ?? "").trim().toUpperCase().slice(0, 15), (input.website ?? "").trim().slice(0, 200), input.city.trim().slice(0, 80), at),
    db.prepare("INSERT INTO company_users (id, company_id, account_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)").bind(newId(), id, input.accountId, at),
  ]);
  return id;
}

export async function currentParams(db: Db, companyId: string): Promise<{ version: number; params: CompanyParams } | null> {
  const row = await db.prepare("SELECT version, params FROM company_parameters WHERE company_id = ? AND status = 'approved'").bind(companyId).first<{ version: number; params: string }>();
  return row ? { version: row.version, params: parseJson<CompanyParams>(row.params, null as unknown as CompanyParams) } : null;
}

/** Admin onboarding: approve the company with its first parameter set and the free plan. */
export async function activateCompany(db: Db, companyId: string, rawParams: unknown, adminId: string, planCode = "free") {
  const company = await db.prepare("SELECT status FROM companies WHERE id = ?").bind(companyId).first<{ status: string }>();
  if (!company) throw new PortalError("NOT_FOUND", "Company not found.", 404);
  if (company.status === "active") throw new PortalError("ALREADY_ACTIVE", "The company is already active.");
  const params = sanitiseParams(rawParams);
  if (typeof params === "string") throw new PortalError("INVALID_PARAMS", params);
  const at = nowIso();
  await db.batch([
    db.prepare("INSERT INTO company_parameters (id, company_id, version, params, status, requested_by, decided_by, decided_at, created_at) VALUES (?, ?, 1, ?, 'approved', ?, ?, ?, ?)")
      .bind(newId(), companyId, JSON.stringify(params), adminId, adminId, at, at),
    db.prepare("UPDATE companies SET status = 'active' WHERE id = ?").bind(companyId),
  ]);
  await assignPlan(db, companyId, planCode, adminId);
  await audit(db, adminId, "company.activated", "company", companyId, `params v1, plan ${planCode}`);
}

/** A company asks for different parameters. Nothing changes until the admin approves. */
export async function requestParamChange(db: Db, companyId: string, rawParams: unknown, userId: string) {
  const params = sanitiseParams(rawParams);
  if (typeof params === "string") throw new PortalError("INVALID_PARAMS", params);
  const open = await db.prepare("SELECT id FROM company_parameters WHERE company_id = ? AND status = 'requested'").bind(companyId).first();
  if (open) throw new PortalError("REQUEST_OPEN", "A parameter change is already waiting for approval.", 409);
  const max = await db.prepare("SELECT COALESCE(MAX(version), 0) AS v FROM company_parameters WHERE company_id = ?").bind(companyId).first<{ v: number }>();
  const id = newId();
  await db.prepare("INSERT INTO company_parameters (id, company_id, version, params, status, requested_by, created_at) VALUES (?, ?, ?, ?, 'requested', ?, ?)")
    .bind(id, companyId, (max?.v ?? 0) + 1, JSON.stringify(params), userId, nowIso()).run();
  return id;
}

/**
 * Admin decision on a parameter request. On approval the new version replaces
 * the old one; live JDs that still fit move to the new version and are queued
 * for rescoring, and JDs that no longer fit are paused for review.
 */
export async function decideParamRequest(db: Db, requestId: string, approve: boolean, adminId: string, note = "") {
  const req = await db.prepare("SELECT company_id, version, params, status FROM company_parameters WHERE id = ?").bind(requestId).first<{ company_id: string; version: number; params: string; status: string }>();
  if (!req || req.status !== "requested") throw new PortalError("NOT_PENDING", "This request is not waiting for a decision.", 409);
  const at = nowIso();
  if (!approve) {
    await db.prepare("UPDATE company_parameters SET status = 'rejected', decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ?").bind(adminId, at, note.slice(0, 500), requestId).run();
    await audit(db, adminId, "params.rejected", "company", req.company_id, `v${req.version}`);
    return { paused: [] as string[] };
  }
  await db.batch([
    db.prepare("UPDATE company_parameters SET status = 'superseded' WHERE company_id = ? AND status = 'approved'").bind(req.company_id),
    db.prepare("UPDATE company_parameters SET status = 'approved', decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ?").bind(adminId, at, note.slice(0, 500), requestId),
  ]);
  const params = parseJson<CompanyParams>(req.params, null as unknown as CompanyParams);
  const { results } = await db.prepare("SELECT id, requirements FROM jds WHERE company_id = ? AND status = 'live'").bind(req.company_id).all<{ id: string; requirements: string }>();
  const paused: string[] = [], statements = [];
  for (const jd of results) {
    const conflicts = jdConflicts(parseJson<PortalRequirements>(jd.requirements, null as unknown as PortalRequirements), params);
    if (conflicts.length) {
      paused.push(jd.id);
      statements.push(db.prepare("UPDATE jds SET status = 'paused', decision_note = ?, updated_at = ? WHERE id = ?").bind(`Paused: no longer fits approved parameters v${req.version}. ${conflicts.join(" ")}`.slice(0, 500), at, jd.id));
    } else statements.push(db.prepare("UPDATE jds SET params_version = ?, updated_at = ? WHERE id = ?").bind(req.version, at, jd.id));
    statements.push(enqueue(db, "jd", jd.id, "params_changed"));
  }
  if (statements.length) await db.batch(statements);
  await audit(db, adminId, "params.approved", "company", req.company_id, `v${req.version}; paused ${paused.length} JD(s)`);
  return { paused };
}

export const enqueue = (db: Db, kind: "candidate" | "jd", refId: string, reason: string) =>
  db.prepare("INSERT INTO score_queue (id, kind, ref_id, reason, enqueued_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(kind, ref_id) DO UPDATE SET reason = excluded.reason, enqueued_at = excluded.enqueued_at")
    .bind(newId(), kind, refId, reason, nowIso());

async function companyUserCheck(db: Db, companyId: string) {
  const company = await db.prepare("SELECT status FROM companies WHERE id = ?").bind(companyId).first<{ status: string }>();
  if (!company) throw new PortalError("NOT_FOUND", "Company not found.", 404);
  if (company.status !== "active") throw new PortalError("COMPANY_NOT_ACTIVE", "Your company account is not active yet.", 403);
}

export async function createJd(db: Db, companyId: string, userId: string, input: JdInput) {
  await companyUserCheck(db, companyId);
  if (!input.title.trim() || input.text.trim().length < 80) throw new PortalError("INVALID_JD", "Give a job title and a job description of at least 80 characters.");
  const requirements = parsePortalJd(input);
  const id = newId(), at = nowIso();
  await db.prepare("INSERT INTO jds (id, company_id, title, raw_text, requirements, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?)")
    .bind(id, companyId, input.title.trim().slice(0, 160), input.text.slice(0, 12_000), JSON.stringify(requirements), userId, at, at).run();
  return { id, requirements };
}

/** Company correction of parsed JD requirements. Editing a live JD sends it back for approval. */
export async function updateJdRequirements(db: Db, companyId: string, jdId: string, raw: unknown, userId: string) {
  const jd = await db.prepare("SELECT title, status FROM jds WHERE id = ? AND company_id = ?").bind(jdId, companyId).first<{ title: string; status: string }>();
  if (!jd) throw new PortalError("NOT_FOUND", "JD not found.", 404);
  if (jd.status === "closed") throw new PortalError("CLOSED", "This JD is closed.");
  const requirements = sanitisePortalRequirements(raw, jd.title);
  if (!requirements) throw new PortalError("INVALID_JD", "The requirements could not be read.");
  await db.prepare("UPDATE jds SET requirements = ?, status = CASE WHEN status IN ('live','pending','paused') THEN 'draft' ELSE status END, updated_at = ? WHERE id = ?")
    .bind(JSON.stringify(requirements), nowIso(), jdId).run();
  await audit(db, userId, "jd.edited", "jd", jdId, jd.status === "live" ? "was live; needs approval again" : "");
  return requirements;
}

export async function submitJd(db: Db, companyId: string, jdId: string, userId: string) {
  await companyUserCheck(db, companyId);
  const jd = await db.prepare("SELECT status, requirements FROM jds WHERE id = ? AND company_id = ?").bind(jdId, companyId).first<{ status: string; requirements: string }>();
  if (!jd) throw new PortalError("NOT_FOUND", "JD not found.", 404);
  if (!["draft", "rejected", "paused"].includes(jd.status)) throw new PortalError("BAD_STATE", "Only a draft, rejected or paused JD can be submitted.", 409);
  const current = await currentParams(db, companyId);
  if (!current) throw new PortalError("NO_PARAMS", "Your matching parameters are not approved yet.", 403);
  await db.prepare("UPDATE jds SET status = 'pending', updated_at = ? WHERE id = ?").bind(nowIso(), jdId).run();
  await audit(db, userId, "jd.submitted", "jd", jdId);
  return { conflicts: jdConflicts(parseJson<PortalRequirements>(jd.requirements, null as unknown as PortalRequirements), current.params) };
}

/** Admin approval. A JD that conflicts with the approved parameters cannot go live. */
export async function decideJd(db: Db, jdId: string, approve: boolean, adminId: string, note = "") {
  const jd = await db.prepare("SELECT company_id, status, requirements FROM jds WHERE id = ?").bind(jdId).first<{ company_id: string; status: string; requirements: string }>();
  if (!jd || jd.status !== "pending") throw new PortalError("NOT_PENDING", "This JD is not waiting for approval.", 409);
  const at = nowIso();
  if (!approve) {
    if (note.trim().length < 5) throw new PortalError("REASON_REQUIRED", "Give the company a reason for rejecting the JD.");
    await db.prepare("UPDATE jds SET status = 'rejected', decided_by = ?, decided_at = ?, decision_note = ?, updated_at = ? WHERE id = ?").bind(adminId, at, note.slice(0, 500), at, jdId).run();
    await audit(db, adminId, "jd.rejected", "jd", jdId);
    return { conflicts: [] as string[] };
  }
  const current = await currentParams(db, jd.company_id);
  if (!current) throw new PortalError("NO_PARAMS", "The company has no approved parameters.", 409);
  const conflicts = jdConflicts(parseJson<PortalRequirements>(jd.requirements, null as unknown as PortalRequirements), current.params);
  if (conflicts.length) throw new PortalError("CONFLICTS", `This JD does not fit the approved parameters: ${conflicts.join(" ")}`, 409);
  const live = await db.prepare("SELECT COUNT(*) AS n FROM jds WHERE company_id = ? AND status = 'live'").bind(jd.company_id).first<{ n: number }>();
  if ((live?.n ?? 0) >= current.params.maxLiveJds) throw new PortalError("LIVE_LIMIT", `The company already has ${live?.n} live JDs, its approved maximum.`, 409);
  await db.batch([
    db.prepare("UPDATE jds SET status = 'live', params_version = ?, decided_by = ?, decided_at = ?, decision_note = ?, updated_at = ? WHERE id = ?").bind(current.version, adminId, at, note.slice(0, 500), at, jdId),
    enqueue(db, "jd", jdId, "jd_approved"),
  ]);
  await audit(db, adminId, "jd.approved", "jd", jdId, `params v${current.version}`);
  return { conflicts };
}
