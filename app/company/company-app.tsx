"use client";
// Company portal: dashboard with remaining unlocks, JDs (create, correct,
// submit for approval), ranked anonymised matches per JD, unlock (one unit,
// once per candidate), full CV after unlock, and parameter change requests.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { post } from "../portal/forms";

type Dashboard = { company: { display_name: string; status: string; city: string }; params: { version: number; params: Params } | null; pendingRequest: { version: number } | null; quota: { remaining: number; unlockedTotal: number; plans: { plan: string; remaining: number; total: number; endsAt: string }[] }; jds: { id: string; title: string; status: string; decision_note: string; released: number; unlocked: number }[] };
type Params = { minScore: number; roleFamilies: string[]; seniority: string[]; cities: string[]; allowRemote: boolean; ctcBands: { minInr: number; maxInr: number }[]; maxNoticeDays: number | null; maxReleasePerJd: number; maxLiveJds: number; mandatoryFilters: string[] };
type Match = { ref: string; title: string; roleFamily: string; seniority: string; yearsExperience: number; keySkills: string[]; city: string; relocate: string; education: string; notice: string; expectedCtc: string; score: number; lowerBound: number; explanation: { summary: string; meets: string[]; misses: string[]; why: string }; assessed: string[]; unlocked: boolean };
type Full = { traceId: string; unlockedAt: string; profile: { contact: { name: string; email: string; phone: string; links: string[] }; headline: string; summary: string; work: { title: string; employer: string; location: string; start: string | null; end: string | null; current: boolean; highlights: string[] }[]; education: { qualification: string; field: string; institution: string; year: number | null }[]; skills: { name: string; evidence: string }[]; certifications: string[]; languages: string[]; india: { yearsExperience: number; noticeDays: number | null; ctcCurrentInr: number | null; ctcExpectedInr: number | null; currentCity: string } }; applications: { id: string; status: string; title: string }[] };

const lpa = (n: number | null) => n === null ? "not stated" : `₹${(n / 100_000).toFixed(1)} LPA`;
async function get<T>(path: string): Promise<T> {
  const r = await fetch(path, { cache: "no-store" });
  const d = await r.json() as T & { error?: string; code?: string };
  if (!r.ok) throw Object.assign(new Error(d.error ?? "Could not load."), { code: d.code });
  return d;
}

export default function CompanyApp({ owner }: { owner: boolean }) {
  const [view, setView] = useState<{ name: "home" } | { name: "new" } | { name: "jd"; id: string } | { name: "matches"; id: string; title: string } | { name: "candidate"; ref: string } | { name: "params" }>({ name: "home" });
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [notice, setNotice] = useState<{ text: string; bad?: boolean; upgrade?: boolean } | null>(null);
  const load = useCallback(() => get<Dashboard>("/api/portal/company/dashboard").then(setDash).catch(e => setNotice({ text: e.message, bad: true })), []);
  useEffect(() => { load(); }, [load, view]);
  const say = (text: string, bad = false, upgrade = false) => setNotice({ text, bad, upgrade });
  async function signOut() { await post("/api/portal/auth/sign-out", {}); window.location.assign("/portal/sign-in"); }
  const active = dash?.company.status === "active";
  return <>
    <header className="pj-top">
      <a className="pj-brand" href="/company">Job Point · {dash?.company.display_name ?? "Hiring"}</a>
      <nav aria-label="Company">
        <button aria-current={view.name === "home" ? "page" : undefined} onClick={() => setView({ name: "home" })}>Dashboard</button>
        {active && <button aria-current={view.name === "new" ? "page" : undefined} onClick={() => setView({ name: "new" })}>Post a job</button>}
        <button aria-current={view.name === "params" ? "page" : undefined} onClick={() => setView({ name: "params" })}>Matching rules</button>
      </nav>
      <form onSubmit={e => { e.preventDefault(); signOut(); }}><button>Sign out</button></form>
    </header>
    <main className="pj-main">
      {notice && <p className={`pj-notice ${notice.bad ? "bad" : "good"}`} role="status">{notice.text}{notice.upgrade && <> <b>Upgrade:</b> contact Job Point to move to Starter (100 unlocks), Growth (250) or Pro (500).</>}</p>}
      {dash && !active && <section className="pj-card"><h2>Your account is being reviewed</h2><p>Job Point checks every hiring company and sets the rules for which CVs you receive. You can post jobs once your account is approved.</p></section>}
      {dash && view.name === "home" && <Home dash={dash} open={(id, title) => setView({ name: "matches", id, title })} edit={id => setView({ name: "jd", id })} />}
      {view.name === "new" && <NewJd created={id => setView({ name: "jd", id })} say={say} />}
      {view.name === "jd" && <JdEditor id={view.id} say={say} done={() => setView({ name: "home" })} />}
      {view.name === "matches" && <Matches id={view.id} title={view.title} say={say} open={ref => setView({ name: "candidate", ref })} reload={load} />}
      {view.name === "candidate" && <Candidate refId={view.ref} say={say} back={() => setView({ name: "home" })} />}
      {view.name === "params" && dash && <ParamsView dash={dash} owner={owner} say={say} reload={load} />}
    </main>
  </>;
}

