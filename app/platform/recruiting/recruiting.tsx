"use client";
// Recruiting tool for Jobboard300 staff: what changed, assigned clients and jobs,
// ranked candidates to submit (with their profile and CV), the client's pipeline
// with stage updates, interviews (schedule, reschedule, record the result), offers
// waiting to join, and (for admins and team managers) assignment.
import { useCallback, useEffect, useState, type FormEvent } from "react";

type Row = Record<string, string | number | null>;
type Change = { id: string; kind: string; title: string; body: string; created_at: string; jd_id: string | null; company: string; name: string | null; isNew: boolean };
type Joining = { id: string; jd_id: string; candidate_id: string; joining_date: string; offer_ctc_inr: number | null; last_working_day: string | null; competing_offers: string; name: string; jd_title: string; company: string; checkpoint: { daysLeft: number; label: string } | null };
type Work = { role: "admin" | "manager" | "recruiter"; clients: Row[]; jobs: Row[]; members: Row[]; teams: Row[]; joining: Joining[]; changes: { unread: number; items: Change[] }; canEdit: boolean; me: string; messaging: { scopes: Row[]; queue: Row[] } };
type Technical = { title: string; level: number | null; band: string | null; date: string };
type Interview = { id: string; round: string; scheduled_at: string; mode: string; location: string; interviewer: string; status: string; outcome: string; rating: number | null; feedback: string };
type Entry = {
  commitment?: string | null; tests?: { title: string; kind: string; status: string; level: number | null; band: string | null }[]; technical?: Technical[]; id: string; candidateId: string; name: string; stage: string; stageLabel: string; stageReason: string; source: string; available: boolean;
  recruiterNote: string; offerCtcInr: number | null; offerDate: string | null; joiningDate: string | null; lastWorkingDay: string | null; competingOffers: string; next: string[]; interviews: Interview[];
};
type Pipe = { tests?: { aptitudeOpted: boolean; banks: { id: string; title: string; kind: string }[] }; pipeline: Entry[]; reasons: Record<string, string[]>; labels: Record<string, string> };
type Profile = { name: string; profile: { headline: string; summary: string; work: { title: string; employer: string; start: string | null; end: string | null; current: boolean; highlights: string[] }[]; education: { qualification: string; field: string; institution: string; year: number | null }[]; skills: { name: string; evidence: string }[]; india: { yearsExperience: number; noticeDays: number | null; ctcCurrentInr: number | null; ctcExpectedInr: number | null; currentCity: string } } };
type Say = (text: string) => void;
type ShowLink = (message: string, url: string) => void;

