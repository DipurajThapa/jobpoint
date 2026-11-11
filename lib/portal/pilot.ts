// Pilot evidence: the numbers an investor asks for, recorded where the work happens.
// - A signed employer mandate per client, and the person at the employer who authorised each vacancy.
//   Only authorised vacancies of mandated clients can be published on the website.
// - Invoices and collections per placement; recruiter time and direct costs per job.
// - A weekly funnel (prospects → mandates → qualified candidates → shortlists accepted → interviews → joins →
//   invoices → collections), lead sources, unit economics per placement, and a readiness checklist.

import { audit, newId, nowIso, PortalError, type Db } from "./db";
import { HOUSE_CLIENT_ID } from "./vacancy";

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const today = () => nowIso().slice(0, 10);
const notFuture = (d: string, what: string) => { if (d > today()) throw new PortalError("DATE", `${what} cannot be in the future.`); };

// ---------------------------------------------------------------- mandates and vacancy authorisation

export async function setMandate(db: Db, companyId: string, signedOn: string | null, reference: string, actor: string) {
  if (signedOn !== null) { if (!isDate(signedOn)) throw new PortalError("DATE", "Enter the date the mandate was signed."); notFuture(signedOn, "The signing date"); }
  if (signedOn && reference.trim().length < 3) throw new PortalError("REFERENCE", "Enter where the signed mandate is kept (file name, e-sign reference or email subject).");
  const r = await db.prepare("UPDATE companies SET mandate_signed_on = ?, mandate_reference = ? WHERE id = ?").bind(signedOn, reference.trim().slice(0, 200), companyId).run();
  if (!r.meta.changes) throw new PortalError("NOT_FOUND", "Client not found.", 404);
  await audit(db, actor, signedOn ? "client.mandate_signed" : "client.mandate_cleared", "company", companyId, signedOn ?? "");
}

export async function authoriseVacancy(db: Db, jdId: string, by: string, on: string, actor: string) {
  if (by.trim().length < 3) throw new PortalError("AUTHORISED_BY", "Name the person at the employer who authorised this vacancy, and their role.");
  if (!isDate(on)) throw new PortalError("DATE", "Enter the date the employer authorised this vacancy.");
  notFuture(on, "The authorisation date");
  const r = await db.prepare("UPDATE jds SET authorised_by = ?, authorised_on = ? WHERE id = ?").bind(by.trim().slice(0, 160), on, jdId).run();
  if (!r.meta.changes) throw new PortalError("NOT_FOUND", "Vacancy not found.", 404);
  await audit(db, actor, "jd.authorised", "jd", jdId, on);
}

/** Why this vacancy may not be published on the website yet, or null. */
export async function publishProblem(db: Db, jdId: string): Promise<string | null> {
  const row = await db.prepare("SELECT j.company_id, j.authorised_by, j.authorised_on, c.mandate_signed_on, c.display_name FROM jds j JOIN companies c ON c.id = j.company_id WHERE j.id = ?").bind(jdId)
    .first<{ company_id: string; authorised_by: string; authorised_on: string | null; mandate_signed_on: string | null; display_name: string }>();
  if (!row) return "This role has no vacancy record yet.";
  if (row.company_id === HOUSE_CLIENT_ID) return "Only vacancies an employer has authorised are published. Choose the client this role is for.";
  if (!row.mandate_signed_on) return `${row.display_name} has no signed mandate recorded. Record it under Job portal → Clients first.`;
  if (!row.authorised_by || !row.authorised_on) return "Record who at the employer authorised this vacancy, and when.";
  return null;
}

// ---------------------------------------------------------------- invoices and collections

export async function recordInvoice(db: Db, placementId: string, input: { invoiceNumber: string; invoicedOn: string }, actor: string) {
  if (!input.invoiceNumber.trim()) throw new PortalError("INVOICE", "Enter the invoice number.");
  if (!isDate(input.invoicedOn)) throw new PortalError("DATE", "Enter the invoice date.");
  notFuture(input.invoicedOn, "The invoice date");
  const r = await db.prepare("UPDATE placements SET invoice_number = ?, invoiced_on = ? WHERE id = ?").bind(input.invoiceNumber.trim().slice(0, 60), input.invoicedOn, placementId).run();
  if (!r.meta.changes) throw new PortalError("NOT_FOUND", "Placement not found.", 404);
  await audit(db, actor, "placement.invoiced", "placement", placementId, input.invoiceNumber);
}