function Home({ dash, open, edit }: { dash: Dashboard; open: (id: string, title: string) => void; edit: (id: string) => void }) {
  const STATUS: Record<string, string> = { draft: "Draft", pending: "Waiting for Job Point approval", live: "Live", paused: "Paused", rejected: "Changes needed" };
  return <>
    <div className="pj-stats">
      <div><span className="pj-muted">Unlocks remaining</span><b>{dash.quota.remaining}</b><span className="pj-muted">{dash.quota.plans.map(p => `${p.plan}: ${p.remaining}/${p.total} until ${p.endsAt.slice(0, 10)}`).join(" · ") || "No active plan"}</span></div>
      <div><span className="pj-muted">Profiles unlocked</span><b>{dash.quota.unlockedTotal}</b><span className="pj-muted">They stay available even after your plan ends.</span></div>
      <div><span className="pj-muted">Live jobs</span><b>{dash.jds.filter(j => j.status === "live").length}</b><span className="pj-muted">of {dash.params?.params.maxLiveJds ?? 0} allowed</span></div>
    </div>
    <section className="pj-card"><h2>Your jobs</h2>
      {dash.jds.length === 0 ? <p>No jobs yet. Post a job description and Job Point will approve it against your matching rules.</p> :
        <div className="pj-list">{dash.jds.map(j => <article className="pj-item" key={j.id}>
          <div><b>{j.title}</b><p className="pj-muted">{STATUS[j.status] ?? j.status}{j.status === "live" ? ` · ${j.released} strong match(es) · ${j.unlocked} unlocked` : ""}</p>{j.decision_note && j.status !== "live" && <p className="pj-muted">{j.decision_note}</p>}</div>
          <div className="pj-row">{j.status === "live" && <button className="pj-btn" onClick={() => open(j.id, j.title)}>View matches</button>}<button className="pj-btn quiet" onClick={() => edit(j.id)}>{j.status === "live" ? "Edit" : "Open"}</button></div>
        </article>)}</div>}
    </section>
  </>;
}

