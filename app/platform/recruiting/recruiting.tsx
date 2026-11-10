"use client";
// Recruiting tool for Jobboard300 staff: assigned clients and jobs, ranked
// candidates to submit, the client's pipeline with stage updates and interview
// scheduling, and (for admins and team managers) assignment.
import { useCallback, useEffect, useState, type FormEvent } from "react";

type Row = Record<string, string | number | null>;
type Work = { role: "admin" | "manager" | "recruiter"; clients: Row[]; jobs: Row[]; members: Row[]; teams: Row[]; canEdit: boolean; me: string; messaging: { scopes: Row[]; queue: Row[] } };
type Entry = { id: string; name: string; stage: string; stageLabel: string; stageReason: string; source: string; available: boolean; recruiterNote: string; next: string[]; interviews: { id: string; round: string; scheduled_at: string; mode: string; status: string; outcome: string }[] };
type Pipe = { pipeline: Entry[]; reasons: Record<string, string[]>; labels: Record<string, string> };

async function api<T>(action: string, body?: object, query = ""): Promise<T> {
  const r = await fetch(`/api/platform/recruiting/${action}${query}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const d = await r.json().catch(() => ({})) as T & { error?: string };
  if (!r.ok) throw new Error(d.error ?? "The request failed.");
  return d;
}
const ROLE = { admin: "Administrator: all clients and jobs", manager: "Team manager: your team's clients and jobs", recruiter: "Recruiter: your team's clients, and jobs assigned to you or to nobody" };
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function Recruiting() {
  const [work, setWork] = useState<Work | null>(null), [notice, setNotice] = useState(""), [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => api<Work>("work").then(setWork).catch(e => setNotice(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const act = async (action: string, body: object) => { try { const d = await api<{ message: string; link?: string }>(action, body); setNotice(d.link ? `${d.message} ${d.link}` : d.message); await load(); return true; } catch (e) { setNotice((e as Error).message); return false; } };
  if (!work) return <p className="pj-muted">{notice || "Loading…"}</p>;
  const canAssign = work.role !== "recruiter" && work.canEdit;
  return <div className="pj-main" style={{ padding: 0 }}>
    {notice && <p className="pj-notice" role="status">{notice}</p>}
    <p className="pj-muted">{ROLE[work.role]}.</p>

    <section className="pj-card"><h2>Jobs</h2>
      {work.jobs.length === 0 ? <p className="pj-muted">No jobs are assigned to you or your team yet.</p> : <div className="pj-list">{work.jobs.map(j => <article className="pj-item" key={String(j.id)}>
        <div><b>{j.title}</b> <span className="pj-pill">{j.status}</span> <span className="pj-pill">{j.service === "managed" ? "Managed search" : "Self-service"}</span>
          <p className="pj-muted">{j.company} · {j.openings} opening(s) · {j.in_process} in process · {j.joined} joined · {j.recruiter ? `Assigned to ${j.recruiter}` : "Unassigned"}</p>
          {canAssign && <label className="pj-muted">Assign to <select value={String(j.recruiter_id ?? "")} onChange={e => act("assign-recruiter", { jdId: j.id, userId: e.target.value })}><option value="">Nobody</option>{work.members.filter(m => m.team_id === j.team_id).map(m => <option key={String(m.user_id)} value={String(m.user_id)}>{m.name || m.email}</option>)}</select></label>}
          {open === j.id && <JobWork jd={j} canEdit={work.canEdit} say={setNotice} reload={load} />}
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

function JobWork({ jd, canEdit, say, reload }: { jd: Row; canEdit: boolean; say: (t: string) => void; reload: () => void }) {
  const [cands, setCands] = useState<Row[] | null>(null), [pipe, setPipe] = useState<Pipe | null>(null), [form, setForm] = useState<{ id: string; kind: string } | null>(null);
  const load = useCallback(() => {
    api<{ candidates: Row[] }>("candidates", undefined, `?jd=${jd.id}`).then(d => setCands(d.candidates)).catch(e => say(e.message));
    api<Pipe>("pipeline", undefined, `?jd=${jd.id}`).then(setPipe).catch(e => say(e.message));
  }, [jd.id, say]);
  useEffect(() => { load(); }, [load]);
  const post = async (action: string, body: object) => { try { say((await api<{ message: string }>(action, body)).message); setForm(null); load(); reload(); } catch (e) { say((e as Error).message); } };
  const today = new Date().toISOString().slice(0, 10);
  return <div className="pj-list" style={{ marginTop: 12 }}>
    <h3>Pipeline</h3>
    {!pipe ? <p className="pj-muted">Loading…</p> : pipe.pipeline.length === 0 ? <p className="pj-muted">Nobody in the client&apos;s pipeline yet.</p> : pipe.pipeline.map(e => <div className="pj-note" key={e.id}>
      <b>{e.name}</b> <span className="pj-pill">{e.stageLabel}</span>{e.stageReason ? <span className="pj-muted"> · {e.stageReason.replace(/_/g, " ")}</span> : null}
      {e.interviews.map(i => <p className="pj-muted" key={i.id}>{i.round} · {when(i.scheduled_at)} · {i.mode.replace("_", " ")} · {i.status}{i.status === "completed" ? `: ${i.outcome}` : ""}</p>)}
      {canEdit && e.available && <div className="pj-row">
        {["shortlisted", "interview"].includes(e.stage) && <button className="pj-link" onClick={() => setForm({ id: e.id, kind: "interview" })}>Schedule interview</button>}
        {e.next.length > 0 && <select value="" aria-label="Update stage" onChange={ev => ev.target.value && setForm({ id: e.id, kind: `stage:${ev.target.value}` })}><option value="">Update stage…</option>{e.next.map(s => <option key={s} value={s}>{pipe.labels[s]}</option>)}</select>}
      </div>}
      {form?.id === e.id && form.kind === "interview" && <form className="pj-form" onSubmit={(ev: FormEvent<HTMLFormElement>) => { ev.preventDefault(); const f = Object.fromEntries(new FormData(ev.currentTarget).entries()) as Record<string, string>; post("interview", { pipelineId: e.id, round: f.round, scheduledAt: f.when ? new Date(f.when).toISOString() : "", mode: f.mode, location: f.location, interviewer: f.interviewer }); }}>
        <label>Round<input name="round" required placeholder="Technical 1" /></label><label>Date and time<input name="when" type="datetime-local" required /></label>
        <label>Mode<select name="mode"><option value="video">Video link</option><option value="phone">Phone</option><option value="in_person">In person</option></select></label>
        <label>Link or address<input name="location" maxLength={300} /></label><label>Interviewer<input name="interviewer" maxLength={120} /></label>
        <div className="full pj-row"><button className="pj-btn">Schedule</button><button type="button" className="pj-link" onClick={() => setForm(null)}>Cancel</button></div></form>}
      {form?.id === e.id && form.kind.startsWith("stage:") && (() => { const stage = form.kind.slice(6), reasons = pipe.reasons[stage]; return <form className="pj-form" onSubmit={(ev: FormEvent<HTMLFormElement>) => { ev.preventDefault(); const f = Object.fromEntries(new FormData(ev.currentTarget).entries()) as Record<string, string>; post("stage", { pipelineId: e.id, stage, reason: f.reason, note: f.note, joiningDate: f.joiningDate, offerCtcInr: f.offerLpa ? Math.round(Number(f.offerLpa) * 100_000) : null }); }}>
        <h3 className="full">Move to “{pipe.labels[stage]}”</h3>
        {reasons && <label>Reason<select name="reason" required defaultValue=""><option value="" disabled>Choose…</option>{reasons.map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}</select></label>}
        {stage === "offered" && <label>Offered annual CTC (LPA)<input name="offerLpa" type="number" step={0.1} min={0.5} /></label>}
        {(stage === "offer_accepted" || stage === "joined") && <label>{stage === "joined" ? "Joined on" : "Expected joining date"}<input name="joiningDate" type="date" required defaultValue={stage === "joined" ? today : ""} /></label>}
        <label className="full">Note<input name="note" maxLength={1000} /></label>
        <div className="full pj-row"><button className="pj-btn">Save</button><button type="button" className="pj-link" onClick={() => setForm(null)}>Cancel</button></div></form>; })()}
    </div>)}
    <h3>Candidates to submit</h3>
    {jd.service !== "managed" && <p className="pj-muted">This is a self-service job: the client unlocks profiles itself. Submissions open when the client switches it to a managed search.</p>}
    {!cands ? <p className="pj-muted">Loading…</p> : cands.length === 0 ? <p className="pj-muted">No scored candidates for this job yet.</p> : cands.map(c => <div className="pj-note" key={String(c.candidate_id)}>
      <b>{c.display_name || "Candidate"}</b> <span className="pj-pill">{c.source === "website" ? "Website applicant" : "Portal"}</span> <span className="pj-muted">· {c.current_city || "city not stated"} · score {Math.round(Number(c.score))} · {Number(c.hard_pass) ? "meets the hard filters" : "misses a hard filter"}{Number(c.in_pipeline) ? " · already submitted" : ""}</span>
      <p className="pj-muted">{c.explanation}</p>
      {!Number(c.in_pipeline) && !Number(c.can_share) && <p className="pj-muted">Has not agreed to their CV being shared with employers. Ask them first.</p>}
      {canEdit && jd.service === "managed" && !Number(c.in_pipeline) && Number(c.can_share) > 0 && <form className="pj-row" onSubmit={(ev: FormEvent<HTMLFormElement>) => { ev.preventDefault(); post("submit", { jdId: jd.id, candidateId: c.candidate_id, note: new FormData(ev.currentTarget).get("note") }); }}>
        <input name="note" required maxLength={2000} placeholder="Why this candidate, notice, CTC, availability" style={{ minWidth: "min(380px, 100%)" }} /><button className="pj-btn">Submit to client</button></form>}
    </div>)}
  </div>;
}
