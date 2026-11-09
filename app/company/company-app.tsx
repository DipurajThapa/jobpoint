"use client";
// Client workspace: overview (pipeline funnel, interviews, offers awaiting
// joining, placements and their replacement guarantee, hiring speed), jobs
// (self-service or managed by Job Point), ranked anonymised matches per job,
// unlock, full CV after unlock, the hiring pipeline with interviews and
// feedback, the team, and matching rules.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { post } from "../portal/forms";

type Overview = {
  funnel: Record<string, number>;
  jobs: { id: string; title: string; status: string; service: string; openings: number; released: number; in_process: number; to_review: number; joined: number }[];
  upcoming: { id: string; round: string; scheduled_at: string; mode: string; location: string; interviewer: string; pipeline_id: string; name: string; jd_title: string }[];
  needsFeedback: { id: string; round: string; scheduled_at: string; pipeline_id: string; name: string; jd_title: string }[];
  joining: { id: string; joining_date: string; offer_ctc_inr: number | null; last_working_day: string | null; competing_offers: string; name: string; jd_title: string; checkpoint: { daysLeft: number; label: string } | null }[];
  placements: { id: string; title: string; joined_on: string; guarantee_ends_on: string; status: string; left_on: string | null; name: string; inGuarantee: boolean }[];
  metrics: { daysToOffer: number | null; daysToJoin: number | null; offerAcceptance: number | null; noShows: number };
};
type Dashboard = { company: { display_name: string; status: string; city: string }; params: { version: number; params: Params } | null; pendingRequest: { version: number } | null; quota: { remaining: number; unlockedTotal: number; plans: { plan: string; remaining: number; total: number; endsAt: string }[] }; jds: { id: string; title: string; status: string; decision_note: string; released: number; unlocked: number }[]; overview: Overview; role: string };
type Interview = { id: string; round: string; scheduled_at: string; mode: string; location: string; interviewer: string; status: string; outcome: string; rating: number | null; feedback: string };
type Entry = { id: string; jdId: string; jdTitle: string; ref: string; stage: string; stageLabel: string; stageReason: string; source: string; name: string; available: boolean; recruiterNote: string; offerCtcInr: number | null; offerDate: string | null; joiningDate: string | null; lastWorkingDay: string | null; competingOffers: string; updatedAt: string; next: string[]; interviews: Interview[] };
type PipelineData = { pipeline: Entry[]; reasons: Record<string, string[]>; labels: Record<string, string> };
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
  const [view, setView] = useState<{ name: "home" } | { name: "jobs" } | { name: "new" } | { name: "jd"; id: string } | { name: "matches"; id: string; title: string } | { name: "candidate"; ref: string } | { name: "pipeline"; jd?: string } | { name: "team" } | { name: "params" }>({ name: "home" });
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [notice, setNotice] = useState<{ text: string; bad?: boolean; upgrade?: boolean } | null>(null);
  const load = useCallback(() => get<Dashboard>("/api/portal/company/dashboard").then(setDash).catch(e => setNotice({ text: e.message, bad: true })), []);
  useEffect(() => { load(); }, [load, view]);
  const say = (text: string, bad = false, upgrade = false) => setNotice({ text, bad, upgrade });
  const go = (v: typeof view) => { setNotice(null); setView(v); };
  async function signOut() { await post("/api/portal/auth/sign-out", {}); window.location.assign("/portal/sign-in"); }
  const active = dash?.company.status === "active";
  return <>
    <header className="pj-top">
      <a className="pj-brand" href="/company">Job Point · {dash?.company.display_name ?? "Hiring"}</a>
      <nav aria-label="Company">
        <button aria-current={view.name === "home" ? "page" : undefined} onClick={() => go({ name: "home" })}>Overview</button>
        <button aria-current={view.name === "jobs" || view.name === "new" ? "page" : undefined} onClick={() => go({ name: "jobs" })}>Jobs</button>
        <button aria-current={view.name === "pipeline" ? "page" : undefined} onClick={() => go({ name: "pipeline" })}>Pipeline</button>
        <button aria-current={view.name === "team" ? "page" : undefined} onClick={() => go({ name: "team" })}>Team</button>
        <button aria-current={view.name === "params" ? "page" : undefined} onClick={() => go({ name: "params" })}>Matching rules</button>
      </nav>
      <form onSubmit={e => { e.preventDefault(); signOut(); }}><button>Sign out</button></form>
    </header>
    <main className="pj-main">
      {notice && <p className={`pj-notice ${notice.bad ? "bad" : "good"}`} role="status">{notice.text}{notice.upgrade && <> <b>Upgrade:</b> contact Job Point to move to Starter (100 unlocks), Growth (250) or Pro (500).</>}</p>}
      {dash && !active && <section className="pj-card"><h2>Your account is being reviewed</h2><p>Job Point checks every hiring company and sets the rules for which CVs you receive. You can post jobs once your account is approved.</p></section>}
      {dash && view.name === "home" && <OverviewView dash={dash} say={say} reload={load} go={(name, jd) => setView(name === "pipeline" ? { name: "pipeline", jd } : { name: "jobs" })} />}
      {dash && view.name === "jobs" && <Home dash={dash} active={active} post={() => setView({ name: "new" })} open={(id, title) => setView({ name: "matches", id, title })} edit={id => setView({ name: "jd", id })} pipeline={jd => setView({ name: "pipeline", jd })} />}
      {view.name === "pipeline" && <Pipeline jd={view.jd} jobs={dash?.overview.jobs ?? []} say={say} reload={load} profile={ref => setView({ name: "candidate", ref })} />}
      {view.name === "team" && <Team say={say} />}
      {view.name === "new" && <NewJd created={id => setView({ name: "jd", id })} say={say} />}
      {view.name === "jd" && <JdEditor id={view.id} say={say} done={() => setView({ name: "home" })} />}
      {view.name === "matches" && <Matches id={view.id} title={view.title} say={say} open={ref => setView({ name: "candidate", ref })} reload={load} />}
      {view.name === "candidate" && <Candidate refId={view.ref} jobs={dash?.overview.jobs ?? []} say={say} back={() => setView({ name: "pipeline" })} />}
      {view.name === "params" && dash && <ParamsView dash={dash} owner={owner} say={say} reload={load} />}
    </main>
  </>;
}