function NewJd({ created, say }: { created: (id: string) => void; say: (t: string, bad?: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); const f = Object.fromEntries(new FormData(e.currentTarget).entries());
    try { const r = await post<{ id: string }>("/api/portal/company/jd-create", f); say("Draft created. Check the requirements we read from your job description, then submit it."); created(r.id); }
    catch (err) { say((err as Error).message, true); } finally { setBusy(false); }
  }
  return <section className="pj-card"><h2>Post a job</h2>
    <form className="pj-form" onSubmit={submit}>
      <label>Job title<input name="title" required maxLength={160} /></label>
      <label>Location<input name="location" required placeholder="e.g. Durgapur" /></label>
      <label>Work mode<select name="workMode"><option>On-site</option><option>Hybrid</option><option>Remote</option></select></label>
      <label className="full">Job description <span className="pj-muted">Include responsibilities, must-have skills (&ldquo;Must have &hellip;&rdquo;), years of experience, education, CTC range and notice period.</span><textarea name="text" required minLength={80} rows={12} /></label>
      <div className="full"><button className="pj-btn" disabled={busy}>{busy ? "Reading…" : "Create draft"}</button></div>
    </form>
  </section>;
}

function JdEditor({ id, say, done }: { id: string; say: (t: string, bad?: boolean) => void; done: () => void }) {
  type Req = { title: string; mustHave: { name: string }[]; niceToHave: { name: string }[]; minYears: number | null; maxYears: number | null; educationLevel: number | null; hard: { cities: string[]; remote: boolean; allowRelocation: boolean; mandatorySkills: { name: string }[]; maxNoticeDays: number | null; ctcMinInr: number | null; ctcMaxInr: number | null } };
  const [data, setData] = useState<{ jd: { title: string; status: string; requirements: string; decision_note: string } } | null>(null);
  const load = useCallback(() => get<typeof data>(`/api/portal/company/jd?id=${id}`).then(setData).catch(e => say(e.message, true)), [id, say]);
  useEffect(() => { load(); }, [load]);
  if (!data) return <p className="pj-muted">Loading…</p>;
  const r = JSON.parse(data.jd.requirements) as Req;
  const names = (xs: { name: string }[]) => xs.map(x => x.name).join(", ");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); const n = (k: string, s = 1) => f.get(k) === "" ? null : Number(f.get(k)) * s;
    const requirements = { title: f.get("title"), mustHave: f.get("mustHave"), niceToHave: f.get("niceToHave"), minYears: n("minYears"), maxYears: n("maxYears"), educationLevel: f.get("educationLevel") || null,
      hard: { cities: f.get("cities"), remote: f.get("remote") === "yes", allowRelocation: f.get("relocation") === "yes", mandatorySkills: f.get("mandatory"), maxNoticeDays: n("notice"), ctcMinInr: n("ctcMin", 100_000), ctcMaxInr: n("ctcMax", 100_000) } };
    try { say((await post<{ message: string }>("/api/portal/company/jd-update", { jdId: id, requirements })).message); load(); } catch (err) { say((err as Error).message, true); }
  }
  async function submit() { try { say((await post<{ message: string; conflicts: string[] }>("/api/portal/company/jd-submit", { jdId: id })).message); done(); } catch (err) { say((err as Error).message, true); } }
  async function close() { if (!window.confirm("Close this job? Unlocked profiles stay available.")) return; try { say((await post<{ message: string }>("/api/portal/company/jd-close", { jdId: id })).message); done(); } catch (err) { say((err as Error).message, true); } }
  return <section className="pj-card"><h2>{data.jd.title}</h2>
    <p className="pj-muted">Status: {data.jd.status}{data.jd.decision_note ? ` · ${data.jd.decision_note}` : ""}. Editing a live job sends it back to Job Point for approval.</p>
    <form className="pj-form" key={data.jd.requirements} onSubmit={save}>
      <label className="full">Job title<input name="title" defaultValue={r.title} /></label>
      <label className="full">Must-have skills<textarea name="mustHave" defaultValue={names([...r.mustHave])} rows={2} /></label>
      <label className="full">Essential (pass/fail) skills <span className="pj-muted">Candidates without these are never shown to you. Keep this short.</span><input name="mandatory" defaultValue={names(r.hard.mandatorySkills)} /></label>
      <label className="full">Nice-to-have skills<textarea name="niceToHave" defaultValue={names(r.niceToHave)} rows={2} /></label>
      <label>Minimum years<input name="minYears" type="number" step={0.5} min={0} defaultValue={r.minYears ?? ""} /></label>
      <label>Maximum years<input name="maxYears" type="number" step={0.5} min={0} defaultValue={r.maxYears ?? ""} /></label>
      <label>Cities<input name="cities" defaultValue={r.hard.cities.join(", ")} /></label>
      <label>Remote<select name="remote" defaultValue={r.hard.remote ? "yes" : "no"}><option value="no">No</option><option value="yes">Yes</option></select></label>
      <label>Accept candidates willing to relocate<select name="relocation" defaultValue={r.hard.allowRelocation ? "yes" : "no"}><option value="yes">Yes</option><option value="no">No</option></select></label>
      <label>Maximum notice (days)<input name="notice" type="number" min={0} max={180} defaultValue={r.hard.maxNoticeDays ?? ""} /></label>
      <label>CTC from (LPA)<input name="ctcMin" type="number" step={0.1} min={0} defaultValue={r.hard.ctcMinInr ? r.hard.ctcMinInr / 100_000 : ""} /></label>
      <label>CTC up to (LPA)<input name="ctcMax" type="number" step={0.1} min={0} defaultValue={r.hard.ctcMaxInr ? r.hard.ctcMaxInr / 100_000 : ""} /></label>
      <label>Minimum education<select name="educationLevel" defaultValue={r.educationLevel ?? ""}><option value="">Not required</option><option value="2">12th</option><option value="3">Diploma / ITI</option><option value="4">Graduate</option><option value="5">Postgraduate / professional</option></select></label>
      <div className="full pj-row"><button className="pj-btn quiet">Save changes</button>{["draft", "rejected", "paused"].includes(data.jd.status) && <button type="button" className="pj-btn" onClick={submit}>Submit for approval</button>}{data.jd.status !== "closed" && <button type="button" className="pj-link" onClick={close}>Close job</button>}</div>
    </form>
  </section>;
}

