"use client";
// Candidate portal: matched jobs (bands, never raw scores), applications,
// CV upload with consent, profile corrections, skill tests and privacy.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CONSENT_NOTICE } from "@/lib/portal/notice";
import { post } from "../portal/forms";

type Job = { id: string; title: string; company: string; cities: string[]; remote: boolean; roleLabel: string; roleFamily: string; ctc: string; minYears: number | null; maxYears: number | null; band: string; gaps: string[]; meets: string[]; nearThreshold: boolean; application: string | null };
type Skill = { id: string; name: string; evidence: string };
type Profile = { headline: string; contact: { name: string }; skills: Skill[]; work: { title: string; employer: string; start: string | null; end: string | null; current: boolean }[]; education: { qualification: string; field: string; year: number | null }[]; parse: { warnings: string[] }; india: { ctcCurrentInr: number | null; ctcExpectedInr: number | null; noticeDays: number | null; currentCity: string; preferredCities: string[]; willingToRelocate: boolean | null; seniority: string; yearsExperience: number }; selfReported: string[] };
type Assessment = { id: string; title: string; description: string; items_per_form: number; time_limit_sec: number; owner_kind: string; jd_id: string | null; last_attempt: string | null };
type Question = { itemId: string; stem: string; options: string[] };

const TABS = [["jobs", "Jobs for you"], ["applications", "My applications"], ["cv", "My CV"], ["tests", "Skill tests"], ["privacy", "Privacy and consent"]] as const;
const ROLES = [["", "Any role"], ["accounts-finance", "Accounts and finance"], ["sales-bd", "Sales"], ["customer-support", "Customer support"], ["operations-supply", "Operations and logistics"], ["hr-admin", "HR and admin"], ["software-it", "Software and IT"], ["marketing", "Marketing"], ["manufacturing-engineering", "Manufacturing"]];
const STAGE: Record<string, string> = { applied: "Applied", released: "Shared with the employer", not_released: "Not matched to this role's requirements", viewed: "Employer unlocked your profile", shortlisted: "Shortlisted", interview: "Interview", offer: "Offer", hired: "Hired", rejected: "Not selected", withdrawn: "Withdrawn" };
const lpa = (n: number | null) => n === null ? "" : String(Math.round(n / 10_000) / 10);

async function get<T>(path: string): Promise<T> {
  const r = await fetch(path, { cache: "no-store" });
  const d = await r.json() as T & { error?: string };
  if (!r.ok) throw new Error(d.error ?? "Could not load.");
  return d;
}

export default function CandidateApp() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("jobs");
  const [notice, setNotice] = useState<{ text: string; bad?: boolean } | null>(null);
  const [profile, setProfile] = useState<{ profile: Profile | null; status: string; sharing: boolean } | null>(null);
  const loadProfile = useCallback(() => get<{ profile: Profile | null; status: string; sharing: boolean }>("/api/portal/candidate/profile").then(d => { setProfile(d); if (!d.profile) setTab("cv"); }).catch(e => setNotice({ text: e.message, bad: true })), []);
  useEffect(() => { loadProfile(); }, [loadProfile]);
  const say = (text: string, bad = false) => setNotice({ text, bad });
  async function signOut() { await post("/api/portal/auth/sign-out", {}); window.location.assign("/portal/sign-in"); }
  return <>
    <header className="pj-top">
      <a className="pj-brand" href="/candidate">Job Point · My jobs</a>
      <nav aria-label="Candidate">{TABS.map(([k, label]) => <button key={k} aria-current={tab === k ? "page" : undefined} onClick={() => { setTab(k); setNotice(null); }}>{label}</button>)}</nav>
      <form onSubmit={e => { e.preventDefault(); signOut(); }}><button>Sign out</button></form>
    </header>
    <main className="pj-main">
      {notice && <p className={`pj-notice ${notice.bad ? "bad" : "good"}`} role="status">{notice.text}</p>}
      {profile?.status === "needs_review" && <p className="pj-notice">We could not read your CV automatically. A Job Point reviewer will check it shortly; nothing has been lost.</p>}
      {profile && profile.profile && !profile.sharing && tab !== "privacy" && <p className="pj-notice">Companies cannot see your profile because sharing is off. <button className="pj-link" onClick={() => setTab("privacy")}>Turn it on</button></p>}
      {tab === "jobs" && <Jobs say={say} goTests={() => setTab("tests")} />}
      {tab === "applications" && <Applications />}
      {tab === "cv" && <Cv data={profile} reload={loadProfile} say={say} />}
      {tab === "tests" && <Tests say={say} />}
      {tab === "privacy" && <Privacy data={profile} reload={loadProfile} say={say} />}
    </main>
  </>;
}