const fmtDate = (iso: string | null) => iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
const fmtTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const MODE: Record<string, string> = { video: "Video", phone: "Phone", in_person: "In person" };

function OverviewView({ dash, say, reload, go }: { dash: Dashboard; say: (t: string, bad?: boolean) => void; reload: () => void; go: (name: "pipeline" | "jobs", jd?: string) => void }) {
  const o = dash.overview, f = o.funnel;
  const inProcess = f.submitted + f.shortlisted + f.interview + f.offered + f.offer_accepted;
  async function exit(id: string) {
    const leftOn = window.prompt("Last working day (YYYY-MM-DD):"); if (!leftOn) return;
    const note = window.prompt("Reason (optional):") ?? "";
    try { say((await post<{ message: string }>("/api/portal/company/placement-exit", { placementId: id, leftOn, note })).message); reload(); } catch (e) { say((e as Error).message, true); }
  }
  const steps: [string, string][] = [["submitted", "To review"], ["shortlisted", "Shortlisted"], ["interview", "Interviewing"], ["offered", "Offer made"], ["offer_accepted", "Offer accepted"], ["joined", "Joined"]];
  return <>
    <div className="pj-stats">
      <div><span className="pj-muted">Candidates in process</span><b>{inProcess}</b><span className="pj-muted">{f.submitted ? `${f.submitted} from Job Point waiting for your review` : "Across your open jobs"}</span></div>
      <div><span className="pj-muted">Interviews in the next 14 days</span><b>{o.upcoming.length}</b><span className="pj-muted">{o.needsFeedback.length ? `${o.needsFeedback.length} past interview(s) need feedback` : "All feedback recorded"}</span></div>
      <div><span className="pj-muted">Offers awaiting joining</span><b>{o.joining.length}</b><span className="pj-muted">Offer acceptance {o.metrics.offerAcceptance === null ? "—" : `${o.metrics.offerAcceptance}%`}</span></div>
      <div><span className="pj-muted">Hires</span><b>{o.placements.length}</b><span className="pj-muted">{o.placements.filter(p => p.inGuarantee).length} inside the replacement guarantee</span></div>
      <div><span className="pj-muted">Unlocks remaining</span><b>{dash.quota.remaining}</b><span className="pj-muted">{dash.quota.plans.map(p => `${p.plan}: until ${p.endsAt.slice(0, 10)}`).join(" · ") || "No active plan"}</span></div>
    </div>
    <section className="pj-card"><h2>Hiring funnel</h2>
      <div className="pj-funnel">{steps.map(([k, label]) => <button key={k} onClick={() => go("pipeline")}><b>{f[k] ?? 0}</b><span>{label}</span></button>)}</div>
      <p className="pj-muted">Median days from shortlist to offer: {o.metrics.daysToOffer ?? "—"} · to joining: {o.metrics.daysToJoin ?? "—"} · Did not join: {o.metrics.noShows} (last 180 days)</p>
    </section>
    {o.needsFeedback.length > 0 && <section className="pj-card"><h2>Interviews waiting for feedback</h2>
      <div className="pj-list">{o.needsFeedback.map(i => <article className="pj-item" key={i.id}><div><b>{i.name}</b> <span className="pj-muted">· {i.jd_title} · {i.round} · {fmtTime(i.scheduled_at)}</span></div><button className="pj-btn quiet" onClick={() => go("pipeline")}>Record feedback</button></article>)}</div></section>}
    <section className="pj-card"><h2>Upcoming interviews</h2>
      {o.upcoming.length === 0 ? <p className="pj-muted">No interviews in the next 14 days.</p> :
        <table className="pj-table"><thead><tr><th>When</th><th>Candidate</th><th>Job</th><th>Round</th><th>Mode</th></tr></thead><tbody>{o.upcoming.map(i => <tr key={i.id}><td>{fmtTime(i.scheduled_at)}</td><td>{i.name}</td><td>{i.jd_title}</td><td>{i.round}{i.interviewer ? ` · ${i.interviewer}` : ""}</td><td>{MODE[i.mode]}{i.location ? ` · ${i.location}` : ""}</td></tr>)}</tbody></table>}
    </section>
    {o.joining.length > 0 && <section className="pj-card"><h2>Offers accepted, waiting to join</h2>
      <table className="pj-table"><thead><tr><th>Candidate</th><th>Job</th><th>Expected joining</th><th>Last day at current job</th><th>Offered CTC</th><th>Follow-up</th></tr></thead><tbody>{o.joining.map(j => <tr key={j.id}><td>{j.name}{j.competing_offers ? <span className="pj-muted"> · other offers: {j.competing_offers}</span> : ""}</td><td>{j.jd_title}</td><td>{fmtDate(j.joining_date)}</td><td>{fmtDate(j.last_working_day) || "—"}</td><td>{lpa(j.offer_ctc_inr)}</td><td>{j.checkpoint?.label}</td></tr>)}</tbody></table>
      <p className="pj-muted">In Indian IT hiring, a large share of accepted offers never turn into a joining, often because of counter-offers during long notice periods. Call the candidate 30, 14, 7 and 1 day(s) before joining. Job Point can do this for you.</p></section>}
    <section className="pj-card"><h2>Hires and replacement guarantee</h2>
      {o.placements.length === 0 ? <p className="pj-muted">No hires recorded yet. Mark a candidate as “Joined” in the pipeline to start the guarantee period.</p> :
        <table className="pj-table"><thead><tr><th>Candidate</th><th>Role</th><th>Joined</th><th>Guarantee until</th><th>Status</th><th></th></tr></thead><tbody>{o.placements.map(p => <tr key={p.id}><td>{p.name}</td><td>{p.title}</td><td>{fmtDate(p.joined_on)}</td><td>{fmtDate(p.guarantee_ends_on)}</td>
          <td>{p.status === "active" ? (p.inGuarantee ? "In guarantee" : "Placed") : p.status === "left_in_guarantee" ? "Left in guarantee: replacement due" : p.status === "replaced" ? "Replaced" : `Left ${fmtDate(p.left_on)}`}</td>
          <td>{p.status === "active" && <button className="pj-link" onClick={() => exit(p.id)}>Report exit</button>}</td></tr>)}</tbody></table>}
    </section>
  </>;
}