function Matches({ id, title, say, open, reload }: { id: string; title: string; say: (t: string, bad?: boolean, up?: boolean) => void; open: (ref: string) => void; reload: () => void }) {
  const [data, setData] = useState<{ matches: Match[]; message: string } | null>(null);
  const load = useCallback(() => get<{ matches: Match[]; message: string }>(`/api/portal/company/matches?jd=${id}`).then(setData).catch(e => say(e.message, true)), [id, say]);
  useEffect(() => { load(); }, [load]);
  async function unlock(ref: string) {
    try { const r = await post<{ message: string }>("/api/portal/company/unlock", { ref, jdId: id }); say(r.message); reload(); open(ref); }
    catch (e) { const msg = (e as Error).message; say(msg, true, /quota|upgrade|expired/i.test(msg)); }
  }
  return <section className="pj-card"><h2>Matches for {title}</h2>
    <p className="pj-muted">Ranked by the confidence-adjusted score. Summaries are anonymous until you unlock: no names, contacts, employers or institutions. Unlocking uses one unit, once per candidate across all your jobs.</p>
    {!data ? <p className="pj-muted">Loading…</p> : data.matches.length === 0 ? <p className="pj-notice">{data.message}</p> :
      <div className="pj-list">{data.matches.map(m => <article className="pj-item" key={m.ref}>
        <div><b>{m.title}</b> <span className="pj-muted">· {m.seniority} · {m.yearsExperience} yrs · {m.city}{m.relocate === "yes" ? " (will relocate)" : ""}</span>
          <div className="pj-chips">{m.keySkills.map(s => <span key={s}>{s}</span>)}</div>
          <p className="pj-muted">{m.education} · Notice: {m.notice} · Expected: {m.expectedCtc}{m.assessed.length ? ` · Tested: ${m.assessed.join(", ")}` : ""}</p>
          <p>{m.explanation.summary}</p>
          {m.explanation.meets.length > 0 && <p className="pj-muted"><b>Meets:</b> {m.explanation.meets.join("; ")}</p>}
          {m.explanation.misses.length > 0 && <p className="pj-muted"><b>Gaps:</b> {m.explanation.misses.join("; ")}</p>}
          <p className="pj-muted">{m.explanation.why}</p>
        </div>
        <div className="pj-score"><b>{Math.round(m.score)}</b><span className="pj-muted">likely ≥ {Math.round(m.lowerBound)}</span>
          {m.unlocked ? <button className="pj-btn quiet" onClick={() => open(m.ref)}>View CV</button> : <button className="pj-btn" onClick={() => unlock(m.ref)}>Unlock</button>}</div>
      </article>)}</div>}
  </section>;
}

