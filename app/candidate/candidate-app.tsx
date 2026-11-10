"use client";
// Candidate area, kept deliberately small ("My CV and privacy"): upload or
// replace the CV with consent, correct what was read, and control sharing,
// hidden companies, export and deletion. Matching to jobs happens on
// Jobboard300's side; recruiters contact candidates directly.
import TestRunner, { type Step } from "@/components/test-runner";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CONSENT_NOTICE } from "@/lib/portal/notice";
import { post } from "../portal/forms";

type Skill = { id: string; name: string; evidence: string };
type Profile = { headline: string; contact: { name: string }; skills: Skill[]; work: { title: string; employer: string; start: string | null; end: string | null; current: boolean }[]; education: { qualification: string; field: string; year: number | null }[]; parse: { warnings: string[] }; india: { ctcCurrentInr: number | null; ctcExpectedInr: number | null; noticeDays: number | null; currentCity: string; preferredCities: string[]; willingToRelocate: boolean | null; seniority: string; yearsExperience: number }; selfReported: string[] };

const lpa = (n: number | null) => n === null ? "" : String(Math.round(n / 10_000) / 10);

async function get<T>(path: string): Promise<T> {
  const r = await fetch(path, { cache: "no-store" });
  const d = await r.json() as T & { error?: string };
  if (!r.ok) throw new Error(d.error ?? "Could not load.");
  return d;
}

export default function CandidateApp() {
  const [notice, setNotice] = useState<{ text: string; bad?: boolean } | null>(null);
  const [profile, setProfile] = useState<{ profile: Profile | null; status: string; sharing: boolean } | null>(null);
  const loadProfile = useCallback(() => get<{ profile: Profile | null; status: string; sharing: boolean }>("/api/portal/candidate/profile").then(setProfile).catch(e => setNotice({ text: e.message, bad: true })), []);
  useEffect(() => { loadProfile(); }, [loadProfile]);
  const say = (text: string, bad = false) => setNotice({ text, bad });
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full page load on purpose: it clears client state and re-runs the server session check
  async function signOut() { await post("/api/portal/auth/sign-out", {}); window.location.assign("/portal/sign-in"); }
  return <>
    <header className="pj-top">
      <a className="pj-brand" href="/candidate">Jobboard300 · My CV and privacy</a>
      <form onSubmit={e => { e.preventDefault(); signOut(); }}><button>Sign out</button></form>
    </header>
    <main className="pj-main">
      {notice && <p className={`pj-notice ${notice.bad ? "bad" : "good"}`} role="status">{notice.text}</p>}
      {profile?.status === "needs_review" && <p className="pj-notice">We could not read your CV automatically. A Jobboard300 reviewer will check it shortly; nothing has been lost.</p>}
      {profile?.profile && <p className="pj-notice">{profile.sharing ? "Your CV is on file and sharing is on. When a role fits, a Jobboard300 recruiter may put you forward to the employer and will tell you here." : "Your CV is on file, but sharing with employers is off, so no employer can see your profile. You can turn it on below."}</p>}
      <Inbox />
      <Tests say={say} />
      <Cv data={profile} reload={loadProfile} say={say} />
      {profile?.profile && <Privacy data={profile} reload={loadProfile} say={say} />}
    </main>
  </>;
}

type Message = { id: string; kind: string; title: string; body: string; created_at: string; read_at: string | null };

type TestsView = { test: { questions: number; minutes: number }; fastTrack: boolean; offer: { priceInr: number | null; payNote: string }; order: { reference: string; amount_inr: number } | null; technical: { id: string; title: string; suggested: boolean }[]; tests: { id: string; title: string; kind: string; status: string; final_level: number | null; band: string | null; completed_at: string | null; weakTopics: string[] | null }[] };