function Jobs({ say, goTests }: { say: (t: string, bad?: boolean) => void; goTests: () => void }) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [filters, setFilters] = useState({ city: "", role: "", minCtc: "", maxYears: "" });
  const load = useCallback(() => {
    const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v).map(([k, v]) => [k, k === "minCtc" ? String(Number(v) * 100_000) : v]));
    get<{ jobs: Job[] }>(`/api/portal/candidate/jobs?${q}`).then(d => setJobs(d.jobs)).catch(e => say(e.message, true));
  }, [filters, say]);
  useEffect(() => { load(); }, [load]);
  async function apply(id: string) { try { say((await post<{ message: string }>("/api/portal/candidate/apply", { jdId: id })).message); load(); } catch (e) { say((e as Error).message, true); } }
  return <section className="pj-card">
    <h2>Jobs that fit your profile</h2>
    <p className="pj-muted">Only jobs whose essential requirements you meet are shown. The match level reflects your CV and any skill tests you have taken.</p>
    <div className="pj-form">
      <label>City<input value={filters.city} onChange={e => setFilters({ ...filters, city: e.target.value })} placeholder="Any city, or Remote" /></label>
      <label>Role<select value={filters.role} onChange={e => setFilters({ ...filters, role: e.target.value })}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label>Minimum CTC (LPA)<input type="number" min={0} step={0.5} value={filters.minCtc} onChange={e => setFilters({ ...filters, minCtc: e.target.value })} /></label>
      <label>My years of experience<input type="number" min={0} step={0.5} value={filters.maxYears} onChange={e => setFilters({ ...filters, maxYears: e.target.value })} /></label>
    </div>
    {jobs === null ? <p className="pj-muted">Loading…</p> : jobs.length === 0 ? <p>No matching jobs right now. Keep your CV up to date; new jobs are matched automatically.</p> :
      <div className="pj-list">{jobs.map(j => <article className="pj-item" key={j.id}>
        <div><b>{j.title}</b><p className="pj-muted">{j.company} · {j.remote ? "Remote" : j.cities.join(", ")} · {j.ctc} · {j.minYears !== null ? `${j.minYears}${j.maxYears !== null ? `–${j.maxYears}` : "+"} years` : "Any experience"}</p>
          {j.meets.length > 0 && <ul>{j.meets.slice(0, 3).map(m => <li key={m}>{m}</li>)}</ul>}
          {j.gaps.length > 0 && <p className="pj-muted">To strengthen your match: {j.gaps.join("; ")}.</p>}
          {j.nearThreshold && <p className="pj-muted">You are close to this employer&apos;s threshold. <button className="pj-link" onClick={goTests}>A skill test</button> can confirm your skills.</p>}
        </div>
        <div className="pj-score"><span className={`pj-pill ${j.band.split(" ")[0].toLowerCase()}`}>{j.band}</span>
          {j.application ? <span className="pj-muted">{STAGE[j.application] ?? j.application}</span> : <button className="pj-btn" onClick={() => apply(j.id)}>Apply</button>}</div>
      </article>)}</div>}
  </section>;
}

function Applications() {
  const [apps, setApps] = useState<{ id: string; status: string; updated_at: string; title: string; company: string }[] | null>(null);
  useEffect(() => { get<{ applications: typeof apps }>("/api/portal/candidate/applications").then(d => setApps(d.applications)).catch(() => setApps([])); }, []);
  return <section className="pj-card"><h2>My applications</h2>
    {!apps ? <p className="pj-muted">Loading…</p> : apps.length === 0 ? <p>You have not applied to any job yet.</p> :
      <table className="pj-table"><thead><tr><th>Job</th><th>Company</th><th>Status</th><th>Updated</th></tr></thead><tbody>{apps.map(a => <tr key={a.id}><td>{a.title}</td><td>{a.company}</td><td>{STAGE[a.status] ?? a.status}</td><td>{a.updated_at.slice(0, 10)}</td></tr>)}</tbody></table>}
  </section>;
}

