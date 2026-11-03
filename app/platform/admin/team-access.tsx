"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";

type Level = "view" | "edit" | "manage";
type Tool = { key: string; name: string; levels: Record<Level, string> };
type User = { id: string; email: string; name: string; role: "admin" | "member"; status: "invited" | "active" | "disabled"; createdAt: string; lastSignInAt: string | null; access: Record<string, Level>; pendingInvite: boolean };
type Activity = { action: string; actorId: string; targetId: string; createdAt: string; actorEmail: string | null; targetEmail: string | null };

const LEVELS: { value: Level | "none"; label: string }[] = [{ value: "none", label: "No access" }, { value: "view", label: "View" }, { value: "edit", label: "Edit" }, { value: "manage", label: "Manage" }];

async function call(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) { window.location.assign("/platform/sign-in?next=/platform/admin"); throw new Error("Sign in again."); }
  if (!response.ok) throw new Error(data.error || "That did not work. Try again.");
  return data;
}

const when = (iso: string | null) => iso ? new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z").toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "never";

function describe(a: Activity) {
  const who = a.actorEmail ?? (a.actorId.startsWith("owner:") ? `Site owner (${a.actorId.slice(6)})` : "Someone");
  const target = a.targetEmail ? ` → ${a.targetEmail}` : "";
  const action = a.action.replace(/^platform\./, "").replace(/^email_kit\./, "Email Kit: ").replaceAll("_", " ").replaceAll(".", " · ");
  return `${who}: ${action}${target}`;
}