/** Fast Track (the paid package) and tests: technical tests the candidate chooses, and any test they were invited to. */
function Tests({ say }: { say: (t: string, bad?: boolean) => void }) {
  const [v, setV] = useState<TestsView | null>(null), [sitting, setSitting] = useState<{ bankId?: string } | null>(null), testId = useRef<string | undefined>(undefined);
  const load = useCallback(() => get<TestsView>("/api/portal/candidate/tests").then(setV).catch(() => undefined), []);
  useEffect(() => { load(); }, [load]);
  // The list is read through a ref, so that refreshing it when a test finishes does not make the
  // test screen load again (which reported "finished" again, and so on without end).
  const view = useRef<TestsView | null>(null);
  useEffect(() => { view.current = v; }, [v]);
  const call = useCallback(async (action: "load" | "start" | "answer", choice?: number | null) => {
    const v = view.current;
    if (action === "answer") return post<Step>("/api/portal/candidate/test-answer", { testId: testId.current, choice });
    // Opening a test shows the instructions first; the clock starts only on Start.
    if (action === "load") return testId.current ? get<Step>(`/api/portal/candidate/test?id=${testId.current}`) : { id: "", title: v?.technical.find(b => b.id === sitting?.bankId)?.title ?? "Technical test", total: v?.test.questions ?? 20, minutes: v?.test.minutes ?? 25, state: "ready" as const };
    const s = await post<Step>("/api/portal/candidate/test-start", testId.current ? { testId: testId.current } : { bankId: sitting?.bankId });
    testId.current = s.id;
    return s;
  }, [sitting]);
  if (!v) return null;
  if (sitting) return <><TestRunner call={call} onDone={load} /><button className="pj-link" onClick={() => { testId.current = undefined; setSitting(null); load(); }}>Back to my tests</button></>;
  const invited = v.tests.filter(t => t.status === "invited" || t.status === "in_progress"), done = v.tests.filter(t => t.status === "completed");
  return <section className="pj-card"><h2>Fast Track and tests</h2>
    {invited.length > 0 && <div className="pj-list">{invited.map(t => <article className="pj-item" key={t.id}><div><b>{t.title}</b><p className="pj-muted">{t.kind === "technical" ? "Your technical test is in progress." : "A recruiter has asked you to take this test for a role you are being considered for."}</p></div><button className="pj-btn" onClick={() => { testId.current = t.id; setSitting({}); }}>{t.status === "in_progress" ? "Continue" : "Open"}</button></article>)}</div>}
    {v.fastTrack ? <>
      <p><span className="pj-pill">Fast Track</span> Take a technical test in your own skills whenever you are ready. A strong result is verified on your profile and counts when recruiters shortlist.</p>
      {v.technical.length === 0 ? <p className="pj-muted">No technical tests are open yet.</p> : <div className="pj-list">{v.technical.map(b => <article className="pj-item" key={b.id}><div><b>{b.title}</b>{b.suggested && <span className="pj-pill">Matches your CV</span>}</div><button className="pj-btn quiet" onClick={() => { testId.current = undefined; setSitting({ bankId: b.id }); }}>Take the test</button></article>)}</div>}
    </> : <>
      <p><b>Fast Track</b> is a paid package for candidates who want to prove their skills. It includes the technical tests for your skills, your level on each, the topics to prepare after every test and guidance for future interviews. Registering your CV and applying for jobs remain free.</p>
      {v.order ? <p className="pj-notice">Pay <b>₹{v.order.amount_inr.toLocaleString("en-IN")}</b> and quote the reference <b>{v.order.reference}</b>. {v.offer.payNote} You are on Fast Track as soon as we confirm the payment.</p>
        : v.offer.priceInr ? <div className="pj-row"><b>₹{v.offer.priceInr.toLocaleString("en-IN")}</b><button className="pj-btn" onClick={() => post<{ message: string }>("/api/portal/candidate/fasttrack-request", {}).then(r => { say(r.message); load(); }).catch(e => say(e.message, true))}>Join Fast Track</button></div>
        : <p className="pj-muted">Fast Track opens for payment soon.</p>}
    </>}
    {done.length > 0 && <><h3>Your results</h3><table className="pj-table"><thead><tr><th>Test</th><th>Date</th><th>Your level</th><th>Topics to prepare</th></tr></thead><tbody>{done.map(t => <tr key={t.id}><td>{t.title}</td><td>{t.completed_at?.slice(0, 10)}</td><td>{t.band} ({t.final_level} of 10)</td><td>{t.weakTopics ? (t.weakTopics.join(", ") || "None stood out") : "Included in Fast Track"}</td></tr>)}</tbody></table></>}
  </section>;
}