function Cv({ data, reload, say }: { data: { profile: Profile | null; status: string } | null; reload: () => void; say: (t: string, bad?: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true);
    const r = await fetch("/api/portal/candidate/upload", { method: "POST", body: new FormData(e.currentTarget) });
    const d = await r.json().catch(() => ({})) as { message?: string; error?: string };
    setBusy(false); say(d.message ?? d.error ?? "Upload failed.", !r.ok); if (r.ok) reload();
  }
  async function correct(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const num = (k: string, scale = 1) => f.get(k) === "" ? null : Number(f.get(k)) * scale;
    const correction = {
      currentCity: String(f.get("currentCity") ?? ""), preferredCities: String(f.get("preferredCities") ?? "").split(",").map(s => s.trim()).filter(Boolean),
      willingToRelocate: f.get("relocate") === "yes", ctcCurrentInr: num("ctcCurrent", 100_000), ctcExpectedInr: num("ctcExpected", 100_000), noticeDays: num("noticeDays"),
      addSkills: String(f.get("addSkills") ?? "").split(",").map(s => s.trim()).filter(Boolean), removeSkills: f.getAll("removeSkill").map(String),
    };
    try { say((await post<{ message: string }>("/api/portal/candidate/profile", { correction })).message); reload(); } catch (err) { say((err as Error).message, true); }
  }
  const p = data?.profile;
  return <>
    <section className="pj-card">
      <h2>{p ? "Replace your CV" : "Upload your CV"}</h2>
      <form className="pj-list" onSubmit={upload}>
        <label>CV file <span className="pj-muted">PDF or DOCX with selectable text, up to 5 MB</span><input name="resume" type="file" required accept=".pdf,.docx" /></label>
        <label className="pj-row"><input type="checkbox" name="consentProfile" value="yes" required /> <span><b>Required.</b> {CONSENT_NOTICE.profile_processing}</span></label>
        <label className="pj-row"><input type="checkbox" name="consentShare" value="yes" defaultChecked /> <span><b>Recommended.</b> {CONSENT_NOTICE.share_with_companies}</span></label>
        <label className="pj-row"><input type="checkbox" name="consentOffers" value="yes" /> <span>{CONSENT_NOTICE.service_offers}</span></label>
        <button className="pj-btn" disabled={busy}>{busy ? "Reading your CV…" : "Upload CV"}</button>
      </form>
    </section>
    {p && <section className="pj-card">
      <h2>Details read from your CV</h2>
      <p className="pj-muted">Correct anything that was read wrongly. Skills you add here count as listed skills until your CV or a skill test shows them.</p>
      <div className="pj-grid">
        <div><h3>Experience</h3><p>{p.india.yearsExperience} years · {p.india.seniority}</p><ul>{p.work.slice(0, 5).map((w, i) => <li key={i}>{w.title}{w.employer ? `, ${w.employer}` : ""} ({w.start ?? "?"} – {w.current ? "present" : w.end ?? "?"})</li>)}</ul></div>
        <div><h3>Education</h3><ul>{p.education.map((e, i) => <li key={i}>{e.qualification}{e.field ? ` (${e.field})` : ""}{e.year ? `, ${e.year}` : ""}</li>)}</ul></div>
      </div>
      <form className="pj-form" onSubmit={correct}>
        <label>Current city<input name="currentCity" defaultValue={p.india.currentCity} /></label>
        <label>Preferred cities<input name="preferredCities" defaultValue={p.india.preferredCities.join(", ")} placeholder="e.g. Kolkata, Durgapur" /></label>
        <label>Current CTC (LPA)<input name="ctcCurrent" type="number" step={0.1} min={0} defaultValue={lpa(p.india.ctcCurrentInr)} /></label>
        <label>Expected CTC (LPA)<input name="ctcExpected" type="number" step={0.1} min={0} defaultValue={lpa(p.india.ctcExpectedInr)} /></label>
        <label>Notice period (days)<input name="noticeDays" type="number" min={0} max={180} defaultValue={p.india.noticeDays ?? ""} /></label>
        <label>Willing to relocate<select name="relocate" defaultValue={p.india.willingToRelocate ? "yes" : "no"}><option value="yes">Yes</option><option value="no">No</option></select></label>
        <div className="full"><h3>Skills</h3><div className="pj-chips">{p.skills.slice(0, 40).map(s => <label key={s.id} className="pj-row" title={s.evidence}><input type="checkbox" name="removeSkill" value={s.id} /> {s.name}{s.evidence === "work" ? " ✓" : ""}</label>)}</div><p className="pj-muted">✓ = shown in your work history. Tick a skill to remove it.</p></div>
        <label className="full">Add skills (comma-separated)<input name="addSkills" placeholder="e.g. Tally, GST" /></label>
        <div className="full"><button className="pj-btn">Save corrections</button></div>
      </form>
    </section>}
  </>;
}

