import { env } from "cloudflare:workers";
import { Engine } from "virtual:email-kit/engine";
import { auditStatement, db, type PlatformUser } from "@/lib/platform/auth";
import { levelAtLeast, type AccessLevel } from "@/lib/platform/tools";

export const TOOL = "email-kit";
export const TABLES = ["orgs", "contacts", "convs", "msgs", "events", "tasks", "meetings", "facts", "sources", "suppressions", "queue", "meta"] as const;
type Table = (typeof TABLES)[number];
type Row = Record<string, unknown> & { id: string };
export type Change = { table: Table; id: string; value: Row | null };

const SEP = "\u001f";
const MAX_ROW = 256 * 1024;
const CHUNK = 500 * 1024;
const UNDO_WINDOW_MS = 15 * 60_000;

/** Minimum access level for each Email Kit engine command. Unknown commands need Manage. */
const COMMAND_LEVEL: Record<string, AccessLevel> = Object.fromEntries([
  ...["saveDraft", "markSent", "processResponse", "reconcileConversation", "reconcile", "reconcileQueue", "enqueue", "finishQueue", "postpone",
    "closeConversation", "addressFixed", "resolveTask", "setMeeting", "meetingHeld", "cancelMeeting", "addFact", "correctFact", "addSource",
    "removeSource", "changeEmployer", "verifyEmployer", "renameOrg", "renameContact", "mergeContacts", "resolveReview", "liftRestriction",
    "importContacts", "setMandate", "deleteConversation", "deleteContact", "holdReply", "dropDraft", "undone", "undo"].map(c => [c, "edit"]),
  ...["saveAgency", "updateSettings", "restore", "migrateLegacy", "eraseAll"].map(c => [c, "manage"]),
]) as Record<string, AccessLevel>;
const META_COMMANDS = new Set(["saveAgency", "updateSettings", "restore", "migrateLegacy", "eraseAll"]);
const HISTORY_TABLES = new Set<Table>(["events", "msgs", "convs", "contacts", "orgs", "facts"]);
const DELETING_COMMANDS = new Set(["deleteConversation", "deleteContact", "mergeContacts", "restore", "eraseAll", "undo"]);

export class Refusal extends Error {
  constructor(message: string, public status = 422, public code = "REFUSED") { super(message); }
}

const bucket = () => env.BUCKET ?? null;
const nowIso = () => new Date().toISOString();

/** Revision and every record, read in one transaction so they always match. */
export async function readState() {
  const [state, rows] = await db().batch([
    db().prepare("SELECT rev FROM email_kit_state WHERE id = 1"),
    db().prepare("SELECT tbl, id, data FROM email_kit_records"),
  ]);
  const out: Record<string, Record<string, unknown>> = Object.fromEntries(TABLES.map(t => [t, {}]));
  for (const r of (rows.results ?? []) as { tbl: string; id: string; data: string }[]) if (out[r.tbl]) out[r.tbl][r.id] = JSON.parse(r.data);
  delete out.meta.rev;
  return { rev: ((state.results?.[0] as { rev?: number } | undefined)?.rev) ?? 0, state: out };
}

export async function currentRev(): Promise<number> {
  return (await db().prepare("SELECT rev FROM email_kit_state WHERE id = 1").first<{ rev: number }>())?.rev ?? 0;
}

function parseChanges(raw: unknown): Change[] {
  if (!Array.isArray(raw) || raw.length > 50_000) throw new Refusal("The change list is not valid.");
  const seen = new Set<string>();
  const out: Change[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") throw new Refusal("The change list is not valid.");
    const { table, id, value } = item as { table: unknown; id: unknown; value: unknown };
    if (!(TABLES as readonly string[]).includes(table as string)) throw new Refusal("A change names an unknown record type.");
    if (typeof id !== "string" || !id || id.length > 80 || ["__proto__", "constructor", "prototype"].includes(id)) throw new Refusal("A change has an invalid record id.");
    if (table === "meta" && id === "rev") continue; // the server keeps the revision
    if (value !== null && (typeof value !== "object" || Array.isArray(value) || (value as Row).id !== id)) throw new Refusal("A change does not match its record id.");
    if (value !== null) {
      if (JSON.stringify(value).length > MAX_ROW) throw new Refusal("A record is too large to save.", 413, "TOO_LARGE");
      if (!Engine.validRow(table as string, value)) throw new Refusal(`A ${table} record failed Email Kit's validity check, so nothing was saved.`);
    }
    const key = `${table}${SEP}${id}`;
    if (seen.has(key)) throw new Refusal("A record appears twice in one change.");
    seen.add(key);
    out.push({ table: table as Table, id, value: value as Row | null });
  }
  return out;
}