export async function recordCollection(db: Db, placementId: string, input: { collectedOn: string; amountInr: number }, actor: string) {
  if (!isDate(input.collectedOn)) throw new PortalError("DATE", "Enter the date the money arrived.");
  notFuture(input.collectedOn, "The collection date");
  const amount = Math.round(Number(input.amountInr));
  if (!(amount >= 0 && amount <= 10_000_000)) throw new PortalError("AMOUNT", "Enter the amount received in rupees.");
  const p = await db.prepare("SELECT invoiced_on FROM placements WHERE id = ?").bind(placementId).first<{ invoiced_on: string | null }>();
  if (!p) throw new PortalError("NOT_FOUND", "Placement not found.", 404);
  if (!p.invoiced_on) throw new PortalError("NOT_INVOICED", "Record the invoice before the payment.");
  await db.prepare("UPDATE placements SET collected_on = ?, collected_inr = ? WHERE id = ?").bind(input.collectedOn, amount, placementId).run();
  await audit(db, actor, "placement.collected", "placement", placementId, `${amount}`);
}

// ---------------------------------------------------------------- recruiter time and direct costs

export const ACTIVITIES = ["sourcing", "screening", "calls", "interview_coordination", "offer_and_joining", "client_meeting", "admin"] as const;
export const COST_KINDS = ["job_ads", "sourcing_tools", "messaging", "travel", "other"] as const;