function Home({ dash, active, post: postJob, open, edit, pipeline }: { dash: Dashboard; active: boolean; post: () => void; open: (id: string, title: string) => void; edit: (id: string) => void; pipeline: (jd: string) => void }) {
  const STATUS: Record<string, string> = { draft: "Draft", pending: "Waiting for Job Point approval", live: "Live", paused: "Paused", rejected: "Changes needed" };
  const stats = new Map(dash.overview.jobs.map(j => [j.id, j]));
  return <>
    <div className="pj-stats">
      <div><span className="pj-muted">Unlocks remaining</span><b>{dash.quota.remaining}</b><span className="pj-muted">{dash.quota.plans.map(p => `${p.plan}: ${p.remaining}/${p.total} until ${p.endsAt.slice(0, 10)}`).join(" · ") || "No active plan"}</span></div>
      <div><span className="pj-muted">Profiles unlocked</span><b>{dash.quota.unlockedTotal}</b><span className="pj-muted">They stay available even after your plan ends.</span></div>
      <div><span className="pj-muted">Live jobs</span><b>{dash.jds.filter(j => j.status === "live").length}</b><span className="pj-muted">of {dash.params?.params.maxLiveJds ?? 0} allowed</span></div>
    </div>
    <section className="pj-card"><div className="pj-row" style={{ justifyContent: "space-between" }}><h2>Your jobs</h2>{active && <button className="pj-btn" onClick={postJob}>Post a job</button>}</div>
      {dash.jds.length === 0 ? <p>No jobs yet. Post a job description and Job Point will approve it against your matching rules.</p> :
        <div className="pj-list">{dash.jds.map(j => { const s = stats.get(j.id); const managed = s?.service === "managed"; return <article className="pj-item" key={j.id}>
          <div><b>{j.title}</b> <span className="pj-pill">{managed ? "Managed by Job Point" : "Self-service"}</span>
            <p className="pj-muted">{STATUS[j.status] ?? j.status} · {s?.openings ?? 1} opening(s){j.status === "live" ? ` · ${managed ? "" : `${j.released} strong match(es) · `}${s?.in_process ?? 0} in process${s?.to_review ? ` · ${s.to_review} to review` : ""} · ${s?.joined ?? 0} joined` : ""}</p>{j.decision_note && j.status !== "live" && <p className="pj-muted">{j.decision_note}</p>}</div>
          <div className="pj-row">{j.status === "live" && !managed && <button className="pj-btn" onClick={() => open(j.id, j.title)}>View matches</button>}{j.status === "live" && <button className="pj-btn quiet" onClick={() => pipeline(j.id)}>Pipeline</button>}<button className="pj-btn quiet" onClick={() => edit(j.id)}>{j.status === "live" ? "Edit" : "Open"}</button></div>
        </article>; })}</div>}
    </section>
  </>;
}