type Stored = { tbl: string; id: string; data: string; updatedBy: string; updatedAt: string };

async function storedRows(keys: string[]): Promise<Map<string, Stored & { row: Row }>> {
  const map = new Map<string, Stored & { row: Row }>();
  for (let i = 0; i < keys.length; i += 2000) {
    const res = await db().prepare(`SELECT tbl, id, data, updated_by AS updatedBy, updated_at AS updatedAt FROM email_kit_records
        WHERE (tbl || char(31) || id) IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(keys.slice(i, i + 2000))).all<Stored>();
    for (const r of res.results ?? []) map.set(`${r.tbl}${SEP}${r.id}`, { ...r, row: JSON.parse(r.data) });
  }
  return map;
}

const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
const covers = (next: unknown, prev: unknown) => { const n = new Set(list(next)); return list(prev).every(k => n.has(k)); };

type Guarded = { audits: { action: string; target: string; detail: string }[]; deletesHistory: boolean };

/** Server-side communication safeguards. They hold whatever the client sends. */
async function guard(changes: Change[], command: string, user: PlatformUser): Promise<Guarded> {
  const level = user.access[TOOL];
  const min = COMMAND_LEVEL[command] ?? "manage";
  if (!levelAtLeast(level, min)) throw new Refusal(min === "manage" ? "This needs Manage access to Email Kit. Ask an administrator." : "Your Email Kit access is view only.", 403, "LEVEL");
  if (changes.some(c => c.table === "meta") && !(META_COMMANDS.has(command) && levelAtLeast(level, "manage")))
    throw new Refusal("Changing the agency profile or follow-up rules needs Manage access.", 403, "LEVEL");
  if (changes.some(c => c.value === null && HISTORY_TABLES.has(c.table)) && !DELETING_COMMANDS.has(command))
    throw new Refusal("This step cannot delete client history.", 403, "HISTORY");

  const audits: Guarded["audits"] = [];
  const deletedContacts = new Set(changes.filter(c => c.table === "contacts" && c.value === null).map(c => c.id));
  const keys = changes.filter(c => c.table === "suppressions" || (c.table === "contacts" && c.value === null)).map(c => `${c.table}${SEP}${c.id}`);
  const stored = keys.length ? await storedRows(keys) : new Map();

  for (const c of changes.filter(x => x.table === "suppressions")) {
    const old = stored.get(`suppressions${SEP}${c.id}`);
    const inUndoWindow = command === "undo" && !!old && old.updatedBy === user.id && Date.now() - Date.parse(old.updatedAt) < UNDO_WINDOW_MS;
    if (!old) {
      if (!c.value) continue;
      if (c.value.status !== "active" && !(c.value.status === "lifted" && ["restore", "migrateLegacy"].includes(command)))
        throw new Refusal("A new Do not contact restriction must start active.", 403, "RESTRICTION");
      continue;
    }
    const prev = old.row;
    if (!c.value) {
      if (!inUndoWindow) throw new Refusal("A Do not contact restriction cannot be deleted. Lift it with a documented reason instead.", 403, "RESTRICTION");
      audits.push({ action: "email_kit.restriction_undone", target: c.id, detail: `Undo within ${UNDO_WINDOW_MS / 60000} minutes of recording it` });
      continue;
    }
    const next = c.value;
    if (prev.status !== next.status) {
      if (prev.status === "active" && next.status === "lifted") {
        if (typeof next.liftReason !== "string" || !next.liftReason.trim()) throw new Refusal("A restriction can only be lifted with a stated reason.", 403, "RESTRICTION");
        audits.push({ action: "email_kit.restriction_lifted", target: c.id, detail: String(next.liftReason).slice(0, 500) });
      } else if (!(prev.status === "lifted" && next.status === "active")) {
        throw new Refusal("That change to a restriction is not allowed.", 403, "RESTRICTION");
      }
    }
    if (!inUndoWindow) {
      if (!["nameKeys", "contactKeys", "companyKeys", "channels"].every(k => covers(next[k], prev[k])))
        throw new Refusal("A restriction can be widened, never narrowed. Lift it with a reason instead.", 403, "RESTRICTION");
      if (prev.scope !== next.scope) {
        if (prev.scope === "review") audits.push({ action: "email_kit.restriction_scope_decided", target: c.id, detail: `review → ${String(next.scope)}` });
        else if (next.scope !== "all") throw new Refusal("A restriction's scope can only be widened.", 403, "RESTRICTION");
      }
      if (prev.contactId !== next.contactId && prev.contactId && !deletedContacts.has(String(prev.contactId)))
        throw new Refusal("A restriction cannot be moved to another person.", 403, "RESTRICTION");
      if (prev.orgId !== next.orgId && prev.orgId) throw new Refusal("A restriction cannot be moved to another company.", 403, "RESTRICTION");
    } else if (JSON.stringify(prev) !== JSON.stringify(next)) {
      audits.push({ action: "email_kit.restriction_undone", target: c.id, detail: "Undo of a recent change" });
    }
  }

  // A deleted contact's identity must already be copied into its restrictions.
  if (deletedContacts.size) {
    const all = await db().prepare("SELECT id, data FROM email_kit_records WHERE tbl = 'suppressions'").all<{ id: string; data: string }>();
    const after = new Map((all.results ?? []).map(r => [r.id, JSON.parse(r.data) as Row]));
    for (const c of changes) if (c.table === "suppressions") { if (c.value) after.set(c.id, c.value); else after.delete(c.id); }
    for (const id of deletedContacts) {
      const contact = stored.get(`contacts${SEP}${id}`)?.row;
      if (!contact) continue;
      for (const x of after.values()) {
        if (x.contactId !== id) continue;
        if (!list(x.nameKeys).includes(String(contact.nameKey ?? "")) || !covers(x.contactKeys, contact.keys))
          throw new Refusal("This contact has a restriction that does not yet hold their details, so the contact was not deleted.", 403, "RESTRICTION");
      }
    }
  }

  const counts: Record<string, number> = {};
  for (const c of changes) if (c.value === null) counts[c.table] = (counts[c.table] ?? 0) + 1;
  const deletesHistory = changes.some(c => c.value === null && (c.table === "contacts" || c.table === "convs"));
  if (META_COMMANDS.has(command) || (Object.keys(counts).length && command !== "removeSource"))
    audits.push({ action: `email_kit.${command}`, target: TOOL, detail: Object.entries(counts).map(([t, n]) => `${t}:-${n}`).join(" ") || `${changes.length} changes` });
  return { audits, deletesHistory };
}

/** Writes every change or none, only if the stored revision is still `expected`. */
export async function commit(body: unknown, user: PlatformUser): Promise<number> {
  const { expected, command, changes: raw } = (body ?? {}) as { expected?: unknown; command?: unknown; changes?: unknown };
  if (!Number.isInteger(expected) || (expected as number) < 0) throw new Refusal("The request has no valid revision.");
  if (typeof command !== "string" || !/^[a-zA-Z]{1,40}$/.test(command)) throw new Refusal("The request does not name an Email Kit step.");
  const changes = parseChanges(raw);
  const { audits, deletesHistory } = await guard(changes, command, user);
  const rev = expected as number;
  if (!changes.length) return rev;

  const token = crypto.randomUUID();
  const now = nowIso();
  const actor = `platform:${user.id}`;
  const fresh = "EXISTS (SELECT 1 FROM email_kit_state WHERE id = 1 AND last_tx = ?)";
  const statements = [db().prepare("UPDATE email_kit_state SET rev = rev + 1, last_tx = ?, updated_at = ?, updated_by = ? WHERE id = 1 AND rev = ?").bind(token, now, user.id, rev)];

  const chunks = (items: string[]) => {
    const out: string[][] = [[]];
    let size = 0;
    for (const item of items) {
      if (size + item.length > CHUNK && out[out.length - 1].length) { out.push([]); size = 0; }
      out[out.length - 1].push(item); size += item.length + 1;
    }
    return out.filter(c => c.length);
  };
  const upserts = changes.filter(c => c.value).map(c => JSON.stringify({ t: c.table, i: c.id, d: JSON.stringify(c.value) }));
  for (const part of chunks(upserts)) statements.push(db().prepare(`INSERT INTO email_kit_records (tbl, id, data, updated_at, updated_by, updated_rev)
      SELECT json_extract(value, '$.t'), json_extract(value, '$.i'), json_extract(value, '$.d'), ?, ?, ? FROM json_each(?) WHERE ${fresh}
      ON CONFLICT(tbl, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by, updated_rev = excluded.updated_rev`)
    .bind(now, user.id, rev + 1, `[${part.join(",")}]`, token));
  const deletes = changes.filter(c => !c.value).map(c => JSON.stringify(`${c.table}${SEP}${c.id}`));
  for (const part of chunks(deletes)) statements.push(db().prepare(`DELETE FROM email_kit_records WHERE (tbl || char(31) || id) IN (SELECT value FROM json_each(?)) AND ${fresh}`).bind(`[${part.join(",")}]`, token));

  // Erasing a person or conversation also removes them from recovery copies.
  let snapshotKeys: string[] = [];
  if (deletesHistory) {
    snapshotKeys = ((await db().prepare("SELECT r2_key AS k FROM email_kit_snapshots").all<{ k: string }>()).results ?? []).map(r => r.k);
    statements.push(db().prepare(`DELETE FROM email_kit_snapshots WHERE ${fresh}`).bind(token));
  }
  for (const a of audits) statements.push(db().prepare(`INSERT INTO audit_events (id, actor_id, action, target_type, target_id, detail) SELECT ?, ?, ?, 'email_kit', ?, ? WHERE ${fresh}`)
    .bind(crypto.randomUUID(), actor, a.action, a.target.slice(0, 200), a.detail.slice(0, 2000), token));

  const results = await db().batch(statements);
  if (!results[0].meta.changes) throw new Refusal("Someone else saved first.", 409, "STALE");
  if (snapshotKeys.length && bucket()) await bucket()!.delete(snapshotKeys).catch(() => undefined);
  return rev + 1;
}

/* ---------- Attachments ---------- */
const FILE_ID = /^[A-Za-z0-9_-]{4,80}$/;
const fileKey = (id: string) => `email-kit/files/${id}`;
export const validFileId = (id: string) => FILE_ID.test(id);

export async function referencedFiles(): Promise<Set<string>> {
  const rows = await db().prepare("SELECT json_extract(data, '$.fileId') AS f FROM email_kit_records WHERE tbl = 'sources'").all<{ f: string | null }>();
  return new Set((rows.results ?? []).map(r => r.f).filter((f): f is string => !!f));
}

export async function putFile(id: string, body: unknown, user: PlatformUser) {
  const store = bucket();
  if (!store) throw new Refusal("Attachment storage is not available.", 503, "NO_STORAGE");
  const { name, type, data } = (body ?? {}) as { name?: unknown; type?: unknown; data?: unknown };
  if (typeof data !== "string" || !data.startsWith("data:") || data.length > 7_200_000) throw new Refusal("The attachment is not a valid file of up to 5 MB.", 413, "TOO_LARGE");
  const existing = await db().prepare("SELECT id FROM email_kit_files WHERE id = ?").bind(id).first();
  if (existing) return { ok: true, existing: true }; // restoring the same backup twice is harmless
  await store.put(fileKey(id), data, { httpMetadata: { contentType: "text/plain" } });
  await db().prepare("INSERT INTO email_kit_files (id, name, type, size, r2_key, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, String(name ?? "file").slice(0, 200), String(type ?? "").slice(0, 100), data.length, fileKey(id), nowIso(), user.id).run();
  return { ok: true };
}

export async function getFile(id: string) {
  const row = await db().prepare("SELECT id, name, type, r2_key AS k FROM email_kit_files WHERE id = ?").bind(id).first<{ id: string; name: string; type: string; k: string }>();
  if (!row || !bucket()) return null;
  const object = await bucket()!.get(row.k);
  return object ? { id: row.id, name: row.name, type: row.type, data: await object.text() } : null;
}

/** Deletes only files no saved record uses. Another person's recent upload is kept (it may be about to be saved). */
export async function deleteFiles(ids: string[] | "all", user: PlatformUser, graceMs: number) {
  const used = await referencedFiles();
  const rows = await db().prepare("SELECT id, r2_key AS k, created_by AS by, created_at AS at FROM email_kit_files").all<{ id: string; k: string; by: string; at: string }>();
  const wanted = ids === "all" ? null : new Set(ids);
  const gone = (rows.results ?? []).filter(r => (!wanted || wanted.has(r.id)) && !used.has(r.id) && (r.by === user.id || Date.now() - Date.parse(r.at) > graceMs));
  if (!gone.length) return 0;
  await db().prepare("DELETE FROM email_kit_files WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(gone.map(r => r.id))).run();
  if (bucket()) await bucket()!.delete(gone.map(r => r.k)).catch(() => undefined);
  return gone.length;
}

/* ---------- Daily recovery copies, built by the server ---------- */
export async function createSnapshot(today: unknown, user: PlatformUser) {
  if (typeof today !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Refusal("The date is not valid.");
  if (Math.abs(Date.parse(`${today}T12:00:00Z`) - Date.now()) > 36 * 3600_000) throw new Refusal("The date is not today.");
  if (!bucket()) return { created: false };
  if (await db().prepare("SELECT id FROM email_kit_snapshots WHERE id = ?").bind(today).first()) return { created: false };
  const { state } = await readState();
  if (!Object.keys(state.convs).length) return { created: false };
  const data = JSON.stringify(state);
  const key = `email-kit/snapshots/${today}.json`;
  await bucket()!.put(key, data, { httpMetadata: { contentType: "application/json" } });
  await db().prepare("INSERT OR IGNORE INTO email_kit_snapshots (id, r2_key, bytes, created_at, created_by) VALUES (?, ?, ?, ?, ?)").bind(today, key, data.length, nowIso(), user.id).run();
  const old = (await db().prepare("SELECT id, r2_key AS k FROM email_kit_snapshots ORDER BY id DESC LIMIT -1 OFFSET 7").all<{ id: string; k: string }>()).results ?? [];
  if (old.length) {
    await db().prepare("DELETE FROM email_kit_snapshots WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(old.map(o => o.id))).run();
    await bucket()!.delete(old.map(o => o.k)).catch(() => undefined);
  }
  return { created: true };
}

export async function listSnapshots() {
  return ((await db().prepare("SELECT id, created_at AS at FROM email_kit_snapshots ORDER BY id DESC").all<{ id: string; at: string }>()).results ?? []);
}

export async function snapshotData(id: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(id) || !bucket()) return null;
  const row = await db().prepare("SELECT r2_key AS k, created_at AS at FROM email_kit_snapshots WHERE id = ?").bind(id).first<{ k: string; at: string }>();
  const object = row ? await bucket()!.get(row.k) : null;
  return object && row ? { id, at: row.at, data: await object.text() } : null;
}

export async function summary() {
  const [counts, files, snaps, rev] = await db().batch([
    db().prepare("SELECT tbl, COUNT(*) AS n FROM email_kit_records GROUP BY tbl"),
    db().prepare("SELECT COUNT(*) AS n FROM email_kit_files"),
    db().prepare("SELECT COUNT(*) AS n FROM email_kit_snapshots"),
    db().prepare("SELECT rev FROM email_kit_state WHERE id = 1"),
  ]);
  return {
    rev: (rev.results?.[0] as { rev: number } | undefined)?.rev ?? 0,
    counts: Object.fromEntries(((counts.results ?? []) as { tbl: string; n: number }[]).map(r => [r.tbl, r.n])),
    files: (files.results?.[0] as { n: number } | undefined)?.n ?? 0,
    snapshots: (snaps.results?.[0] as { n: number } | undefined)?.n ?? 0,
  };
}

export { auditStatement };