export default function TeamAccess({ tools }: { tools: Tool[] }) {
  const [users, setUsers] = useState<User[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [me, setMe] = useState("");
  const [notice, setNotice] = useState<{ text: string; good: boolean } | null>(null);
  const [link, setLink] = useState<{ who: string; url: string; kind: string; hours: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<"member" | "admin">("member");

  const load = useCallback(async () => {
    try { const data = await call("/api/platform/admin/users", "GET"); setUsers(data.users); setActivity(data.activity); setMe(data.me); }
    catch (e) { setNotice({ text: e instanceof Error ? e.message : "Could not load the team.", good: false }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function run(work: () => Promise<void>) {
    setBusy(true); setNotice(null);
    try { await work(); await load(); } catch (e) { setNotice({ text: e instanceof Error ? e.message : "That did not work.", good: false }); }
    setBusy(false);
  }

  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const access = Object.fromEntries(tools.map(t => [t.key, String(form.get(`tool-${t.key}`) ?? "none")]));
    run(async () => {
      const data = await call("/api/platform/admin/users", "POST", { email: form.get("email"), name: form.get("name"), role, access });
      setLink({ who: String(form.get("email")), url: data.link, kind: "Invitation", hours: data.expiresInHours });
      element.reset(); setRole("member");
    });
  }
  const patch = (u: User, body: Record<string, unknown>, message: string) => run(async () => { await call(`/api/platform/admin/users/${u.id}`, "PATCH", body); setNotice({ text: message, good: true }); });
  const makeLink = (u: User, purpose: "invite" | "reset") => run(async () => {
    const data = await call(`/api/platform/admin/users/${u.id}/link`, "POST", { purpose });
    setLink({ who: u.email, url: data.link, kind: purpose === "invite" ? "Invitation" : "Password reset", hours: data.expiresInHours });
  });
  const remove = (u: User) => {
    if (!window.confirm(`Delete the account for ${u.email}? They lose access immediately. Email Kit history they recorded stays.`)) return;
    run(async () => { await call(`/api/platform/admin/users/${u.id}`, "DELETE"); setNotice({ text: `${u.email} was deleted.`, good: true }); });
  };

  return <>
    {notice && <p className={`wp-notice ${notice.good ? "good" : "bad"}`} role="status" style={{ marginBottom: 16 }}>{notice.text}</p>}
    {link && <div className="wp-link-box" role="status" style={{ marginBottom: 16 }}>
      <b>{link.kind} link for {link.who}</b>
      <span className="hint">Works once and expires in {link.hours} hours. It is shown only now. Send it to the person directly; no email is sent automatically.</span>
      <code>{link.url}</code>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="wp-btn small" type="button" onClick={() => navigator.clipboard?.writeText(link.url).then(() => setNotice({ text: "Link copied.", good: true }))}>Copy link</button><button className="wp-btn small quiet" type="button" onClick={() => setLink(null)}>Done</button></div>
    </div>}

    <form className="wp-card" onSubmit={invite} aria-labelledby="invite-title">
      <h2 id="invite-title">Invite a team member</h2>
      <div className="wp-form-grid">
        <label>Name<input name="name" maxLength={120} placeholder="Optional; they can enter it" /></label>
        <label>Work email<input name="email" type="email" required maxLength={254} /></label>
        <label>Role<select value={role} onChange={e => setRole(e.target.value as "member" | "admin")}><option value="member">Team member</option><option value="admin">Administrator (all tools, manages access)</option></select></label>
        {role === "member" && tools.map(t => <label key={t.key}>{t.name}<select name={`tool-${t.key}`} defaultValue="edit">{LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}</select></label>)}
      </div>
      {role === "member" && tools.map(t => <p className="hint" key={t.key}><b>{t.name}:</b> View — {t.levels.view} Edit — {t.levels.edit} Manage — {t.levels.manage}</p>)}
      <div style={{ marginTop: 14 }}><button className="wp-btn" disabled={busy}>Create invitation link</button></div>
    </form>

    <section className="wp-card" aria-labelledby="team-title">
      <h2 id="team-title">Team <span className="wp-badge">{users.length}</span></h2>
      <div className="wp-users">
        {users.map(u => <article className="wp-user" key={u.id}>
          <div>
            <h3>{u.name || u.email}{u.id === me ? " (you)" : ""}</h3>
            <p className="meta">{u.email}</p>
            <p className="meta">Last sign-in: {when(u.lastSignInAt)}</p>
            <div className="badges">
              <span className={`wp-badge ${u.status}`}>{u.status === "invited" ? (u.pendingInvite ? "Invited" : "Invitation expired") : u.status === "active" ? "Active" : "Disabled"}</span>
              {u.role === "admin" && <span className="wp-badge admin">Administrator</span>}
            </div>
          </div>
          <div className="controls">
            {u.role === "admin" ? <p className="hint">Administrators can use every tool with Manage access.</p>
              : tools.map(t => <label key={t.key}>{t.name}<select aria-label={`${t.name} access for ${u.email}`} value={u.access[t.key] ?? "none"} disabled={busy} onChange={e => patch(u, { access: { [t.key]: e.target.value } }, `${t.name} access for ${u.email} is now ${LEVELS.find(l => l.value === e.target.value)?.label}.`)}>{LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}</select></label>)}
            {u.id !== me && <label>Role<select aria-label={`Role for ${u.email}`} value={u.role} disabled={busy} onChange={e => patch(u, { role: e.target.value }, `${u.email} is now ${e.target.value === "admin" ? "an administrator" : "a team member"}.`)}><option value="member">Team member</option><option value="admin">Administrator</option></select></label>}
          </div>
          <div className="actions">
            {u.status === "invited" && <button className="wp-btn small quiet" disabled={busy} onClick={() => makeLink(u, "invite")}>New invitation link</button>}
            {u.status === "active" && <button className="wp-btn small quiet" disabled={busy} onClick={() => makeLink(u, "reset")}>Create reset link</button>}
            {u.id !== me && (u.status === "disabled"
              ? <button className="wp-btn small quiet" disabled={busy} onClick={() => patch(u, { status: "active" }, `${u.email} can sign in again.`)}>Enable</button>
              : <button className="wp-btn small danger" disabled={busy} onClick={() => patch(u, { status: "disabled" }, `${u.email} is disabled and signed out everywhere.`)}>Disable</button>)}
            {u.id !== me && <button className="wp-btn small danger" disabled={busy} onClick={() => remove(u)}>Delete</button>}
          </div>
        </article>)}
      </div>
    </section>

    <section className="wp-card" aria-labelledby="activity-title">
      <h2 id="activity-title">Recent access activity</h2>
      {activity.length === 0 ? <p className="hint">No activity yet.</p> : <ul className="wp-activity">{activity.map((a, i) => <li key={i}><time>{when(a.createdAt)}</time><span>{describe(a)}</span></li>)}</ul>}
    </section>
  </>;
}
