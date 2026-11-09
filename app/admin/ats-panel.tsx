"use client";

// Owner-only CV screening (ATS) inside the recruitment console. Not linked from
// the public site or the team Working Platform; every API it calls checks the
// site owner's sign-in on the server.

import Icon from "@/components/icon";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { CandidateProfile, JobRequirements, RequirementSkill, ScreeningResult, Verdict } from "@/lib/ats/types";

type Role = { id: string; title: string; location: string; status: string; applicants: number; screened: number; edited: number };
type Overview = { roles: Role[]; poolSize: number; ai: { available: boolean; model: string }; engineVersion: string };
type Candidate = { id: string; fullName: string; location: string; desiredRole: string; status: string; appliedAt: string; fromPool: boolean; hasCv: boolean; screeningId: string | null; score: number | null; verdict: Verdict | null; method: string | null; screenedAt: string | null; decision: string | null; stale: boolean };
type RoleDetail = { job: { id: string; title: string; company: string; location: string; workMode: string; status: string; description: string; requirements: string }; requirements: JobRequirements; requirementsUpdatedAt: string | null; candidates: Candidate[] };
type Screening = { id: string; applicationId: string; jobId: string | null; createdAt: string; decision: string; decisionReason: string; decidedAt?: string | null; candidateName?: string };
type Report = { screening?: Screening; profile: CandidateProfile; requirements: JobRequirements; result: ScreeningResult };