function StageForm({ entry, stage, reasons, labels, done, say }: { entry: Entry; stage: string; reasons: string[] | undefined; labels: Record<string, string>; done: () => void; say: (t: string, bad?: boolean) => void }) {
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    const body = { pipelineId: entry.id, stage, reason: f.reason, note: f.note, offerDate: f.offerDate, joiningDate: f.joiningDate, lastWorkingDay: f.lastWorkingDay, competingOffers: f.competingOffers, offerCtcInr: f.offerLpa ? Math.round(Number(f.offerLpa) * 100_000) : null };
    try { say((await post<{ message: string }>("/api/portal/company/pipeline-stage", body)).message); done(); } catch (err) { say((err as Error).message, true); }
  }
  const today = new Date().toISOString().slice(0, 10);
  return <form className="pj-form" onSubmit={submit}>
    <h3 className="full">Move to “{labels[stage]}”</h3>
    {reasons && <label>Reason<select name="reason" required defaultValue=""><option value="" disabled>Choose…</option>{reasons.map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}</select></label>}
    {stage === "offered" && <><label>Offered annual CTC (LPA)<input name="offerLpa" type="number" step={0.1} min={0.5} /></label><label>Offer date<input name="offerDate" type="date" defaultValue={today} /></label></>}
    {(stage === "offer_accepted" || stage === "joined") && <label>{stage === "joined" ? "Joined on" : "Expected joining date"}<input name="joiningDate" type="date" required defaultValue={stage === "joined" ? entry.joiningDate ?? today : ""} /></label>}
    {stage === "offer_accepted" && <><label>Last working day at current employer<input name="lastWorkingDay" type="date" /></label><label>Other offers in hand (if known)<input name="competingOffers" maxLength={300} placeholder="e.g. one offer at ₹14 LPA, decision by 20 Dec" /></label></>}
    <label className="full">Note (optional)<input name="note" maxLength={1000} /></label>
    <div className="full pj-row"><button className="pj-btn">Save</button><button type="button" className="pj-link" onClick={done}>Cancel</button></div>
  </form>;
}