function Inbox() {
  const [data, setData] = useState<{ messages: Message[]; whatsapp: string } | null>(null);
  useEffect(() => {
    get<{ messages: Message[]; whatsapp: string }>("/api/portal/candidate/inbox").then(d => { setData(d); if (d.messages.some(m => !m.read_at)) post("/api/portal/candidate/inbox-read", {}).catch(() => undefined); }).catch(() => setData({ messages: [], whatsapp: "" }));
  }, []);
  if (!data) return null;
  const unread = data.messages.filter(m => !m.read_at).length;
  return <section className="pj-card"><h2>Inbox{unread ? ` (${unread} new)` : ""}</h2>
    <p className="pj-muted">Every update about your CV and applications appears here.{data.whatsapp && <> You can also <a href={`https://wa.me/${data.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">message us on WhatsApp</a>.</>}</p>
    {data.messages.length === 0 ? <p className="pj-muted">No messages yet. Upload your CV to get started.</p> : <div className="pj-list">{data.messages.map(m => <article className="pj-note" key={m.id} style={m.read_at ? undefined : { borderLeftColor: "#14603e" }}>
      <b>{m.title}</b>{!m.read_at && <span className="pj-pill strong">New</span>} <span className="pj-muted">· {new Date(m.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
      <p>{m.body}</p></article>)}</div>}
  </section>;
}

function Cv({ data, reload, say }: { data: { profile: Profile | null; status: string; sharing?: boolean; whatsapp?: boolean } | null; reload: () => void; say: (t: string, bad?: boolean) => void }) {
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
        <label className="pj-row"><input type="checkbox" name="consentShare" value="yes" key={`share-${p ? data?.sharing : "new"}`} defaultChecked={p ? !!data?.sharing : true} /> <span><b>Recommended.</b> {CONSENT_NOTICE.share_with_companies}</span></label>
        <label className="pj-row"><input type="checkbox" name="consentOffers" value="yes" /> <span>{CONSENT_NOTICE.service_offers}</span></label>
        <label className="pj-row"><input type="checkbox" name="consentWhatsapp" value="yes" key={`wa-${data?.whatsapp}`} defaultChecked={!!data?.whatsapp} /> <span>Send me updates on WhatsApp at my mobile number, as well as in my inbox. Leave unticked for no WhatsApp messages.</span></label>
        <button className="pj-btn" disabled={busy}>{busy ? "Reading your CV…" : "Upload CV"}</button>
      </form>
    </section>
    {p && <section className="pj-card">
      <h2>Details read from your CV</h2>
      <p className="pj-muted">Correct anything that was read wrongly. Skills you add here count as listed skills until your CV shows them in a role.</p>
      <div className="pj-grid">
        <div><h3>Experience</h3><p>{p.india.yearsExperience} years · {p.india.seniority}</p><ul>{p.work.slice(0, 5).map((w, i) => <li key={i}>{w.title}{w.employer ? `, ${w.employer}` : ""} ({w.start ?? "?"} – {w.current ? "present" : w.end ?? "?"})</li>)}</ul></div>
        <div><h3>Education</h3><ul>{p.education.map((e, i) => <li key={i}>{e.qualification}{e.field ? ` (${e.field})` : ""}{e.year ? `, ${e.year}` : ""}</li>)}</ul></div>
      </div>
      <form className="pj-form" onSubmit={correct}>
        <label>Current city<input name="currentCity" defaultValue={p.india.currentCity} /></label>
        <label>Preferred cities<input name="preferredCities" defaultValue={p.india.preferredCities.join(", ")} placeholder="e.g. Kolkata, Bengaluru" /></label>
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

function Privacy({ data, reload, say }: { data: { sharing: boolean } | null; reload: () => void; say: (t: string, bad?: boolean) => void }) {
  const [info, setInfo] = useState<{ hidden: string[]; sharing: { unlockedBy: { company: string; unlocked_at: string; access_revoked_at: string | null }[]; previewCompanies: number } } | null>(null);
  const load = useCallback(() => get<typeof info>("/api/portal/candidate/companies").then(setInfo).catch(e => say(e.message, true)), [say]);
  useEffect(() => { load(); }, [load]);
  const act = async (url: string, body: object) => { try { say((await post<{ message: string }>(url, body)).message); reload(); load(); } catch (e) { say((e as Error).message, true); } };
  return <>
    <section className="pj-card"><h2>Sharing with employers</h2>
      <p>{CONSENT_NOTICE.share_with_companies}</p>
      <p><b>Status:</b> {data?.sharing ? "On — a recruiter may put you forward to an employer for a role that fits." : "Off — no employer can see your profile."}</p>
      <div className="pj-row">{data?.sharing ? <button className="pj-btn danger" onClick={() => act("/api/portal/candidate/consent", { purpose: "share_with_companies", grant: false })}>Stop sharing now</button> : <button className="pj-btn" onClick={() => act("/api/portal/candidate/consent", { purpose: "share_with_companies", grant: true })}>Allow sharing</button>}</div>
      {info && <p className="pj-muted">{info.sharing.unlockedBy.length ? `Your profile has been shared with: ${info.sharing.unlockedBy.map(u => `${u.company} (${u.unlocked_at.slice(0, 10)}${u.access_revoked_at ? ", access ended" : ""})`).join("; ")}.` : "Your profile has not been shared with any employer yet."}</p>}
    </section>
    <section className="pj-card"><h2>Hide my profile from specific companies</h2>
      <p className="pj-muted">Type the name of any employer that must never receive your profile, such as your current one. We do not show which companies hire through Jobboard300.</p>
      <form className="pj-row" onSubmit={e => { e.preventDefault(); const f = e.currentTarget, name = String(new FormData(f).get("name") ?? ""); act("/api/portal/candidate/block", { name, block: true }).then(() => { f.reset(); load(); }); }}>
        <input name="name" required minLength={2} maxLength={120} placeholder="Employer name" aria-label="Employer name" /><button className="pj-btn quiet">Hide from this employer</button></form>
      {info && info.hidden.length > 0 && <div className="pj-list">{info.hidden.map(n => <div key={n} className="pj-row"><span>{n}</span><button className="pj-btn quiet" onClick={() => act("/api/portal/candidate/block", { name: n, block: false }).then(load)}>Remove</button></div>)}</div>}
    </section>
    <section className="pj-card"><h2>Your data</h2>
      <div className="pj-row">
        <a className="pj-btn quiet" href="/api/portal/candidate/export" download>Download my data</a>
        <button className="pj-btn danger" onClick={async () => {
          const c = window.prompt("This permanently deletes your account, your CV and your profile, and closes any open applications. It cannot be undone. Type DELETE to confirm.");
          if (c === null) return;
          if (c.trim() !== "DELETE") { say("Nothing was deleted. To delete your account, type the word DELETE in capital letters.", true); return; }
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full page load on purpose after deletion: it clears client state
          try { await post("/api/portal/candidate/delete", { confirm: "DELETE" }); window.location.assign("/portal/sign-in"); }
          catch (e) { say(`Your account was not deleted: ${(e as Error).message}`, true); }
        }}>Delete my account</button></div>
      <p className="pj-muted">To withdraw consent, complain or ask a question about your data, write to Jobboard300. You can also complain to the Data Protection Board of India.</p>
    </section>
  </>;
}