async function api<T>(action: string, body?: object, query = ""): Promise<T> {
  const r = await fetch(`/api/platform/recruiting/${action}${query}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const d = await r.json().catch(() => ({})) as T & { error?: string };
  if (!r.ok) throw new Error(d.error ?? "The request failed.");
  return d;
}
const ROLE = { admin: "Administrator: all clients and jobs", manager: "Team manager: your team's clients and jobs", recruiter: "Recruiter: your team's clients, and jobs assigned to you or to nobody" };
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const day = (iso: string | null) => iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
const lpa = (n: number | null) => n === null ? "not stated" : `₹${(n / 100_000).toFixed(1)} LPA`;
/** Now, in the format a date-time field uses, so a past time cannot be picked. */
const nowLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const OUTCOME: Record<string, string> = { advance: "move forward", hold: "on hold", reject: "do not proceed", pending: "decision pending" };

/** A one-time link in its own box, with Copy, so it is not lost when the next action replaces the status line. */
function LinkBox({ link, close }: { link: { message: string; url: string }; close: () => void }) {
  const [copied, setCopied] = useState(false);
  return <section className="pj-card" role="status" aria-label="One-time link">
    <p><b>{link.message}</b></p>
    <div className="pj-row"><input readOnly value={link.url} onFocus={e => e.currentTarget.select()} style={{ flex: 1, minWidth: "min(420px, 100%)" }} aria-label="One-time link" />
      <button type="button" className="pj-btn" onClick={() => { navigator.clipboard?.writeText(link.url).then(() => setCopied(true)).catch(() => undefined); }}>{copied ? "Copied" : "Copy"}</button>
      <button type="button" className="pj-link" onClick={close}>Done</button></div>
    <p className="pj-muted">It is also in the candidate&apos;s inbox. Send it again by asking for a new one: the old link then stops working.</p>
  </section>;
}

export default function Recruiting() {
  const [work, setWork] = useState<Work | null>(null), [notice, setNotice] = useState(""), [open, setOpen] = useState<string | null>(null), [link, setLink] = useState<{ message: string; url: string } | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const load = useCallback(() => api<Work>("work").then(setWork).catch(e => setNotice(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const showLink: ShowLink = (message, url) => { setLink({ message, url }); setNotice(""); };
  const act = async (action: string, body: object) => { try { const d = await api<{ message: string; link?: string }>(action, body); if (d.link) showLink(d.message, d.link); else setNotice(d.message); await load(); return true; } catch (e) { setNotice((e as Error).message); return false; } };
  if (!work) return <p className="pj-muted">{notice || "Loading…"}</p>;
  const canAssign = work.role !== "recruiter" && work.canEdit;
  const jobs = work.jobs.filter(j => showClosed || j.status !== "closed");
  return <div className="pj-main" style={{ padding: 0 }}>
    {notice && <p className="pj-notice" role="status">{notice}</p>}
    {link && <LinkBox link={link} close={() => setLink(null)} />}
    <p className="pj-muted">{ROLE[work.role]}.</p>

    <section className="pj-card"><div className="pj-row" style={{ justifyContent: "space-between" }}><h2>What changed{work.changes.unread ? ` (${work.changes.unread} new)` : ""}</h2>
      {work.changes.unread > 0 && work.canEdit && <button className="pj-link" onClick={() => act("changes-seen", {})}>Mark all as seen</button>}</div>
      {work.changes.items.length === 0 ? <p className="pj-muted">Nothing yet. When a client shortlists, rejects, schedules an interview, makes an offer or reports an exit, or a candidate withdraws, it appears here.</p> :
        <div className="pj-list">{work.changes.items.map(c => <article className="pj-note" key={c.id} style={c.isNew ? { borderLeftColor: "#14603e" } : undefined}>
          <b>{c.title}</b>{c.isNew && <span className="pj-pill strong">New</span>} <span className="pj-muted">· {c.company}{c.name ? ` · ${c.name}` : ""} · {when(c.created_at)}</span>
          {c.body && <p className="pj-muted">{c.body}</p>}
          {c.jd_id && work.jobs.some(j => j.id === c.jd_id) && <button className="pj-link" onClick={() => { setShowClosed(true); setOpen(c.jd_id); document.getElementById("jobs")?.scrollIntoView({ behavior: "smooth" }); }}>Open the job</button>}
        </article>)}</div>}
    </section>

    {work.joining.length > 0 && <section className="pj-card"><h2>Joining soon</h2>
      <p className="pj-muted">Offers accepted, waiting for the joining date. Call the candidate 30, 14, 7 and 1 days before; many accepted offers fall through during a long notice period.</p>
      <table className="pj-table"><thead><tr><th>Candidate</th><th>Job</th><th>Joining</th><th>Last day at current job</th><th>Other offers</th><th>Follow-up</th></tr></thead><tbody>{work.joining.map(j => <tr key={j.id}>
        <td>{j.name}</td><td>{j.jd_title} · {j.company}</td><td>{day(j.joining_date)}</td><td>{day(j.last_working_day) || "—"}</td><td>{j.competing_offers || "—"}</td><td>{j.checkpoint?.label ?? "—"}</td></tr>)}</tbody></table>
    </section>}

    <section className="pj-card" id="jobs"><div className="pj-row" style={{ justifyContent: "space-between" }}><h2>Jobs</h2>
      {work.jobs.some(j => j.status === "closed") && <label className="pj-muted"><input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} /> Show closed and filled jobs</label>}</div>
      {jobs.length === 0 ? <p className="pj-muted">No jobs are assigned to you or your team yet.</p> : <div className="pj-list">{jobs.map(j => <article className="pj-item" key={String(j.id)}>
        <div><b>{j.title}</b> <span className="pj-pill">{j.status === "closed" ? "closed" : j.status}</span>
          <p className="pj-muted">{j.company} · {j.openings} opening(s) · {j.in_process} in process · {j.joined} joined · {j.recruiter ? `Assigned to ${j.recruiter}` : "Unassigned"}</p>
          {canAssign && j.status !== "closed" && <label className="pj-muted">Assign to <select value={String(j.recruiter_id ?? "")} onChange={e => act("assign-recruiter", { jdId: j.id, userId: e.target.value })}><option value="">Nobody</option>{work.members.filter(m => m.team_id === j.team_id).map(m => <option key={String(m.user_id)} value={String(m.user_id)}>{m.name || m.email}</option>)}</select></label>}
          {j.status === "closed" && Number(j.in_process) > 0 && work.canEdit && <p><button className="pj-link" onClick={() => window.confirm(`Close the ${j.in_process} candidate(s) still in process as “position filled”? Each one is told.`) && act("jd-fill", { jdId: j.id })}>Close the remaining {j.in_process} as “position filled”</button></p>}
          {canAssign && j.status === "live" && <p><button className="pj-link" onClick={() => window.confirm("Close this job for the client? Candidates still in process are closed as “position closed” and told.") && act("jd-close", { jdId: j.id })}>Close this job</button></p>}
          {open === j.id && <JobWork jd={j} canEdit={work.canEdit} canManage={work.role !== "recruiter"} say={setNotice} showLink={showLink} reload={load} />}
        </div>
        <div className="pj-row"><button className="pj-btn quiet" onClick={() => setOpen(open === j.id ? null : String(j.id))}>{open === j.id ? "Close" : "Open"}</button></div>
      </article>)}</div>}
    </section>

    <section className="pj-card"><h2>Clients</h2>
      {work.clients.length === 0 ? <p className="pj-muted">No clients are assigned to your team yet.</p> : <table className="pj-table"><thead><tr><th>Client</th><th>City</th><th>Status</th><th>Team</th></tr></thead><tbody>{work.clients.map(c => <tr key={String(c.id)}>
        <td>{c.display_name}</td><td>{c.city}</td><td>{c.status}</td>
        <td>{work.role === "admin" && work.canEdit ? <select aria-label={`Team for ${c.display_name}`} value={String(c.team_id ?? "")} onChange={e => act("assign-team", { companyId: c.id, teamId: e.target.value })}><option value="">No team</option>{work.teams.map(t => <option key={String(t.id)} value={String(t.id)}>{t.name}</option>)}</select> : c.team ?? "—"}</td>
      </tr>)}</tbody></table>}
    </section>

    {work.role !== "recruiter" && <section className="pj-card"><h2>Team members</h2>
      <p className="pj-muted">A team manager sees all of the team&apos;s jobs and assigns them to its members. {work.role === "admin" ? "Create teams and add people under Operations." : "An administrator adds people to your team."}</p>
      {work.members.length === 0 ? <p className="pj-muted">No team members yet.</p> : <table className="pj-table"><thead><tr><th>Team</th><th>Person</th><th>Role</th></tr></thead><tbody>{work.members.map(m => <tr key={`${m.team_id}:${m.user_id}`}>
        <td>{m.team}</td><td>{m.name || m.email}</td>
        <td>{work.role === "admin" && work.canEdit ? <label><input type="checkbox" checked={!!m.is_manager} onChange={e => act("team-manager", { teamId: m.team_id, userId: m.user_id, manager: e.target.checked })} /> Team manager</label> : m.is_manager ? "Team manager" : "Recruiter"}
          {work.canEdit && m.user_id !== work.me && (work.role === "admin" || !m.is_manager) && <> <button className="pj-link" onClick={() => window.confirm(`Remove ${m.name || m.email} from ${m.team}? Their job assignments in this team are cleared.`) && act("team-remove", { teamId: m.team_id, userId: m.user_id })}>Remove</button></>}</td>
      </tr>)}</tbody></table>}
      {work.canEdit && <form className="pj-form" onSubmit={async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const form = e.currentTarget, f = Object.fromEntries(new FormData(form).entries()); if (await act("team-invite", f)) form.reset(); }}>
        <h3 className="full">Invite a recruiter to your team</h3>
        <label>Team<select name="teamId" required>{[...new Map((work.role === "admin" ? work.teams.map(t => [t.id, t.name]) : work.members.map(m => [m.team_id, m.team])) as [string, string][]).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label>Name<input name="name" required maxLength={120} /></label>
        <label>Work email<input name="email" type="email" required maxLength={254} /></label>
        <div className="full"><button className="pj-btn">Invite and get link</button> <span className="pj-muted">They get the Recruiting tool only, and see only this team&apos;s work.</span></div>
      </form>}
    </section>}

    {work.role !== "recruiter" && work.messaging.scopes.length > 0 && <section className="pj-card"><h2>WhatsApp set-up</h2>
      <p className="pj-muted">Candidates hear from the team that owns the client. If a team has no number, the admin&apos;s number is used. No WhatsApp provider is connected yet: messages are recorded in a queue and will be sent once one is plugged in. Candidates always get the same message in their inbox.</p>
      {work.messaging.scopes.map(m => <form className="pj-form" key={String(m.scope)} onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = new FormData(e.currentTarget); act("messaging", { scope: m.scope, number: f.get("number"), enabled: f.get("enabled") === "on", override: f.get("override") === "on" }); }}>
        <h3 className="full">{m.label}</h3>
        <label>WhatsApp number (with country code)<input name="number" defaultValue={String(m.whatsapp_number ?? "")} placeholder="+91 98300 12345" maxLength={30} /></label>
        <label className="pj-row"><input type="checkbox" name="enabled" defaultChecked={!!m.whatsapp_enabled} /> Use this number</label>
        {m.scope === "admin" && <label className="pj-row full"><input type="checkbox" name="override" defaultChecked={!!m.admin_override} /> Override team numbers: send every message from this number</label>}
        {work.canEdit && <div className="full"><button className="pj-btn quiet">Save</button></div>}
      </form>)}
      {work.messaging.queue.length > 0 && <p className="pj-muted">Queue: {work.messaging.queue.map(q => `${q.n} ${q.status}`).join(" · ")}</p>}
    </section>}
  </div>;
}

/** The candidate's parsed profile, without phone or email (those are opened one person at a time). */
function ProfilePanel({ jdId, candidateId, say }: { jdId: string; candidateId: string; say: Say }) {
  const [p, setP] = useState<Profile | null>(null);
  useEffect(() => { api<Profile>("profile", undefined, `?jd=${jdId}&candidate=${candidateId}`).then(setP).catch(e => say(e.message)); }, [jdId, candidateId, say]);
  if (!p) return <p className="pj-muted">Loading the profile…</p>;
  const x = p.profile;
  return <div className="pj-note">
    <p><b>{x.headline || p.name}</b>{x.india.currentCity ? ` · ${x.india.currentCity}` : ""} · {x.india.yearsExperience} years · notice {x.india.noticeDays ?? "not stated"} days · current {lpa(x.india.ctcCurrentInr)} · expected {lpa(x.india.ctcExpectedInr)}</p>
    {x.summary && <p>{x.summary}</p>}
    {x.work.length > 0 && <><b>Experience</b><ul>{x.work.slice(0, 8).map((w, i) => <li key={i}><b>{w.title}</b>{w.employer ? `, ${w.employer}` : ""} ({w.start ?? "?"} – {w.current ? "present" : w.end ?? "?"}){w.highlights.slice(0, 3).map((h, k) => <div className="pj-muted" key={k}>{h}</div>)}</li>)}</ul></>}
    {x.education.length > 0 && <p><b>Education</b> {x.education.map(e => `${e.qualification}${e.field ? ` (${e.field})` : ""}${e.institution ? `, ${e.institution}` : ""}${e.year ? `, ${e.year}` : ""}`).join("; ")}</p>}
    {x.skills.length > 0 && <p><b>Skills</b> {x.skills.slice(0, 30).map(s => `${s.name}${s.evidence === "work" ? " ✓" : ""}`).join(", ")}</p>}
    <p className="pj-muted">Phone and email are not shown here. Use “Show phone and email”, which is counted and logged.</p>
  </div>;
}

function Tech({ results }: { results?: Technical[] }) {
  if (!results?.length) return null;
  return <p className="pj-muted">Technical test{results.length > 1 ? "s" : ""}: {results.map(t => `${t.title}: ${t.band ?? "completed"}${t.level ? ` (level ${t.level} of 10)` : ""}, ${day(t.date)}`).join("; ")}. For staff only.</p>;
}

function JobWork({ jd, canEdit, canManage, say, showLink, reload }: { jd: Row; canEdit: boolean; canManage: boolean; say: Say; showLink: ShowLink; reload: () => void }) {
  const [passReasons, setPassReasons] = useState<string[]>([]), [full, setFull] = useState(false), [waiting, setWaiting] = useState(0);
  // Phone and email are opened one candidate at a time; each view is recorded and counted against a daily limit.
  const [contacts, setContacts] = useState<Record<string, { phone: string; email: string }>>({});
  const showContact = async (candidateId: string) => { try { const d = await api<{ phone: string; email: string }>("contact", { jdId: jd.id, candidateId }); setContacts(c => ({ ...c, [candidateId]: d })); } catch (e) { say((e as Error).message); } };
  const [cands, setCands] = useState<Row[] | null>(null), [pipe, setPipe] = useState<Pipe | null>(null), [form, setForm] = useState<{ id: string; kind: string } | null>(null);
  const [profiles, setProfiles] = useState<string | null>(null), [passed, setPassed] = useState<Row[] | null>(null);
  const load = useCallback(() => {
    api<{ candidates: Row[]; passReasons?: string[]; full?: boolean; ranking?: { waiting: number } }>("candidates", undefined, `?jd=${jd.id}`).then(d => { setCands(d.candidates); setPassReasons(d.passReasons ?? []); setFull(!!d.full); setWaiting(d.ranking?.waiting ?? 0); }).catch(e => say(e.message));
    api<Pipe>("pipeline", undefined, `?jd=${jd.id}`).then(setPipe).catch(e => say(e.message));
  }, [jd.id, say]);
  useEffect(() => { load(); }, [load]);
  const closed = jd.status === "closed";
  const post = async (action: string, body: object) => { try { const d = await api<{ message: string; link?: string }>(action, body); if (d.link) showLink(d.message, d.link); else say(d.message); setForm(null); load(); reload(); } catch (e) { say((e as Error).message); } };
  const today = new Date().toISOString().slice(0, 10);
  const loadPassed = () => api<{ passed: Row[] }>("passed", undefined, `?jd=${jd.id}`).then(d => setPassed(d.passed)).catch(e => say(e.message));
  const cvLink = (candidateId: unknown) => `/api/platform/recruiting/cv?jd=${jd.id}&candidate=${candidateId}`;
  const contactLine = (candidateId: string) => contacts[candidateId]
    ? <p className="pj-muted">Phone: <b>{contacts[candidateId].phone || "not given"}</b> · Email: <b>{contacts[candidateId].email || "not given"}</b></p>
    : <button type="button" className="pj-link" onClick={() => showContact(candidateId)}>Show phone and email</button>;
  return <div className="pj-list" style={{ marginTop: 12 }}>
    <h3>Pipeline</h3>
    {pipe?.tests && canEdit && !closed && <label className="pj-row pj-muted"><input type="checkbox" checked={pipe.tests.aptitudeOpted} onChange={ev => post("job-aptitude", { jdId: jd.id, on: ev.target.checked })} /> The client has opted for the aptitude and soft-skills test on this job (team manager or admin)</label>}
    {!pipe ? <p className="pj-muted">Loading…</p> : pipe.pipeline.length === 0 ? <p className="pj-muted">Nobody in the client&apos;s pipeline yet.</p> : pipe.pipeline.map(e => <div className="pj-note" key={e.id}>
      <b>{e.name}</b> <span className="pj-pill">{e.stageLabel}</span>{e.stageReason ? <span className="pj-muted"> · {e.stageReason.replace(/_/g, " ")}</span> : null}
      {(e.offerCtcInr || e.offerDate || e.joiningDate || e.lastWorkingDay || e.competingOffers) && <p className="pj-muted">{[e.offerCtcInr ? `Offer ${lpa(e.offerCtcInr)}` : "", e.offerDate ? `offered ${day(e.offerDate)}` : "", e.joiningDate ? `joining ${day(e.joiningDate)}` : "", e.lastWorkingDay ? `last day at current job ${day(e.lastWorkingDay)}` : "", e.competingOffers ? `other offers: ${e.competingOffers}` : ""].filter(Boolean).join(" · ")}</p>}
      {e.recruiterNote && <p className="pj-muted"><b>Your note to the client:</b> {e.recruiterNote}</p>}
      {e.interviews.map(i => <div className="pj-muted" key={i.id}>
        <p>{i.round} · {when(i.scheduled_at)} · {i.mode.replace("_", " ")}{i.location ? ` · ${i.location}` : ""}{i.interviewer ? ` · interviewer ${i.interviewer}` : ""} · {i.status.replace("_", " ")}{i.status === "completed" ? `: ${OUTCOME[i.outcome] ?? i.outcome}${i.rating ? `, rated ${i.rating}/5` : ""}` : ""}
          {i.status === "scheduled" && canEdit && e.available && <> · <button className="pj-link" onClick={() => setForm({ id: i.id, kind: "iv-record" })}>Record the result</button> · <button className="pj-link" onClick={() => setForm({ id: i.id, kind: "iv-reschedule" })}>Reschedule</button></>}</p>
        {i.feedback && <p><b>Client&apos;s feedback:</b> {i.feedback}</p>}
        {form?.id === i.id && form.kind === "iv-record" && <form className="pj-form" onSubmit={(ev: FormEvent<HTMLFormElement>) => { ev.preventDefault(); const f = Object.fromEntries(new FormData(ev.currentTarget).entries()) as Record<string, string>; post("interview-record", { interviewId: i.id, status: f.status, outcome: f.outcome, rating: f.rating, feedback: f.feedback, rejectReason: f.rejectReason }); }}>
          <h3 className="full">Record the result for the client: {i.round}</h3>
          <label>What happened<select name="status"><option value="completed">Interview completed</option><option value="no_show">Candidate did not attend</option><option value="cancelled">Cancelled</option></select></label>
          <label>Outcome<select name="outcome"><option value="advance">Move forward</option><option value="hold">On hold</option><option value="reject">Do not proceed</option><option value="pending">Decision pending</option></select></label>
          <label>Rating (1–5)<select name="rating" defaultValue=""><option value="">No rating</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
          <label>If “Do not proceed”: mark the candidate not selected <select name="rejectReason" defaultValue=""><option value="">Not yet</option>{(pipe.reasons.rejected ?? []).map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}</select></label>
          <label className="full">What the client told you<textarea name="feedback" rows={2} maxLength={2000} /></label>
          <p className="full pj-muted">Recorded as entered by Jobboard300 on the client&apos;s behalf, and the client is told.</p>
          <div className="full pj-row"><button className="pj-btn">Save</button><button type="button" className="pj-link" onClick={() => setForm(null)}>Cancel</button></div></form>}
        {form?.id === i.id && form.kind === "iv-reschedule" && <form className="pj-form" onSubmit={(ev: FormEvent<HTMLFormElement>) => { ev.preventDefault(); const f = Object.fromEntries(new FormData(ev.currentTarget).entries()) as Record<string, string>; post("interview-reschedule", { interviewId: i.id, scheduledAt: f.when ? new Date(f.when).toISOString() : "", mode: f.mode, location: f.location, interviewer: f.interviewer }); }}>
          <h3 className="full">Reschedule: {i.round}</h3>
          <label>New date and time<input name="when" type="datetime-local" required min={nowLocal()} defaultValue={new Date(new Date(i.scheduled_at).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)} /></label>
          <label>Mode<select name="mode" defaultValue={i.mode}><option value="video">Video link</option><option value="phone">Phone</option><option value="in_person">In person</option></select></label>
          <label>Link or address<input name="location" maxLength={300} defaultValue={i.location} /></label><label>Interviewer<input name="interviewer" maxLength={120} defaultValue={i.interviewer} /></label>
          <p className="full pj-muted">The candidate and the client each get one message with the new time.</p>
          <div className="full pj-row"><button className="pj-btn">Save new time</button><button type="button" className="pj-link" onClick={() => setForm(null)}>Cancel</button></div></form>}
      </div>)}
      {(e.tests ?? []).map((t, i) => <p className="pj-muted" key={i}>Test: {t.title} · {t.status === "completed" ? `${t.band} (level ${t.level} of 10). For staff only: never share the level with the client.` : t.status.replace("_", " ")}</p>)}
      <Tech results={e.technical} />
      {e.commitment && <p className="pj-muted">Offer commitment: {e.commitment === "accepted" ? "accepted by the candidate" : "sent, not yet accepted"}{e.commitment === "pending" && canEdit ? <> · <button className="pj-link" onClick={() => post("commitment-link", { pipelineId: e.id })}>Get a new link to send</button></> : null}</p>}
      {e.available && e.candidateId && <div className="pj-row">
        <button type="button" className="pj-link" onClick={() => setProfiles(profiles === e.candidateId ? null : e.candidateId)}>{profiles === e.candidateId ? "Hide profile" : "View profile"}</button>
        <a className="pj-link" href={cvLink(e.candidateId)} target="_blank" rel="noopener noreferrer">View CV</a>
        {canEdit && contactLine(e.candidateId)}</div>}
      {profiles === e.candidateId && <ProfilePanel jdId={String(jd.id)} candidateId={e.candidateId} say={say} />}
      {canEdit && e.available && (pipe.tests?.banks.length ?? 0) > 0 && <div className="pj-row"><select value="" aria-label="Send a test" onChange={ev => ev.target.value && post("test-invite", { pipelineId: e.id, bankId: ev.target.value })}><option value="">Send a test…</option>{pipe.tests!.banks.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}</select></div>}
      {canEdit && e.available && <div className="pj-row">
        {["shortlisted", "interview"].includes(e.stage) && <button className="pj-link" onClick={() => setForm({ id: e.id, kind: "interview" })}>Schedule interview</button>}
        {e.next.length > 0 && <select value="" aria-label="Update stage" onChange={ev => ev.target.value && setForm({ id: e.id, kind: `stage:${ev.target.value}` })}><option value="">Update stage…</option>{e.next.map(s => <option key={s} value={s}>{pipe.labels[s]}</option>)}</select>}
      </div>}
      {form?.id === e.id && form.kind === "interview" && <form className="pj-form" onSubmit={(ev: FormEvent<HTMLFormElement>) => { ev.preventDefault(); const f = Object.fromEntries(new FormData(ev.currentTarget).entries()) as Record<string, string>; post("interview", { pipelineId: e.id, round: f.round, scheduledAt: f.when ? new Date(f.when).toISOString() : "", mode: f.mode, location: f.location, interviewer: f.interviewer }); }}>
        <label>Round<input name="round" required placeholder="Technical 1" /></label><label>Date and time<input name="when" type="datetime-local" required min={nowLocal()} /></label>
        <label>Mode<select name="mode"><option value="video">Video link</option><option value="phone">Phone</option><option value="in_person">In person</option></select></label>
        <label>Link or address<input name="location" maxLength={300} /></label><label>Interviewer<input name="interviewer" maxLength={120} /></label>
        <div className="full pj-row"><button className="pj-btn">Schedule</button><button type="button" className="pj-link" onClick={() => setForm(null)}>Cancel</button></div></form>}
      {form?.id === e.id && form.kind.startsWith("stage:") && (() => { const stage = form.kind.slice(6), reasons = pipe.reasons[stage]; return <form className="pj-form" onSubmit={(ev: FormEvent<HTMLFormElement>) => { ev.preventDefault(); const f = Object.fromEntries(new FormData(ev.currentTarget).entries()) as Record<string, string>; post("stage", { pipelineId: e.id, stage, reason: f.reason, note: f.note, joiningDate: f.joiningDate, lastWorkingDay: f.lastWorkingDay, competingOffers: f.competingOffers, offerCtcInr: f.offerLpa ? Math.round(Number(f.offerLpa) * 100_000) : null }); }}>
        <h3 className="full">Move to “{pipe.labels[stage]}”</h3>
        {reasons && <label>Reason<select name="reason" required defaultValue=""><option value="" disabled>Choose…</option>{reasons.map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}</select></label>}
        {stage === "offered" && <label>Offered annual CTC (LPA)<input name="offerLpa" type="number" step={0.1} min={0.5} /></label>}
        {stage === "joined" && <label>Annual CTC they joined at (LPA) <span className="pj-muted">The placement fee is worked out from it.</span><input name="offerLpa" type="number" step={0.1} min={0.5} required defaultValue={e.offerCtcInr ? e.offerCtcInr / 100_000 : ""} /></label>}
        {(stage === "offer_accepted" || stage === "joined") && <label>{stage === "joined" ? "Joined on" : "Expected joining date"}<input name="joiningDate" type="date" required defaultValue={stage === "joined" ? today : ""} /></label>}
        {stage === "offer_accepted" && <><label>Last working day at current employer<input name="lastWorkingDay" type="date" /></label><label>Other offers in hand (if known)<input name="competingOffers" maxLength={300} placeholder="e.g. one offer at ₹14 LPA, decision by 20 Dec" /></label></>}
        <label className="full">Note<input name="note" maxLength={1000} /></label>
        <div className="full pj-row"><button className="pj-btn">Save</button><button type="button" className="pj-link" onClick={() => setForm(null)}>Cancel</button></div></form>; })()}
    </div>)}
    {!closed && <>
      <h3>Candidates to submit</h3>
      {waiting > 0 && <p className="pj-notice" role="status">Ranking in progress: {waiting} item{waiting === 1 ? " is" : "s are"} still being scored, so this list may be incomplete. <button type="button" className="pj-link" onClick={load}>Check again</button></p>}
      {!full && <p className="pj-muted">You see the three best candidates at a time. Submit one, or pass with a reason, and the next best appears. Pass reasons are reviewed to improve matching.</p>}
      {!cands ? <p className="pj-muted">Loading…</p> : cands.length === 0 ? <p className="pj-muted">No more candidates for this job right now.</p> : cands.map(c => { const cid = String(c.candidate_id); return <div className="pj-note" key={cid}>
        <b>{c.display_name || "Candidate"}</b> <span className="pj-pill">{c.source === "website" ? "Website applicant" : "Portal"}</span> <span className="pj-muted">· {c.current_city || "city not stated"}{c.score == null ? (c.band ? ` · ${c.band}` : "") : ` · score ${Math.round(Number(c.score))}`} · {Number(c.hard_pass) ? "meets the hard filters" : "misses a hard filter"}{Number(c.in_pipeline) ? " · already submitted" : ""}</span>
        <p className="pj-muted">{c.explanation}</p>
        {Array.isArray(c.questions) && (c.questions as unknown as string[]).length > 0 && <div className="pj-notice"><b>Ask the candidate</b><ul>{(c.questions as unknown as string[]).map(q => <li key={q}>{q}</li>)}</ul><span className="pj-muted">Not found in the CV is not the same as no. Nobody is filtered out for it.</span></div>}
        {Number(c.fast_track) > 0 && <span className="pj-pill">Fast Track</span>}
        <Tech results={c.technical as unknown as Technical[]} />
        {Number(c.early_exits) > 0 && <p className="pj-notice bad">Left a previous placement within the 60-day guarantee ({String(c.early_exits)} time{Number(c.early_exits) > 1 ? "s" : ""}). Ask why before submitting.</p>}
        {c.passed ? <p className="pj-muted">Passed: {String(c.passed).replace(/_/g, " ")}</p> : null}
        {!Number(c.in_pipeline) && !Number(c.can_share) && <p className="pj-muted">Has not agreed to their CV being shared with employers. Ask them first.</p>}
        <div className="pj-row">
          <button type="button" className="pj-link" onClick={() => setProfiles(profiles === cid ? null : cid)}>{profiles === cid ? "Hide profile" : "View profile"}</button>
          <a className="pj-link" href={cvLink(cid)} target="_blank" rel="noopener noreferrer">View CV</a>
          {canEdit && contactLine(cid)}</div>
        {profiles === cid && <ProfilePanel jdId={String(jd.id)} candidateId={cid} say={say} />}
        {canEdit && !Number(c.in_pipeline) && Number(c.can_share) > 0 && <form className="pj-row" onSubmit={(ev: FormEvent<HTMLFormElement>) => { ev.preventDefault(); post("submit", { jdId: jd.id, candidateId: c.candidate_id, note: new FormData(ev.currentTarget).get("note") }); }}>
          <input name="note" required maxLength={2000} placeholder="Why this candidate, notice, CTC, availability" style={{ minWidth: "min(380px, 100%)" }} /><button className="pj-btn">Submit to client</button></form>}
        {canEdit && !Number(c.in_pipeline) && !c.passed && passReasons.length > 0 && <form className="pj-row" onSubmit={(ev: FormEvent<HTMLFormElement>) => { ev.preventDefault(); post("pass", { jdId: jd.id, candidateId: c.candidate_id, reason: new FormData(ev.currentTarget).get("reason") }); }}>
          <select name="reason" required defaultValue="" aria-label="Reason for passing"><option value="" disabled>Not suitable because…</option>{passReasons.map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}</select><button className="pj-btn quiet">Pass</button></form>}
      </div>; })}
      {!full && canEdit && <div>
        <button type="button" className="pj-link" onClick={() => passed ? setPassed(null) : loadPassed()}>{passed ? "Hide candidates passed on" : "Show candidates passed on"}</button>
        {passed && (passed.length === 0 ? <p className="pj-muted">Nobody has been passed on for this job.</p> : passed.map(p => <div className="pj-row pj-muted" key={String(p.candidate_id)}>
          <span>{p.display_name || "Candidate"} · {String(p.reason).replace(/_/g, " ")} · {day(String(p.passed_at))}</span>
          {(canManage || p.mine) && <button type="button" className="pj-link" onClick={() => post("unpass", { jdId: jd.id, candidateId: p.candidate_id }).then(loadPassed)}>Reconsider</button>}</div>))}
        <p className="pj-muted">A pass can be undone by the person who made it within a day, or by the team manager or an administrator.</p>
      </div>}
    </>}
  </div>;
}