function Tests({ say }: { say: (t: string, bad?: boolean) => void }) {
  const [list, setList] = useState<Assessment[] | null>(null);
  const [run, setRun] = useState<{ attemptId: string; deadline: string; questions: Question[] } | null>(null);
  useEffect(() => { get<{ assessments: Assessment[] }>("/api/portal/candidate/assessments").then(d => setList(d.assessments)).catch(e => say(e.message, true)); }, [say, run]);
  async function start(a: Assessment, extraTime: boolean) {
    try {
      const s = await post<{ attemptId: string }>("/api/portal/candidate/assessment-start", { assessmentId: a.id, jdId: a.jd_id, extraTime });
      const q = await get<{ deadline: string; questions: Question[] }>(`/api/portal/candidate/attempt?id=${s.attemptId}`);
      setRun({ attemptId: s.attemptId, ...q });
    } catch (e) { say((e as Error).message, true); }
  }
  if (run) return <TestRunner run={run} done={msg => { setRun(null); say(msg); }} />;
  return <section className="pj-card"><h2>Skill tests</h2>
    <p className="pj-muted">Optional. A test can confirm a skill on your CV and strengthen your matches; not taking one never removes you from a job. You can retake a test after 30 days, up to three times a year. Need extra time because of a disability? Choose &ldquo;Start with extra time&rdquo;.</p>
    {!list ? <p className="pj-muted">Loading…</p> : list.length === 0 ? <p>No tests are available yet.</p> : <div className="pj-list">{list.map(a => <article className="pj-item" key={a.id}>
      <div><b>{a.title}</b><p className="pj-muted">{a.items_per_form} questions · {Math.round(a.time_limit_sec / 60)} minutes{a.owner_kind === "company" ? " · set by an employer for a job you match" : ""}{a.last_attempt ? ` · last attempt ${a.last_attempt.slice(0, 10)}` : ""}</p>{a.description && <p>{a.description}</p>}</div>
      <div className="pj-row"><button className="pj-btn" onClick={() => start(a, false)}>Start</button><button className="pj-link" onClick={() => start(a, true)}>Start with extra time</button></div>
    </article>)}</div>}
  </section>;
}

function TestRunner({ run, done }: { run: { attemptId: string; deadline: string; questions: Question[] }; done: (msg: string) => void }) {
  const [i, setI] = useState(0), [choice, setChoice] = useState<number | null>(null), [left, setLeft] = useState(0);
  const answers = useRef<{ itemId: string; choice: number | null; ms: number }[]>([]);
  const shownAt = useRef(0), events = useRef({ hidden: 0, pastes: 0 }), sent = useRef(false);
  const submit = useCallback(async () => {
    if (sent.current) return; sent.current = true;
    try { done((await post<{ message: string }>("/api/portal/candidate/assessment-submit", { attemptId: run.attemptId, answers: answers.current, events: events.current })).message); }
    catch (e) { done((e as Error).message); }
  }, [run.attemptId, done]);
  useEffect(() => {
    shownAt.current = performance.now();
    const vis = () => { if (document.hidden) events.current.hidden++; }, paste = () => { events.current.pastes++; };
    document.addEventListener("visibilitychange", vis); document.addEventListener("paste", paste);
    const t = window.setInterval(() => { const s = Math.max(0, Math.round((Date.parse(run.deadline) - Date.now()) / 1000)); setLeft(s); if (!s) submit(); }, 1000);
    return () => { document.removeEventListener("visibilitychange", vis); document.removeEventListener("paste", paste); window.clearInterval(t); };
  }, [run.deadline, submit]);
  const q = run.questions[i];
  function next() {
    answers.current.push({ itemId: q.itemId, choice, ms: Math.round(performance.now() - shownAt.current) });
    setChoice(null); shownAt.current = performance.now();
    if (i + 1 < run.questions.length) setI(i + 1); else submit();
  }
  return <section className="pj-card" aria-live="polite">
    <div className="pj-row" style={{ justifyContent: "space-between" }}><b>Question {i + 1} of {run.questions.length}</b><span className="pj-muted">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} left</span></div>
    <div className="pj-q"><p>{q.stem}</p>{q.options.map((o, k) => <label key={k}><input type="radio" name="opt" checked={choice === k} onChange={() => setChoice(k)} /> {o}</label>)}</div>
    <div className="pj-row"><button className="pj-btn" onClick={next}>{i + 1 < run.questions.length ? "Next" : "Submit"}</button><span className="pj-muted">Questions cannot be revisited. Switching tabs or pasting is recorded.</span></div>
  </section>;
}