export async function logWork(db: Db, staffId: string, input: { jdId?: string; minutes: number; activity: string; note?: string; workedOn?: string }) {
  const minutes = Math.round(Number(input.minutes));
  if (!(minutes >= 5 && minutes <= 960)) throw new PortalError("MINUTES", "Enter between 5 minutes and 16 hours.");
  if (!(ACTIVITIES as readonly string[]).includes(input.activity)) throw new PortalError("ACTIVITY", "Choose what the time was spent on.");
  const day = input.workedOn || today();
  if (!isDate(day)) throw new PortalError("DATE", "Enter the day the work was done.");
  notFuture(day, "The day");
  const jd = input.jdId ? await db.prepare("SELECT company_id FROM jds WHERE id = ?").bind(input.jdId).first<{ company_id: string }>() : null;
  if (input.jdId && !jd) throw new PortalError("NOT_FOUND", "Job not found.", 404);
  await db.prepare("INSERT INTO work_log (id, staff_id, company_id, jd_id, minutes, activity, note, worked_on, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(newId(), staffId, jd?.company_id ?? null, input.jdId || null, minutes, input.activity, (input.note ?? "").trim().slice(0, 300), day, nowIso()).run();
}

export async function logCost(db: Db, input: { jdId?: string; kind: string; amountInr: number; note?: string; spentOn?: string }, actor: string) {
  const amount = Math.round(Number(input.amountInr));
  if (!(amount > 0 && amount <= 10_000_000)) throw new PortalError("AMOUNT", "Enter the amount in rupees.");
  if (!(COST_KINDS as readonly string[]).includes(input.kind)) throw new PortalError("KIND", "Choose what the money was spent on.");
  const day = input.spentOn || today();
  if (!isDate(day)) throw new PortalError("DATE", "Enter the date.");
  notFuture(day, "The date");
  const jd = input.jdId ? await db.prepare("SELECT company_id FROM jds WHERE id = ?").bind(input.jdId).first<{ company_id: string }>() : null;
  await db.prepare("INSERT INTO cost_log (id, company_id, jd_id, kind, amount_inr, note, spent_on, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(newId(), jd?.company_id ?? null, input.jdId || null, input.kind, amount, (input.note ?? "").trim().slice(0, 300), day, actor, nowIso()).run();
}

/** What an hour of recruiter time costs (salary and overheads), for contribution per placement. Default ₹400. */
export async function hourlyCost(db: Db) {
  const v = Number((await db.prepare("SELECT value FROM pilot_settings WHERE key = 'recruiter_hourly_cost_inr'").first<{ value: string }>())?.value ?? 400);
  return Number.isFinite(v) && v >= 0 ? v : 400;
}
export async function setHourlyCost(db: Db, inr: number, actor: string) {
  const v = Math.round(Number(inr));
  if (!(v >= 0 && v <= 100_000)) throw new PortalError("AMOUNT", "Enter the hourly cost in rupees.");
  await db.prepare("INSERT INTO pilot_settings (key, value, updated_at) VALUES ('recruiter_hourly_cost_inr', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(String(v), nowIso()).run();
  await audit(db, actor, "pilot.hourly_cost", "settings", "recruiter_hourly_cost_inr", String(v));
}

// ---------------------------------------------------------------- reports

/** Monday (IST) of the week a timestamp or date falls in, as YYYY-MM-DD. */
export function weekOf(value: string) {
  const iso = value.length === 10 ? `${value}T00:00:00Z` : value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const ist = new Date(Date.parse(iso) + 5.5 * 3_600_000);
  const dow = (ist.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - dow)).toISOString().slice(0, 10);
}

export type FunnelWeek = { week: string; prospects: number; mandates: number; vacanciesAuthorised: number; candidatesSubmitted: number; shortlistsAccepted: number; interviews: number; offers: number; joins: number; invoicedInr: number; collectedInr: number; recruiterHours: number; directCostInr: number };

/** The weekly funnel for the last `weeks` weeks, newest first. */
export async function weeklyFunnel(db: Db, weeks = 8): Promise<FunnelWeek[]> {
  const since = new Date(Date.parse(nowIso()) - weeks * 7 * 86_400_000).toISOString();
  const sinceDay = since.slice(0, 10);
  const q = async <T>(sql: string, ...b: unknown[]) => (await db.prepare(sql).bind(...b).all<T>()).results;
  const [enq, mand, auth, events, ivs, inv, col, work, cost] = await Promise.all([
    q<{ at: string }>("SELECT created_at AS at FROM employer_enquiries WHERE created_at >= ?", since.replace("T", " ").slice(0, 19)),
    q<{ at: string }>("SELECT mandate_signed_on AS at FROM companies WHERE mandate_signed_on >= ?", sinceDay),
    q<{ at: string }>("SELECT authorised_on AS at FROM jds WHERE authorised_on >= ?", sinceDay),
    q<{ at: string; stage: string; pipeline_id: string }>("SELECT at, stage, pipeline_id FROM pipeline_events WHERE at >= ? AND stage IN ('submitted','shortlisted','offered','joined')", since),
    q<{ at: string }>("SELECT created_at AS at FROM interviews WHERE created_at >= ?", since),
    q<{ at: string; v: number | null }>("SELECT invoiced_on AS at, fee_inr AS v FROM placements WHERE invoiced_on >= ?", sinceDay),
    q<{ at: string; v: number | null }>("SELECT collected_on AS at, collected_inr AS v FROM placements WHERE collected_on >= ?", sinceDay),
    q<{ at: string; v: number }>("SELECT worked_on AS at, minutes AS v FROM work_log WHERE worked_on >= ?", sinceDay),
    q<{ at: string; v: number }>("SELECT spent_on AS at, amount_inr AS v FROM cost_log WHERE spent_on >= ?", sinceDay),
  ]);
  const out = new Map<string, FunnelWeek>();
  const w = (at: string) => { const k = weekOf(at); if (!out.has(k)) out.set(k, { week: k, prospects: 0, mandates: 0, vacanciesAuthorised: 0, candidatesSubmitted: 0, shortlistsAccepted: 0, interviews: 0, offers: 0, joins: 0, invoicedInr: 0, collectedInr: 0, recruiterHours: 0, directCostInr: 0 }); return out.get(k)!; };
  for (let i = 0; i < weeks; i++) w(new Date(Date.parse(nowIso()) - i * 7 * 86_400_000).toISOString());
  enq.forEach(r => w(r.at).prospects++); mand.forEach(r => w(r.at).mandates++); auth.forEach(r => w(r.at).vacanciesAuthorised++); ivs.forEach(r => w(r.at).interviews++);
  for (const e of events) { const x = w(e.at); if (e.stage === "submitted") x.candidatesSubmitted++; else if (e.stage === "shortlisted") x.shortlistsAccepted++; else if (e.stage === "offered") x.offers++; else x.joins++; }
  inv.forEach(r => w(r.at).invoicedInr += r.v ?? 0); col.forEach(r => w(r.at).collectedInr += r.v ?? 0);
  work.forEach(r => w(r.at).recruiterHours += r.v / 60); cost.forEach(r => w(r.at).directCostInr += r.v);
  return [...out.values()].map(x => ({ ...x, recruiterHours: Math.round(x.recruiterHours * 10) / 10 })).filter(x => x.week >= weekOf(since)).sort((a, b) => b.week.localeCompare(a.week)).slice(0, weeks);
}

/** Where employers and candidates came from (the tags on the link they followed), all time. */
export async function leadSources(db: Db) {
  const label = (s: string) => s || "Direct or unknown";
  const enq = (await db.prepare("SELECT source, COUNT(*) AS n, SUM(company_id IS NOT NULL) AS won FROM employer_enquiries GROUP BY source ORDER BY n DESC").all<{ source: string; n: number; won: number }>()).results;
  const apps = (await db.prepare("SELECT source, COUNT(*) AS n FROM applications GROUP BY source ORDER BY n DESC").all<{ source: string; n: number }>()).results;
  return { employers: enq.map(r => ({ source: label(r.source), enquiries: r.n, becameClients: r.won ?? 0 })), candidates: apps.map(r => ({ source: label(r.source), applications: r.n })) };
}

/** Per placement: fee, collected, recruiter hours and direct cost on that job, and the contribution after them. */
export async function unitEconomics(db: Db) {
  const rate = await hourlyCost(db);
  const { results } = await db.prepare(`SELECT pl.id, pl.title, pl.joined_on, pl.fee_inr, pl.collected_inr, pl.invoiced_on, pl.collected_on, pl.status, pl.replaces_placement_id, c.display_name AS client,
      (SELECT COALESCE(SUM(w.minutes), 0) FROM work_log w WHERE w.jd_id = pl.jd_id) AS minutes,
      (SELECT COALESCE(SUM(k.amount_inr), 0) FROM cost_log k WHERE k.jd_id = pl.jd_id) AS direct_cost,
      (SELECT COUNT(*) FROM placements x WHERE x.jd_id = pl.jd_id) AS hires_on_job
    FROM placements pl JOIN companies c ON c.id = pl.company_id ORDER BY pl.joined_on DESC LIMIT 200`).all<{ id: string; title: string; joined_on: string; fee_inr: number | null; collected_inr: number | null; invoiced_on: string | null; collected_on: string | null; status: string; replaces_placement_id: string | null; client: string; minutes: number; direct_cost: number; hires_on_job: number }>();
  const rows = results.map(r => {
    // A job's time and costs are shared between the hires on it.
    const share = Math.max(1, r.hires_on_job);
    const hours = Math.round(r.minutes / 60 / share * 10) / 10, timeCost = Math.round(hours * rate), direct = Math.round(r.direct_cost / share);
    const earned = r.collected_inr ?? 0;
    return { ...r, hours, timeCostInr: timeCost, directCostInr: direct, contributionInr: earned - timeCost - direct, expectedContributionInr: (r.fee_inr ?? 0) - timeCost - direct };
  });
  const joins = rows.length, collected = rows.reduce((s, r) => s + (r.collected_inr ?? 0), 0);
  const allMinutes = (await db.prepare("SELECT COALESCE(SUM(minutes), 0) AS m FROM work_log").first<{ m: number }>())?.m ?? 0;
  const allCost = (await db.prepare("SELECT COALESCE(SUM(amount_inr), 0) AS c FROM cost_log").first<{ c: number }>())?.c ?? 0;
  const totalCost = Math.round(allMinutes / 60 * rate) + allCost;
  return { hourlyCostInr: rate, placements: rows, totals: { joins, collectedInr: collected, recruiterHours: Math.round(allMinutes / 6) / 10, totalCostInr: totalCost, costPerHireInr: joins ? Math.round(totalCost / joins) : null, contributionInr: collected - totalCost } };
}

export type ReadinessItem = { key: string; label: string; target: string; actual: string; met: boolean };

/** The investor's conditions, measured from the records. Only what the records can show is counted as met. */
export async function readiness(db: Db): Promise<ReadinessItem[]> {
  const n = async (sql: string, ...b: unknown[]) => Number((await db.prepare(sql).bind(...b).first<{ n: number }>())?.n ?? 0);
  const since30 = new Date(Date.parse(nowIso()) - 30 * 86_400_000).toISOString();
  const mandates = await n("SELECT COUNT(*) AS n FROM companies WHERE mandate_signed_on IS NOT NULL AND id != ?", HOUSE_CLIENT_ID);
  const verifiedJobs = await n("SELECT COUNT(*) AS n FROM jobs j JOIN jds d ON d.id = j.id JOIN companies c ON c.id = d.company_id WHERE j.status = 'published' AND d.authorised_on IS NOT NULL AND c.mandate_signed_on IS NOT NULL");
  const sent = await n("SELECT COUNT(*) AS n FROM email_log WHERE status = 'sent' AND created_at >= ?", since30);
  const failed = await n("SELECT COUNT(*) AS n FROM email_log WHERE status != 'sent' AND created_at >= ?", since30);
  const paid = await n("SELECT COUNT(*) AS n FROM placements WHERE collected_inr > 0");
  const payingClients = await n("SELECT COUNT(DISTINCT company_id) AS n FROM placements WHERE collected_inr > 0");
  // A client that came back: a vacancy created after its first placement.
  const repeat = await n("SELECT COUNT(DISTINCT c.id) AS n FROM companies c WHERE EXISTS (SELECT 1 FROM jds j WHERE j.company_id = c.id AND j.created_at > (SELECT MIN(p.created_at) FROM placements p WHERE p.company_id = c.id))");
  const placementsWithoutTime = await n("SELECT COUNT(*) AS n FROM placements pl WHERE NOT EXISTS (SELECT 1 FROM work_log w WHERE w.jd_id = pl.jd_id)");
  const placements = await n("SELECT COUNT(*) AS n FROM placements");
  const eco = await unitEconomics(db);
  return [
    { key: "mandates", label: "Signed employer mandates", target: "2 or more", actual: String(mandates), met: mandates >= 2 },
    { key: "verified_jobs", label: "Published vacancies the employer authorised", target: "2 or more", actual: String(verifiedJobs), met: verifiedJobs >= 2 },
    { key: "email", label: "Email delivered in the last 30 days", target: "Delivered, with failures visible", actual: `${sent} sent, ${failed} not sent`, met: sent > 0 },
    { key: "paid", label: "Placements with the fee collected", target: "Several, from more than one employer", actual: `${paid} from ${payingClients} employer(s)`, met: paid >= 2 && payingClients >= 2 },
    { key: "repeat", label: "An employer that came back with another vacancy", target: "1 or more", actual: String(repeat), met: repeat >= 1 },
    { key: "time", label: "Recruiter time recorded for every placement", target: "Every placement", actual: placements ? `${placements - placementsWithoutTime} of ${placements}` : "No placements yet", met: placements > 0 && placementsWithoutTime === 0 },
    { key: "contribution", label: "Positive contribution after recruiter time and direct costs", target: "Above zero", actual: `₹${eco.totals.contributionInr.toLocaleString("en-IN")}`, met: eco.totals.joins > 0 && eco.totals.contributionInr > 0 },
  ];
}

export async function emailLog(db: Db) {
  const since = new Date(Date.parse(nowIso()) - 7 * 86_400_000).toISOString();
  const { results: counts } = await db.prepare("SELECT status, COUNT(*) AS n FROM email_log WHERE created_at >= ? GROUP BY status").bind(since).all<{ status: string; n: number }>();
  const { results: recent } = await db.prepare("SELECT kind, recipient, subject, provider, status, detail, created_at FROM email_log ORDER BY created_at DESC LIMIT 30").all();
  const queued = Number((await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE channel = 'email' AND status = 'queued'").first<{ n: number }>())?.n ?? 0);
  return { last7Days: Object.fromEntries(counts.map(c => [c.status, c.n])), recent, queued };
}

/** Every number above as CSV rows, for the investor pack. */
export async function funnelCsv(db: Db) {
  const rows = await weeklyFunnel(db, 26);
  const head = ["week_starting", "prospects", "mandates", "vacancies_authorised", "candidates_submitted", "shortlists_accepted", "interviews", "offers", "joins", "invoiced_inr", "collected_inr", "recruiter_hours", "direct_cost_inr"];
  return [head.join(","), ...rows.map(r => [r.week, r.prospects, r.mandates, r.vacanciesAuthorised, r.candidatesSubmitted, r.shortlistsAccepted, r.interviews, r.offers, r.joins, r.invoicedInr, r.collectedInr, r.recruiterHours, r.directCostInr].join(","))].join("\n");
}
