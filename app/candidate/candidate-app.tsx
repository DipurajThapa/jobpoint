"use client";
// Candidate area, kept deliberately small ("My CV and privacy"): upload or
// replace the CV with consent, correct what was read, and control sharing,
// hidden companies, export and deletion. Matching to jobs happens on
// Jobboard300's side; recruiters contact candidates directly.
import { useCallback, useEffect, useState, type FormEvent } from "react";
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
  async function signOut() { await post("/api/portal/auth/sign-out", {}); window.location.assign("/portal/sign-in"); }
  return <>
    <header className="pj-top">
      <a className="pj-brand" href="/candidate">Jobboard300 · My CV and privacy</a>
      <form onSubmit={e => { e.preventDefault(); signOut(); }}><button>Sign out</button></form>
    </header>
    <main className="pj-main">
      {notice && <p className={`pj-notice ${notice.bad ? "bad" : "good"}`} role="status">{notice.text}</p>}
      {profile?.status === "needs_review" && <p className="pj-notice">We could not read your CV automatically. A Jobboard300 reviewer will check it shortly; nothing has been lost.</p>}
      {profile?.profile && <p className="pj-notice">{profile.sharing ? "Your CV is on file. When a role fits, Jobboard300 shares an anonymous summary with the employer, and a recruiter contacts you before anything else happens." : "Your CV is on file, but sharing with employers is off, so no employer can see your profile. You can turn it on below."}</p>}
      <Cv data={profile} reload={loadProfile} say={say} />
      {profile?.profile && <Privacy data={profile} reload={loadProfile} say={say} />}
    </main>
  </>;
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
      <p className="pj-muted">To withdraw consent, complain or ask a question about your data, write to Jobboard300. You can also complain to the Data Protection Board of India.</p>
    </section>
  </>;
}