function Privacy({ data, reload, say }: { data: { sharing: boolean } | null; reload: () => void; say: (t: string, bad?: boolean) => void }) {
  const [info, setInfo] = useState<{ companies: { id: string; display_name: string; city: string }[]; blocked: string[]; sharing: { unlockedBy: { company: string; unlocked_at: string; access_revoked_at: string | null }[]; previewCompanies: number } } | null>(null);
  const load = useCallback(() => get<typeof info>("/api/portal/candidate/companies").then(setInfo).catch(e => say(e.message, true)), [say]);
  useEffect(() => { load(); }, [load]);
  const act = async (url: string, body: object) => { try { say((await post<{ message: string }>(url, body)).message); reload(); load(); } catch (e) { say((e as Error).message, true); } };
  return <>
    <section className="pj-card"><h2>Sharing with employers</h2>
      <p>{CONSENT_NOTICE.share_with_companies}</p>
      <p><b>Status:</b> {data?.sharing ? "On — matching employers can see your anonymous summary." : "Off — no employer can see your profile."}</p>
      <div className="pj-row">{data?.sharing ? <button className="pj-btn danger" onClick={() => act("/api/portal/candidate/consent", { purpose: "share_with_companies", grant: false })}>Stop sharing now</button> : <button className="pj-btn" onClick={() => act("/api/portal/candidate/consent", { purpose: "share_with_companies", grant: true })}>Allow sharing</button>}</div>
      {info && <p className="pj-muted">Your anonymous summary is currently shown to {info.sharing.previewCompanies} employer(s).{info.sharing.unlockedBy.length ? ` Unlocked by: ${info.sharing.unlockedBy.map(u => `${u.company} (${u.unlocked_at.slice(0, 10)}${u.access_revoked_at ? ", access revoked" : ""})`).join("; ")}.` : " No employer has unlocked your full CV."}</p>}
    </section>
    <section className="pj-card"><h2>Hide my profile from specific companies</h2>
      <p className="pj-muted">Blocked companies never see your profile, not even anonymously. Use this for your current employer.</p>
      {info && <div className="pj-list">{info.companies.map(c => <label key={c.id} className="pj-row"><input type="checkbox" checked={info.blocked.includes(c.id)} onChange={e => act("/api/portal/candidate/block", { companyId: c.id, block: e.target.checked })} /> {c.display_name} <span className="pj-muted">{c.city}</span></label>)}</div>}
    </section>
    <section className="pj-card"><h2>Your data</h2>
      <div className="pj-row">{/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download from an API route, not a page */}
        <a className="pj-btn quiet" href="/api/portal/candidate/export" download>Download my data</a>
        <button className="pj-btn danger" onClick={() => { const c = window.prompt("This deletes your account and CV permanently. Type DELETE to confirm."); if (c) act("/api/portal/candidate/delete", { confirm: c }).then(() => window.location.assign("/portal/sign-in")); }}>Delete my account</button></div>
      <p className="pj-muted">To withdraw consent, complain or ask a question about your data, write to Job Point. You can also complain to the Data Protection Board of India.</p>
    </section>
  </>;
}