function Candidate({ refId, say, back }: { refId: string; say: (t: string, bad?: boolean) => void; back: () => void }) {
  const [c, setC] = useState<Full | null>(null);
  const load = useCallback(() => get<Full>(`/api/portal/company/candidate?ref=${refId}`).then(setC).catch(e => say(e.message, true)), [refId, say]);
  useEffect(() => { load(); }, [load]);
  async function stage(applicationId: string, status: string) { try { say((await post<{ message: string }>("/api/portal/company/application-status", { applicationId, status })).message); load(); } catch (e) { say((e as Error).message, true); } }
  if (!c) return <p className="pj-muted">Loading… <button className="pj-link" onClick={back}>Back</button></p>;
  const p = c.profile;
  return <section className="pj-card">
    <div className="pj-row" style={{ justifyContent: "space-between" }}><h2>{p.contact.name}</h2><a className="pj-btn" href={`/api/portal/company/download?ref=${refId}`}>Download CV (watermarked PDF)</a></div>
    <p>{p.contact.email} · {p.contact.phone}{p.india.currentCity ? ` · ${p.india.currentCity}` : ""}</p>
    <p className="pj-muted">Unlocked {c.unlockedAt.slice(0, 10)} · Trace {c.traceId}. For this hiring purpose only; do not share. Delete the CV if the candidate asks or is not hired within 90 days.</p>
    <p>{p.india.yearsExperience} years · Notice {p.india.noticeDays ?? "not stated"} days · Current {lpa(p.india.ctcCurrentInr)} · Expected {lpa(p.india.ctcExpectedInr)}</p>
    {p.summary && <p>{p.summary}</p>}
    <h3>Experience</h3><ul>{p.work.map((w, i) => <li key={i}><b>{w.title}</b>{w.employer ? `, ${w.employer}` : ""} ({w.start ?? "?"} – {w.current ? "present" : w.end ?? "?"}){w.highlights.length > 0 && <ul>{w.highlights.slice(0, 5).map((h, k) => <li key={k}>{h}</li>)}</ul>}</li>)}</ul>
    <h3>Education</h3><ul>{p.education.map((e, i) => <li key={i}>{e.qualification}{e.field ? ` (${e.field})` : ""}{e.institution ? `, ${e.institution}` : ""}{e.year ? `, ${e.year}` : ""}</li>)}</ul>
    <h3>Skills</h3><div className="pj-chips">{p.skills.slice(0, 40).map(s => <span key={s.name}>{s.name}{s.evidence === "work" ? " ✓" : ""}</span>)}</div>
    {c.applications.length > 0 && <><h3>Applications to your jobs</h3>{c.applications.map(a => <div className="pj-row" key={a.id}><span>{a.title}: <b>{a.status}</b></span><select defaultValue="" onChange={e => e.target.value && stage(a.id, e.target.value)}><option value="">Update stage…</option>{["shortlisted", "interview", "offer", "hired", "rejected"].map(s => <option key={s} value={s}>{s}</option>)}</select></div>)}</>}
    <button className="pj-link" onClick={back}>Back to dashboard</button>
  </section>;
}