function InterviewForm({ entry, done, say }: { entry: Entry; done: () => void; say: (t: string, bad?: boolean) => void }) {
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    try { say((await post<{ message: string }>("/api/portal/company/interview-schedule", { pipelineId: entry.id, round: f.round, scheduledAt: f.when ? new Date(f.when).toISOString() : "", mode: f.mode, location: f.location, interviewer: f.interviewer })).message); done(); } catch (err) { say((err as Error).message, true); }
  }
  return <form className="pj-form" onSubmit={submit}>
    <h3 className="full">Schedule an interview</h3>
    <label>Round<input name="round" required list="rounds" placeholder="Technical 1" /><datalist id="rounds"><option>Online coding test</option><option>Technical 1</option><option>Technical 2</option><option>Managerial</option><option>HR</option></datalist></label>
    <label>Date and time<input name="when" type="datetime-local" required /></label>
    <label>Mode<select name="mode"><option value="video">Video</option><option value="phone">Phone</option><option value="in_person">In person</option></select></label>
    <label>Link or address<input name="location" maxLength={300} /></label>
    <label>Interviewer<input name="interviewer" maxLength={120} /></label>
    <div className="full pj-row"><button className="pj-btn">Schedule</button><button type="button" className="pj-link" onClick={done}>Cancel</button></div>
  </form>;
}

function FeedbackForm({ interview, done, say }: { interview: Interview; done: () => void; say: (t: string, bad?: boolean) => void }) {
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    try { say((await post<{ message: string }>("/api/portal/company/interview-record", { interviewId: interview.id, status: f.status, outcome: f.outcome, rating: f.rating, feedback: f.feedback })).message); done(); } catch (err) { say((err as Error).message, true); }
  }
  return <form className="pj-form" onSubmit={submit}>
    <h3 className="full">Feedback: {interview.round}</h3>
    <label>What happened<select name="status"><option value="completed">Interview completed</option><option value="no_show">Candidate did not attend</option><option value="cancelled">Cancelled</option></select></label>
    <label>Outcome<select name="outcome"><option value="advance">Move forward</option><option value="hold">On hold</option><option value="reject">Do not proceed</option><option value="pending">Decision pending</option></select></label>
    <label>Rating (1–5)<select name="rating" defaultValue=""><option value="">No rating</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
    <label className="full">Feedback <span className="pj-muted">Shared with Job Point to improve the next shortlist. Judge job-related skills only.</span><textarea name="feedback" rows={3} maxLength={2000} /></label>
    <div className="full pj-row"><button className="pj-btn">Save feedback</button><button type="button" className="pj-link" onClick={done}>Cancel</button></div>
  </form>;
}