const VERDICT_TEXT: Record<Verdict, string> = { strong: "Strong fit", possible: "Possible fit", weak: "Weak fit", not_fit: "Not a fit", needs_review: "Needs review" };
const STATUS_TEXT = { met: "Met", unverified: "Listed only", partial: "Related", missing: "Not found" } as const;
const LEVELS = ["Not required", "10th", "12th", "Diploma / ITI", "Bachelor's degree", "Master's / professional", "Doctorate"];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "The request failed.");
  return data;
}
const send = (method: string, body: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const skills = (list: RequirementSkill[]) => list.map(s => s.name).join(", ");
const date = (value: string | null) => value ? new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
const ym = (value: string | null) => value ? new Date(`${value}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" }) : "";

export default function AtsPanel({ initialJobId }: { initialJobId?: string }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [mode, setMode] = useState<"role" | "single">("role");
  const [chosenJobId, setJobId] = useState(initialJobId ?? "");
  const [pool, setPool] = useState(false);
  const [detail, setDetail] = useState<RoleDetail | null>(null);
  const [useAi, setUseAi] = useState(false);
  const [busy, setBusy] = useState(""), [notice, setNotice] = useState("");
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => { api<Overview>("/api/admin/ats").then(setOverview).catch(e => setNotice(e.message)); }, []);
  // The panel remounts each time the tab opens, so initialJobId only seeds the first choice.
  const jobId = chosenJobId || overview?.roles[0]?.id || "";

  const rolePath = jobId ? `/api/admin/ats/jobs/${jobId}${pool ? "?pool=1" : ""}` : "";
  const loadRole = useCallback(async () => {
    if (!rolePath) return;
    try { setDetail(await api<RoleDetail>(rolePath)); }
    catch (e) { setNotice(e instanceof Error ? e.message : "The role could not be loaded."); }
  }, [rolePath]);
  useEffect(() => {
    if (!rolePath) return;
    let live = true;
    api<RoleDetail>(rolePath).then(d => { if (live) setDetail(d); }).catch(e => { if (live) setNotice(e.message); });
    return () => { live = false; };
  }, [rolePath]);

  async function screenOne(candidate: Candidate) {
    setBusy(candidate.id); setNotice("");
    try {
      const data = await api<Report>("/api/admin/ats/screen", send("POST", { applicationId: candidate.id, jobId, useAi }));
      setReport({ ...data, screening: { ...data.screening!, candidateName: candidate.fullName } });
      await loadRole();
    } catch (e) { setNotice(`${candidate.fullName}: ${e instanceof Error ? e.message : "screening failed."}`); }
    finally { setBusy(""); }
  }
  async function screenAll() {
    if (!detail) return;
    const queue = detail.candidates.filter(c => c.hasCv && (!c.screeningId || c.stale));
    let done = 0, failed = 0;
    for (const candidate of queue) {
      setBusy(`all:${done + 1}/${queue.length}`);
      try { await api<Report>("/api/admin/ats/screen", send("POST", { applicationId: candidate.id, jobId, useAi })); done++; }
      catch { failed++; done++; }
    }
    setBusy(""); setNotice(`Screened ${done - failed} of ${queue.length} candidates${failed ? `; ${failed} could not be read` : ""}.`);
    await loadRole();
  }
  async function openReport(id: string) {
    setBusy(`open:${id}`);
    try { setReport(await api<Report>(`/api/admin/ats/screenings/${id}`)); }
    catch (e) { setNotice(e instanceof Error ? e.message : "The report could not be loaded."); }
    finally { setBusy(""); }
  }
  const unscreened = detail?.candidates.filter(c => c.hasCv && (!c.screeningId || c.stale)).length ?? 0;

  return <div className="ats">
    <p className="ats-intro"><Icon name="verified_user" /> Recommendations only. A recruiter reviews every result and makes every decision; no candidate is rejected automatically. Date of birth, gender, marital status, religion, caste and similar details are removed before screening and never scored.</p>
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    <div className="ats-modes" role="tablist" aria-label="Screening mode">
      <button role="tab" aria-selected={mode === "role"} className={mode === "role" ? "active" : ""} onClick={() => { setMode("role"); setReport(null); }}><Icon name="groups" /> Screen applicants for a role</button>
      <button role="tab" aria-selected={mode === "single"} className={mode === "single" ? "active" : ""} onClick={() => { setMode("single"); setReport(null); }}><Icon name="upload_file" /> Check a single CV</button>
    </div>
    <AiToggle overview={overview} useAi={useAi} setUseAi={setUseAi} />

    {mode === "role" && <>
      <section className="admin-records">
        <div className="ats-role-bar">
          <label className="admin-search">Role<select value={jobId} onChange={e => { setReport(null); setJobId(e.target.value); }} disabled={!overview?.roles.length}>
            {!overview?.roles.length && <option value="">No roles yet</option>}
            {overview?.roles.map(r => <option key={r.id} value={r.id}>{r.title} · {r.location} ({r.status}) · {r.applicants} applicant{r.applicants === 1 ? "" : "s"}</option>)}
          </select></label>
          {!!overview?.poolSize && <label className="consent ats-pool"><input type="checkbox" checked={pool} onChange={e => { setReport(null); setPool(e.target.checked); }} /> Include {overview.poolSize} general registration{overview.poolSize === 1 ? "" : "s"} who agreed to be considered for other roles</label>}
        </div>
        {overview && !overview.roles.length && <p>Add a role under <b>Open roles</b> first, or use <b>Check a single CV</b> with a pasted job description.</p>}
      </section>
      {detail && <RequirementsEditor key={`${detail.job.id}:${detail.requirementsUpdatedAt}`} detail={detail} onSaved={loadRole} setNotice={setNotice} />}
      {detail && <section className="admin-records">
        <div className="ats-list-head"><h2>Candidates <span>{detail.candidates.length}</span></h2>
          <button className="button button-small" disabled={!!busy || !unscreened} onClick={screenAll}>{busy.startsWith("all:") ? `Screening ${busy.slice(4)}…` : unscreened ? `Screen ${unscreened} not yet screened` : "All screened"}</button></div>
        {detail.candidates.length === 0 ? <p>No applications for this role yet{overview?.poolSize ? ". Tick the box above to include general registrations." : "."}</p> :
          <div className="ats-table" role="table" aria-label="Candidates ranked by fit">
            <div className="ats-row ats-row-head" role="row"><span role="columnheader">Candidate</span><span role="columnheader">Fit</span><span role="columnheader">Screened</span><span role="columnheader">Actions</span></div>
            {detail.candidates.map(c => <div className={`ats-row${report?.screening?.applicationId === c.id ? " selected" : ""}`} role="row" key={c.id}>
              <span role="cell"><b>{c.fullName}</b>{c.fromPool && <span className="pill">General registration</span>}<small>{c.location}{c.desiredRole ? ` · wants ${c.desiredRole}` : ""} · applied {date(c.appliedAt)} · stage {c.status.replaceAll("_", " ")}</small></span>
              <span role="cell">{c.verdict ? <><ScoreBar score={c.score ?? 0} verdict={c.verdict} />{c.stale && <small className="ats-stale">Requirements changed since</small>}</> : <small>{c.hasCv ? "Not screened" : "No CV on file"}</small>}</span>
              <span role="cell"><small>{c.screenedAt ? `${date(c.screenedAt)} · ${c.method === "ai" ? "Claude" : "Built-in"}` : "–"}{c.decision ? ` · you ${c.decision === "agree" ? "agreed" : "disagreed"}` : ""}</small></span>
              <span role="cell" className="ats-actions">
                {c.screeningId && <button className="text-link" disabled={!!busy} onClick={() => openReport(c.screeningId!)}>Report</button>}
                {c.hasCv && <button className="text-link" disabled={!!busy} onClick={() => screenOne(c)}>{busy === c.id ? "Screening…" : c.screeningId ? "Re-screen" : "Screen"}</button>}
              </span>
            </div>)}
          </div>}
      </section>}
    </>}

    {mode === "single" && <SingleCheck roles={overview?.roles ?? []} useAi={useAi} onResult={setReport} setNotice={setNotice} />}
    {report && <ReportView report={report} onClose={() => setReport(null)} onReviewed={loadRole} setNotice={setNotice} />}
  </div>;
}

function AiToggle({ overview, useAi, setUseAi }: { overview: Overview | null; useAi: boolean; setUseAi: (v: boolean) => void }) {
  if (!overview) return null;
  if (!overview.ai.available) return <p className="admin-help ats-ai">CVs are read by the built-in parser on this server. Claude-assisted reading is off (no API key is configured).</p>;
  return <label className="consent ats-ai"><input type="checkbox" checked={useAi} onChange={e => setUseAi(e.target.checked)} /> Use Claude ({overview.ai.model}) to read CVs. Names, contact details and personal fields are removed before the text is sent; the score is still calculated here.</label>;
}

function RequirementsEditor({ detail, onSaved, setNotice }: { detail: RoleDetail; onSaved: () => Promise<void>; setNotice: (s: string) => void }) {
  const r = detail.requirements;
  const [open, setOpen] = useState(r.origin === "generated" || !r.mustHave.length);
  const [saving, setSaving] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    const f = new FormData(event.currentTarget);
    try {
      const data = await api<{ message: string }>(`/api/admin/ats/jobs/${detail.job.id}`, send("PUT", { requirements: Object.fromEntries(f.entries()) }));
      setNotice(data.message); await onSaved();
    } catch (e) { setNotice(e instanceof Error ? e.message : "Could not save."); }
    finally { setSaving(false); }
  }
  async function regenerate() {
    if (!window.confirm("Discard your edits and regenerate the requirements from the job description?")) return;
    try { const data = await api<{ message: string }>(`/api/admin/ats/jobs/${detail.job.id}`, send("PUT", { regenerate: true })); setNotice(data.message); await onSaved(); }
    catch (e) { setNotice(e instanceof Error ? e.message : "Could not regenerate."); }
  }
  return <section className="admin-records ats-requirements">
    <button className="ats-collapse" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span><h2>Requirements used for scoring</h2><small>{r.origin === "edited" ? `Edited ${date(detail.requirementsUpdatedAt)}` : "Generated from the job description. Check them before screening."} · {r.mustHave.length} must-have · {r.niceToHave.length} nice-to-have{r.minYears !== null ? ` · ${r.minYears}${r.maxYears !== null ? `–${r.maxYears}` : "+"} years` : ""}</small></span>
      <Icon name={open ? "expand_less" : "expand_more"} />
    </button>
    {open && <form className="ats-req-form" onSubmit={save}>
      {r.notes.map(n => <p key={n} className="admin-help">{n}</p>)}
      <label className="full">Job title<input name="title" defaultValue={r.title} maxLength={160} /></label>
      <label className="full">Must-have skills <small>Comma-separated. Missing must-haves lower the verdict.</small><textarea name="mustHave" defaultValue={skills(r.mustHave)} rows={2} /></label>
      <label className="full">Nice-to-have skills <small>Comma-separated.</small><textarea name="niceToHave" defaultValue={skills(r.niceToHave)} rows={2} /></label>
      <label>Minimum years<input name="minYears" type="number" min={0} max={40} step={0.5} defaultValue={r.minYears ?? ""} placeholder="Not required" /></label>
      <label>Maximum years<input name="maxYears" type="number" min={0} max={45} step={0.5} defaultValue={r.maxYears ?? ""} placeholder="No limit" /></label>
      <label>Minimum education<select name="educationLevel" defaultValue={r.educationLevel ?? ""}>{LEVELS.map((l, i) => <option key={l} value={i === 0 ? "" : i}>{l}</option>)}</select></label>
      <label>Preferred fields of study<input name="educationFields" defaultValue={r.educationFields.join(", ")} placeholder="e.g. Commerce" /></label>
      <label>Job location<input name="location" defaultValue={r.location} maxLength={120} /></label>
      <label>Work mode<select name="workMode" defaultValue={r.workMode || "On-site"}><option>On-site</option><option>Hybrid</option><option>Remote</option></select></label>
      <div className="full ats-req-actions"><button className="button button-small" disabled={saving}>{saving ? "Saving…" : "Save requirements"}</button>{r.origin === "edited" && <button type="button" className="text-link" onClick={regenerate}>Regenerate from job description</button>}</div>
    </form>}
  </section>;
}

function SingleCheck({ roles, useAi, onResult, setNotice }: { roles: Role[]; useAi: boolean; onResult: (r: Report) => void; setNotice: (s: string) => void }) {
  const [source, setSource] = useState(roles.length ? "role" : "paste");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice("");
    const form = new FormData(event.currentTarget);
    if (source === "paste") form.delete("jobId");
    if (useAi) form.set("useAi", "yes");
    try { onResult(await api<Report>("/api/admin/ats/analyze", { method: "POST", body: form })); }
    catch (e) { setNotice(e instanceof Error ? e.message : "The CV could not be checked."); }
    finally { setBusy(false); }
  }
  return <form className="admin-form ats-single" onSubmit={submit}>
    <h2>Check a CV that is not in the pipeline</h2>
    <p className="admin-help">For a CV received another way, such as by email. The result is shown here and not saved; only an audit entry without CV content is recorded.</p>
    <div className="form-grid">
      <label className="full-field">CV file <small>PDF or DOCX with selectable text, up to 5 MB</small><input name="resume" type="file" required accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" /></label>
      <fieldset className="full-field ats-source"><legend>Compare with</legend>
        <label className="consent"><input type="radio" name="source" checked={source === "role"} disabled={!roles.length} onChange={() => setSource("role")} /> A saved role</label>
        <label className="consent"><input type="radio" name="source" checked={source === "paste"} onChange={() => setSource("paste")} /> A job description from the client</label>
      </fieldset>
      {source === "role" ? <label className="full-field">Role<select name="jobId" required>{roles.map(r => <option key={r.id} value={r.id}>{r.title} · {r.location}</option>)}</select></label> : <>
        <label>Job title<input name="title" required maxLength={160} placeholder="e.g. Accounts Executive" /></label>
        <label>Job location<input name="location" maxLength={120} placeholder="e.g. Kolkata" /></label>
        <label className="full-field">Job description and requirements<textarea name="description" required minLength={30} maxLength={8000} rows={7} placeholder="Paste the client's job description, including requirements such as skills, years of experience and qualifications." /></label>
      </>}
    </div>
    <button className="button" disabled={busy}>{busy ? "Reading CV…" : "Check CV"}</button>
  </form>;
}

function ScoreBar({ score, verdict }: { score: number; verdict: Verdict }) {
  return <span className={`ats-score v-${verdict}`}><span className="ats-bar" aria-hidden="true"><i style={{ width: `${Math.max(3, score)}%` }} /></span><b>{score}</b><span className="ats-verdict">{VERDICT_TEXT[verdict]}</span></span>;
}

function ReportView({ report, onClose, onReviewed, setNotice }: { report: Report; onClose: () => void; onReviewed: () => Promise<void>; setNotice: (s: string) => void }) {
  const { profile: p, result: r, requirements: q, screening } = report;
  const [decision, setDecision] = useState(screening?.decision ?? "");
  const [reason, setReason] = useState(screening?.decisionReason ?? "");
  const json = useMemo(() => JSON.stringify({ profile: p, requirements: q, result: r }, null, 2), [p, q, r]);
  const name = screening?.candidateName || p.contact.name || "Candidate";
  function download() {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `screening-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json` });
    a.click(); URL.revokeObjectURL(url);
  }
  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!screening) return;
    try { const data = await api<{ message: string }>(`/api/admin/ats/screenings/${screening.id}`, send("PATCH", { decision, reason })); setNotice(data.message); await onReviewed(); }
    catch (e) { setNotice(e instanceof Error ? e.message : "The review could not be saved."); }
  }
  const must = r.checks.filter(c => c.kind === "must"), nice = r.checks.filter(c => c.kind === "nice");
  return <section className="admin-records ats-report" aria-label={`Screening report for ${name}`}>
    <header className="ats-report-head">
      <div><span className="eyebrow">SCREENING REPORT{screening ? "" : " · NOT SAVED"}</span><h2>{name}</h2><small>{q.title} · {p.source.fileName} · read by {p.source.method === "ai" ? `Claude (${p.source.model})` : "the built-in parser"} · {r.engineVersion}{screening ? ` · ${date(screening.createdAt)}` : ""}</small></div>
      <button className="text-link" onClick={onClose}><Icon name="close" /> Close</button>
    </header>
    <div className={`ats-verdict-card v-${r.verdict}`}><div className="ats-big-score"><b>{r.score}</b><span>/ 100</span></div><div><h3>{r.verdictLabel}</h3><p>{r.verdictReason}</p><small>Parse confidence {Math.round(p.parse.confidence * 100)}% · {r.experience.relevantYears} relevant of {r.experience.totalYears} years of experience</small></div></div>

    <h3>Score breakdown</h3>
    <ul className="ats-components">{r.components.map(c => <li key={c.key} className={c.score === null ? "unused" : ""}>
      <span>{c.label}<small>{c.score === null ? "not used, weight shared" : `weight ${c.weight}`}</small></span>
      <span className="ats-bar" aria-hidden="true"><i style={{ width: `${(c.score ?? 0) * 100}%` }} /></span>
      <b>{c.score === null ? "–" : Math.round(c.score * 100)}</b>
      <p>{c.detail}</p>
    </li>)}</ul>

    <h3>Requirements: fit and gaps</h3>
    {r.checks.length === 0 ? <p>No skills are defined for this role.</p> : <div className="ats-checks">{[...must, ...nice].map(c => <div key={`${c.kind}:${c.requirement}`} className={`ats-check s-${c.status}`}>
      <span className="pill">{c.kind === "must" ? "Must" : "Nice"}</span><b>{c.requirement}</b><span className="ats-status">{STATUS_TEXT[c.status]}{c.status === "partial" ? `: ${c.matchedAs}` : ""}</span><small>{c.evidence}</small>
    </div>)}</div>}

    <div className="ats-columns">
      {r.strengths.length > 0 && <div><h3>Strengths</h3><ul>{r.strengths.map(s => <li key={s}>{s}</li>)}</ul></div>}
      {r.concerns.length > 0 && <div><h3>Gaps to check</h3><ul>{r.concerns.map(s => <li key={s}>{s}</li>)}</ul></div>}
    </div>
    {r.interviewProbes.length > 0 && <><h3>Suggested screening questions</h3><ol className="ats-probes">{r.interviewProbes.map(s => <li key={s}>{s}</li>)}</ol></>}
    {r.flags.length > 0 && <div className="ats-flags"><h3>Notes</h3><ul>{r.flags.map(s => <li key={s}>{s}</li>)}</ul></div>}

    <h3>Extracted profile</h3>
    <div className="ats-profile">
      <div><h4>Work history</h4>{p.work.length ? <ul>{p.work.map((w, i) => <li key={i}><b>{w.title || "Role"}</b>{w.employer && ` · ${w.employer}`}<small>{ym(w.start)} – {w.current ? "Present" : ym(w.end)} · {Math.round(w.months / 12 * 10) / 10} yrs{w.location ? ` · ${w.location}` : ""}</small></li>)}</ul> : <p>No dated roles found.</p>}</div>
      <div><h4>Education</h4>{p.education.length ? <ul>{p.education.map((e, i) => <li key={i}><b>{e.qualification}</b>{e.field && ` (${e.field})`}<small>{[e.institution, e.year].filter(Boolean).join(" · ")}</small></li>)}</ul> : <p>Not found.</p>}</div>
      <div><h4>Skills</h4><p className="ats-skill-cloud">{p.skills.slice(0, 40).map(s => <span key={s.id} className={`e-${s.evidence}`} title={s.snippet}>{s.name}</span>)}</p><small>Darker chips are backed by work history; lighter ones appear only in a skills list.</small></div>
      <div><h4>Other details</h4><ul>
        {p.languages.length > 0 && <li>Languages: {p.languages.join(", ")}</li>}
        {p.certifications.length > 0 && <li>Certifications: {p.certifications.join("; ")}</li>}
        <li>Notice period: {p.noticePeriod || "not stated"}</li>
        {(p.currentCtc || p.expectedCtc) && <li>CTC (shown, not scored): {[p.currentCtc && `current ${p.currentCtc}`, p.expectedCtc && `expected ${p.expectedCtc}`].filter(Boolean).join(", ")}</li>}
        <li>Location: {p.contact.location || "not stated"}</li>
      </ul></div>
    </div>

    {screening && <form className="ats-review" onSubmit={review}>
      <h3>Your review</h3>
      <p className="admin-help">Record whether you agree with this recommendation. It does not change the candidate&apos;s stage; use the candidate pipeline for that.{screening.decidedAt ? ` Last recorded ${date(screening.decidedAt)}.` : ""}</p>
      <div className="ats-review-options">
        <label className="consent"><input type="radio" name="decision" checked={decision === "agree"} onChange={() => setDecision("agree")} /> I agree</label>
        <label className="consent"><input type="radio" name="decision" checked={decision === "disagree"} onChange={() => setDecision("disagree")} /> I disagree</label>
      </div>
      {decision === "disagree" && <label>Reason (required)<textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} maxLength={1000} required minLength={5} /></label>}
      <button className="button button-small" disabled={!decision}>Save review</button>
    </form>}

    <details className="ats-json"><summary>Structured JSON (profile, requirements and result)</summary>
      <button className="button button-small button-quiet" onClick={download}><Icon name="download" /> Download JSON</button>
      <pre>{json}</pre>
    </details>
  </section>;
}