function ParamsView({ dash, owner, say, reload }: { dash: Dashboard; owner: boolean; say: (t: string, bad?: boolean) => void; reload: () => void }) {
  const p = dash.params?.params;
  async function request(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const params = { minScore: Number(f.get("minScore")), roleFamilies: String(f.get("roleFamilies")).split(",").map(s => s.trim()), seniority: String(f.get("seniority")).split(",").map(s => s.trim()), cities: String(f.get("cities")).split(",").map(s => s.trim()).filter(Boolean),
      allowRemote: f.get("allowRemote") === "yes", ctcBands: [{ minInr: Number(f.get("ctcMin")) * 100_000, maxInr: Number(f.get("ctcMax")) * 100_000 }], maxNoticeDays: Number(f.get("maxNoticeDays")), maxReleasePerJd: Number(f.get("maxRelease")), maxLiveJds: p?.maxLiveJds ?? 10, mandatoryFilters: p?.mandatoryFilters ?? [] };
    try { say((await post<{ message: string }>("/api/portal/company/params-request", { params })).message); reload(); } catch (err) { say((err as Error).message, true); }
  }
  return <section className="pj-card"><h2>Matching rules</h2>
    <p className="pj-muted">Job Point sets these rules for your account. You only receive CVs that meet them. A change applies only after Job Point approves it.</p>
    {!p ? <p>Not set yet.</p> : <table className="pj-table"><tbody>
      <tr><th>Minimum match score</th><td>{p.minScore}</td></tr><tr><th>Role families</th><td>{p.roleFamilies.join(", ")}</td></tr><tr><th>Seniority</th><td>{p.seniority.join(", ")}</td></tr>
      <tr><th>Cities</th><td>{p.cities.join(", ") || "Any"}{p.allowRemote ? " + remote" : ""}</td></tr><tr><th>CTC bands</th><td>{p.ctcBands.map(b => `${lpa(b.minInr)}–${lpa(b.maxInr)}`).join("; ") || "Any"}</td></tr>
      <tr><th>Maximum notice</th><td>{p.maxNoticeDays ?? "Any"} days</td></tr><tr><th>Maximum CVs per job</th><td>{p.maxReleasePerJd}</td></tr><tr><th>Version</th><td>{dash.params?.version}</td></tr></tbody></table>}
    {dash.pendingRequest ? <p className="pj-notice">A change request (version {dash.pendingRequest.version}) is waiting for Job Point&apos;s approval.</p> : owner && p && <form className="pj-form" onSubmit={request}>
      <h3 className="full">Request a change</h3>
      <label>Minimum match score<input name="minScore" type="number" min={40} max={95} defaultValue={p.minScore} /></label>
      <label>Role families<input name="roleFamilies" defaultValue={p.roleFamilies.join(", ")} /></label>
      <label>Seniority<input name="seniority" defaultValue={p.seniority.join(", ")} /></label>
      <label>Cities<input name="cities" defaultValue={p.cities.join(", ")} /></label>
      <label>Remote roles<select name="allowRemote" defaultValue={p.allowRemote ? "yes" : "no"}><option value="no">No</option><option value="yes">Yes</option></select></label>
      <label>Maximum notice (days)<input name="maxNoticeDays" type="number" defaultValue={p.maxNoticeDays ?? 90} /></label>
      <label>CTC band from (LPA)<input name="ctcMin" type="number" step={0.5} defaultValue={(p.ctcBands[0]?.minInr ?? 0) / 100_000} /></label>
      <label>CTC band to (LPA)<input name="ctcMax" type="number" step={0.5} defaultValue={(p.ctcBands[0]?.maxInr ?? 5_000_000) / 100_000} /></label>
      <label>Maximum CVs per job<input name="maxRelease" type="number" min={5} max={200} defaultValue={p.maxReleasePerJd} /></label>
      <div className="full"><button className="pj-btn">Send request</button></div>
    </form>}
  </section>;
}