function Pipeline({ jd, jobs, say, reload, profile }: { jd?: string; jobs: Overview["jobs"]; say: (t: string, bad?: boolean) => void; reload: () => void; profile: (ref: string) => void }) {
  const [filter, setFilter] = useState(jd ?? ""), [show, setShow] = useState("open");
  const [data, setData] = useState<PipelineData | null>(null), [form, setForm] = useState<{ id: string; kind: string } | null>(null);
  const load = useCallback(() => get<PipelineData>(`/api/portal/company/pipeline${filter ? `?jd=${filter}` : ""}`).then(setData).catch(e => say(e.message, true)), [filter, say]);
  useEffect(() => { load(); }, [load]);
  const done = () => { setForm(null); load(); reload(); };
  const OPEN = ["submitted", "shortlisted", "interview", "offered", "offer_accepted"];
  const rows = (data?.pipeline ?? []).filter(e => show === "all" || (show === "open" ? OPEN.includes(e.stage) : !OPEN.includes(e.stage)));
  return <section className="pj-card"><h2>Pipeline</h2>
    <div className="pj-row">
      <label>Job <select value={filter} onChange={e => setFilter(e.target.value)}><option value="">All jobs</option>{jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}</select></label>
      <label>Show <select value={show} onChange={e => setShow(e.target.value)}><option value="open">In process</option><option value="closed">Closed</option><option value="all">All</option></select></label>
    </div>
    {!data ? <p className="pj-muted">Loading…</p> : rows.length === 0 ? <p className="pj-muted">Nobody here yet. Unlock a profile from a job&apos;s matches and add it to the pipeline, or wait for Job Point&apos;s submissions on managed jobs.</p> :
      <div className="pj-list">{rows.map(e => <article className="pj-item" key={e.id}>
        <div>
          <b>{e.name}</b> <span className="pj-pill">{e.stageLabel}</span>{e.source === "job_point" && <span className="pj-pill">Submitted by Job Point</span>}
          <p className="pj-muted">{e.jdTitle} · updated {fmtDate(e.updatedAt)}{e.offerCtcInr ? ` · offer ${lpa(e.offerCtcInr)}` : ""}{e.joiningDate ? ` · joining ${fmtDate(e.joiningDate)}` : ""}{e.lastWorkingDay ? ` · last day at current job ${fmtDate(e.lastWorkingDay)}` : ""}{e.competingOffers ? ` · other offers: ${e.competingOffers}` : ""}{e.stageReason ? ` · ${e.stageReason.replace(/_/g, " ")}` : ""}</p>
          {e.recruiterNote && <p className="pj-note"><b>Job Point&apos;s note:</b> {e.recruiterNote}</p>}
          {e.interviews.length > 0 && <ul>{e.interviews.map(i => <li key={i.id}>{i.round} · {fmtTime(i.scheduled_at)} · {MODE[i.mode]} · {i.status === "scheduled" ? <>scheduled <button className="pj-link" onClick={() => setForm({ id: i.id, kind: "feedback" })}>Record feedback</button></> : `${i.status.replace("_", " ")}${i.status === "completed" ? `: ${i.outcome}${i.rating ? `, ${i.rating}/5` : ""}` : ""}`}{i.feedback ? ` — ${i.feedback}` : ""}
            {form?.kind === "feedback" && form.id === i.id && <FeedbackForm interview={i} done={done} say={say} />}</li>)}</ul>}
          {form?.id === e.id && form.kind === "interview" && <InterviewForm entry={e} done={done} say={say} />}
          {form?.id === e.id && form.kind.startsWith("stage:") && <StageForm entry={e} stage={form.kind.slice(6)} reasons={data.reasons[form.kind.slice(6)]} labels={data.labels} done={done} say={say} />}
        </div>
        {e.available && <div className="pj-row pj-actions">
          <button className="pj-btn quiet" onClick={() => profile(e.ref)}>Profile</button>
          {["shortlisted", "interview"].includes(e.stage) && <button className="pj-btn quiet" onClick={() => setForm({ id: e.id, kind: "interview" })}>Schedule interview</button>}
          {e.next.length > 0 && <select value="" aria-label="Move to stage" onChange={ev => ev.target.value && setForm({ id: e.id, kind: `stage:${ev.target.value}` })}><option value="">Move to…</option>{e.next.map(s => <option key={s} value={s}>{data.labels[s]}</option>)}</select>}
        </div>}
      </article>)}</div>}
  </section>;
}

function Team({ say }: { say: (t: string, bad?: boolean) => void }) {
  type Member = { id: string; email: string; status: string; last_sign_in_at: string | null; role: string; display_name: string };
  const [data, setData] = useState<{ team: Member[]; you: string; owner: boolean } | null>(null), [link, setLink] = useState("");
  const load = useCallback(() => get<{ team: Member[]; you: string; owner: boolean }>("/api/portal/company/team").then(setData).catch(e => say(e.message, true)), [say]);
  useEffect(() => { load(); }, [load]);
  async function act(action: string, body: object, confirm?: string) {
    if (confirm && !window.confirm(confirm)) return;
    try { const r = await post<{ message: string; link?: string }>(`/api/portal/company/${action}`, body); say(r.message); setLink(r.link ?? ""); load(); } catch (e) { say((e as Error).message, true); }
  }
  if (!data) return <p className="pj-muted">Loading…</p>;
  return <section className="pj-card"><h2>Team</h2>
    <p className="pj-muted">Everyone here can see your jobs, matches, unlocked profiles and pipeline. Only the owner can add or remove people and request changes to matching rules.</p>
    {link && <p className="pj-notice good">One-time link: <input readOnly value={link} onFocus={e => e.currentTarget.select()} style={{ width: "100%" }} /></p>}
    <table className="pj-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>{data.team.map(m => <tr key={m.id}>
      <td>{m.display_name || "—"}{m.id === data.you ? " (you)" : ""}</td><td>{m.email}</td><td>{m.role === "owner" ? "Owner" : "Team member"}</td>
      <td>{m.status === "pending" ? "Invited, password not set" : m.last_sign_in_at ? `Last signed in ${fmtDate(m.last_sign_in_at)}` : "Active"}</td>
      <td>{data.owner && m.role !== "owner" && <div className="pj-row">{m.status === "pending" && <button className="pj-link" onClick={() => act("team-reinvite", { memberId: m.id })}>New link</button>}<button className="pj-link" onClick={() => act("team-remove", { memberId: m.id }, `Remove ${m.email}? They will be signed out and cannot sign in again.`)}>Remove</button></div>}</td>
    </tr>)}</tbody></table>
    {data.owner && <form className="pj-form" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); act("team-invite", { name: f.get("name"), email: f.get("email") }); e.currentTarget.reset(); }}>
      <h3 className="full">Add a colleague</h3>
      <label>Name<input name="name" required maxLength={120} /></label>
      <label>Work email<input name="email" type="email" required maxLength={254} /></label>
      <div className="full"><button className="pj-btn">Add and get link</button></div>
    </form>}
  </section>;
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
      <label>Openings<input name="openings" type="number" min={1} max={500} defaultValue={1} /></label>
      <label>Who finds the candidates?<select name="service"><option value="self">We review matches and unlock profiles</option><option value="managed">Job Point recruits and submits a shortlist</option></select></label>
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
  async function shortlist(ref: string) { try { say((await post<{ message: string }>("/api/portal/company/pipeline-add", { ref, jdId: id })).message); reload(); } catch (e) { say((e as Error).message, true); } }
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
          {m.unlocked ? <><button className="pj-btn quiet" onClick={() => open(m.ref)}>View CV</button><button className="pj-btn quiet" onClick={() => shortlist(m.ref)}>Add to pipeline</button></> : <button className="pj-btn" onClick={() => unlock(m.ref)}>Unlock</button>}</div>
      </article>)}</div>}
  </section>;
}

function Candidate({ refId, jobs, say, back }: { refId: string; jobs: Overview["jobs"]; say: (t: string, bad?: boolean) => void; back: () => void }) {
  const [c, setC] = useState<Full | null>(null), [entries, setEntries] = useState<Entry[]>([]), [pick, setPick] = useState("");
  const load = useCallback(() => {
    get<Full>(`/api/portal/company/candidate?ref=${refId}`).then(setC).catch(e => say(e.message, true));
    get<PipelineData>("/api/portal/company/pipeline").then(d => setEntries(d.pipeline.filter(e => e.ref === refId))).catch(() => setEntries([]));
  }, [refId, say]);
  useEffect(() => { load(); }, [load]);
  async function add(jdId: string) { try { say((await post<{ message: string }>("/api/portal/company/pipeline-add", { ref: refId, jdId })).message); load(); } catch (e) { say((e as Error).message, true); } }
  const liveJobs = jobs.filter(j => j.status === "live" && !entries.some(e => e.jdId === j.id));
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
    <h3>Pipeline</h3>
    {entries.length > 0 ? <ul>{entries.map(e => <li key={e.id}>{e.jdTitle}: <b>{e.stageLabel}</b></li>)}</ul> : <p className="pj-muted">Not in your pipeline yet.{c.applications.length ? ` Applied to: ${c.applications.map(a => a.title).join(", ")}.` : ""}</p>}
    {liveJobs.length > 0 && <div className="pj-row"><select value={pick || liveJobs[0].id} onChange={e => setPick(e.target.value)} aria-label="Job">{liveJobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}</select><button className="pj-btn quiet" onClick={() => add(pick || liveJobs[0].id)}>Add to pipeline</button></div>}
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
