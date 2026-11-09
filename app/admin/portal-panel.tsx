"use client";
// Platform admin for the job portal (site owner only): onboarding and matching
// parameters, parameter and JD approvals, plans and quota, review queues,
// duplicates, abuse flags, and the release and unlock log.
import { useCallback, useEffect, useState, type FormEvent } from "react";

type Row = Record<string, string | number | null>;
type Overview = { companies: Row[]; paramRequests: Row[]; pendingJds: Row[]; reviews: Row[]; duplicates: Row[]; flags: Row[]; log: Row[]; queue: number; plans: Row[]; heldAttempts?: Row[]; clientWork?: { managed: Row[]; placements: Row[] } };
const ROLE_FAMILIES = ["accounts-finance", "sales-bd", "customer-support", "operations-supply", "hr-admin", "software-it", "marketing", "manufacturing-engineering", "healthcare", "education", "hospitality-retail", "field-services"];
const SENIORITY = ["fresher", "junior", "mid", "senior", "lead"];

async function call(action: string, body: object) {
  const r = await fetch(`/api/admin/portal/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({})) as { message?: string; error?: string; link?: string };
  if (!r.ok) throw new Error(d.error ?? "The action failed.");
  return d;
}

function paramsFrom(f: FormData) {
  return {
    minScore: Number(f.get("minScore")), roleFamilies: f.getAll("roleFamilies").map(String), seniority: f.getAll("seniority").map(String),
    cities: String(f.get("cities") ?? "").split(",").map(s => s.trim()).filter(Boolean), allowRemote: f.get("allowRemote") === "yes",
    ctcBands: f.get("ctcMax") ? [{ minInr: Number(f.get("ctcMin") || 0) * 100_000, maxInr: Number(f.get("ctcMax")) * 100_000 }] : [],
    maxNoticeDays: f.get("maxNoticeDays") === "" ? null : Number(f.get("maxNoticeDays")), mandatoryFilters: f.getAll("mandatoryFilters").map(String),
    maxReleasePerJd: Number(f.get("maxReleasePerJd") || 25), maxLiveJds: Number(f.get("maxLiveJds") || 10),
  };
}

function ParamsFields() {
  return <div className="form-grid">
    <label>Minimum match score<input name="minScore" type="number" min={40} max={95} defaultValue={70} required /></label>
    <label>Cities (comma-separated, empty = any)<input name="cities" placeholder="Durgapur, Asansol" /></label>
    <fieldset className="full-field"><legend>Permitted role families</legend>{ROLE_FAMILIES.map(r => <label key={r} className="consent"><input type="checkbox" name="roleFamilies" value={r} /> {r}</label>)}</fieldset>
    <fieldset className="full-field"><legend>Permitted seniority</legend>{SENIORITY.map(s => <label key={s} className="consent"><input type="checkbox" name="seniority" value={s} defaultChecked={s === "junior" || s === "mid"} /> {s}</label>)}</fieldset>
    <label>CTC band from (LPA)<input name="ctcMin" type="number" step={0.5} min={0} /></label>
    <label>CTC band to (LPA)<input name="ctcMax" type="number" step={0.5} min={0} /></label>
    <label>Maximum notice (days)<input name="maxNoticeDays" type="number" min={0} max={180} defaultValue={60} /></label>
    <label>Remote roles<select name="allowRemote"><option value="no">Not permitted</option><option value="yes">Permitted</option></select></label>
    <label>Maximum CVs released per job<input name="maxReleasePerJd" type="number" min={5} max={200} defaultValue={25} /></label>
    <label>Maximum live jobs<input name="maxLiveJds" type="number" min={1} max={100} defaultValue={10} /></label>
    <fieldset className="full-field"><legend>Mandatory filters</legend>
      <label className="consent"><input type="checkbox" name="mandatoryFilters" value="ctc_stated" /> Candidate must state expected CTC</label>
      <label className="consent"><input type="checkbox" name="mandatoryFilters" value="notice_stated" /> Candidate must state notice period</label>
      <label className="consent"><input type="checkbox" name="mandatoryFilters" value="work_evidence_for_mandatory_skills" /> Essential skills must appear in work history</label>
    </fieldset>
  </div>;
}

function InviteClient({ plans, act }: { plans: Row[]; act: (action: string, body: object) => Promise<boolean> }) {
  return <form className="admin-form" onSubmit={async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const form = e.currentTarget, f = new FormData(form);
    const ok = await act("client-invite", { displayName: f.get("displayName"), legalName: f.get("legalName"), city: f.get("city"), website: f.get("website"), gstin: f.get("gstin"), ownerName: f.get("ownerName"), ownerEmail: f.get("ownerEmail"), guaranteeDays: Number(f.get("guaranteeDays")), nonSolicitMonths: Number(f.get("nonSolicitMonths")), feeTerms: f.get("feeTerms"), params: paramsFrom(f), plan: f.get("plan") });
    if (ok) form.reset(); }}>
    <div className="form-grid">
      <label>Company name<input name="displayName" required maxLength={120} /></label><label>Registered legal name<input name="legalName" required maxLength={160} /></label>
      <label>City<input name="city" maxLength={80} /></label><label>Website<input name="website" maxLength={200} /></label><label>GSTIN<input name="gstin" maxLength={15} /></label>
      <label>Owner&apos;s name<input name="ownerName" maxLength={120} /></label><label>Owner&apos;s work email<input name="ownerEmail" type="email" required maxLength={254} /></label>
      <label>Replacement guarantee (days)<input name="guaranteeDays" type="number" min={0} max={365} defaultValue={90} required /></label>
      <label>Non-solicitation of placed people (months)<input name="nonSolicitMonths" type="number" min={0} max={36} defaultValue={12} required /></label>
      <label className="full-field">Fee terms (shown to you only)<input name="feeTerms" maxLength={300} placeholder="e.g. 8.33% of annual fixed CTC, payable within 30 days of joining" /></label>
    </div>
    <ParamsFields />
    <label>Starting plan<select name="plan">{plans.map(p => <option key={String(p.code)} value={String(p.code)}>{p.name} ({p.unlock_quota} unlocks, {p.validity_days} days)</option>)}</select></label>
    <button className="button button-small">Create client and get sign-in link</button>
  </form>;
}

function ManagedSearch({ jd, act }: { jd: Row; act: (action: string, body: object) => Promise<boolean> }) {
  const [list, setList] = useState<Row[] | null>(null), [error, setError] = useState("");
  const load = () => fetch(`/api/admin/portal/submission-candidates?jd=${jd.id}`, { cache: "no-store" }).then(r => r.json() as Promise<{ candidates?: Row[]; error?: string }>).then(d => { if (d.error) setError(d.error); else setList(d.candidates ?? []); }).catch(() => setError("Could not load candidates."));
  return <article className="admin-detail"><div>
    <b>{jd.title}</b> · {jd.company} <span className="pill">{jd.status}</span>
    <p>{jd.openings} opening(s) · {jd.submitted} submitted · {jd.in_process} in process · {jd.joined} joined</p>
    <button className="text-link" onClick={() => list ? setList(null) : load()}>{list ? "Hide candidates" : "Find candidates to submit"}</button>
    {error && <p className="admin-help">{error}</p>}
    {list && (list.length === 0 ? <p className="admin-help">No scored candidates for this job yet. Run scoring, or source candidates and ask them to upload a CV.</p> : list.map(c => <div className="admin-submit" key={String(c.candidate_id)}>
      <p><b>{c.display_name || "Candidate"}</b> · {c.current_city || "city not stated"} · score {Math.round(Number(c.score))} (floor {Math.round(Number(c.lower_bound))}) · {Number(c.hard_pass) ? "meets the hard filters" : "misses a hard filter"}{Number(c.in_pipeline) ? " · already submitted" : ""}</p>
      <p className="admin-help">{c.explanation}</p>
      {!Number(c.in_pipeline) && <form className="admin-record-actions" onSubmit={async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const note = new FormData(e.currentTarget).get("note"); if (await act("submit-candidate", { companyId: jd.company_id, jdId: jd.id, candidateId: c.candidate_id, note })) load(); }}>
        <input name="note" required maxLength={2000} placeholder="Recruiter note: why this candidate, notice, CTC, availability" style={{ minWidth: "min(420px, 100%)" }} /><button className="button button-small">Submit to client</button></form>}
    </div>))}
  </div></article>;
}

export default function PortalPanel() {
  const [o, setO] = useState<Overview | null>(null), [notice, setNotice] = useState(""), [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => fetch("/api/admin/portal/overview", { cache: "no-store" }).then(r => r.json() as Promise<Overview>).then(setO).catch(() => setNotice("The portal overview could not be loaded.")), []);
  useEffect(() => { load(); }, [load]);
  const act = async (action: string, body: object, confirm?: string) => {
    if (confirm && !window.confirm(confirm)) return false;
    try { const d = await call(action, body); setNotice(d.link ? `${d.message} ${d.link}` : d.message ?? "Done."); await load(); return true; } catch (e) { setNotice((e as Error).message); return false; }
  };
  if (!o) return <p>Loading the job portal…</p>;
  const pending = o.companies.filter(c => c.status === "applied");
  return <div className="admin-portal">
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    <section className="admin-records"><h2>Overview</h2>
      <p>{pending.length} company application(s) · {o.paramRequests.length} parameter request(s) · {o.pendingJds.length} JD(s) awaiting approval · {o.reviews.length} CV(s) in manual review · {o.duplicates.length} duplicate flag(s) · {o.flags.length} abuse flag(s) · {o.heldAttempts?.length ?? 0} test attempt(s) on hold · {o.queue} scoring job(s) queued</p>
      <div className="admin-record-actions"><button className="button button-small" onClick={() => act("run-queue", {})}>Run scoring now</button>
        <form onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = new FormData(e.currentTarget); act("verify-link", { email: f.get("email"), purpose: f.get("purpose") }); }} className="admin-record-actions">
          <input name="email" type="email" placeholder="account email" required /><select name="purpose"><option value="verify">Verification link</option><option value="reset">Password reset link</option></select><button className="text-link">Issue link</button></form></div>
    </section>

    <section className="admin-records"><h2>Clients</h2>
      <p className="admin-help">Set up a client account yourself. This works while public registration is closed. You get a one-time link for the client&apos;s owner, valid for 7 days. If email is configured, the owner is also emailed.</p>
      <button className="text-link" onClick={() => setOpen(open === "invite" ? null : "invite")}>{open === "invite" ? "Cancel" : "Invite a client"}</button>
      {open === "invite" && <InviteClient plans={o.plans} act={async (a, b) => { const ok = await act(a, b); if (ok) setOpen(null); return ok; }} />}
    </section>

    <section className="admin-records"><h2>Managed searches <span>{o.clientWork?.managed.length ?? 0}</span></h2>
      <p className="admin-help">Jobs where the client asked Job Point to recruit. Submitting a candidate needs their consent to share. It uses no unlock quota; the fee is on placement.</p>
      {(o.clientWork?.managed ?? []).length === 0 ? <p>None.</p> : o.clientWork!.managed.map(j => <ManagedSearch key={String(j.id)} jd={j} act={act} />)}
    </section>

    <section className="admin-records"><h2>Placements <span>{o.clientWork?.placements.length ?? 0}</span></h2>
      {(o.clientWork?.placements ?? []).length === 0 ? <p>None yet.</p> : <table className="pj-table"><thead><tr><th>Client</th><th>Role</th><th>Joined</th><th>CTC</th><th>Guarantee until</th><th>No job approaches until</th><th>Fee terms</th><th>Status</th></tr></thead>
        <tbody>{o.clientWork!.placements.map(p => <tr key={String(p.id)}><td>{p.company}</td><td>{p.title}</td><td>{p.joined_on}</td><td>{p.ctc_inr ? `₹${(Number(p.ctc_inr) / 100000).toFixed(1)} LPA` : ""}</td><td>{p.guarantee_ends_on}</td><td>{p.non_solicit_until}</td><td>{p.fee_terms}</td>
          <td><select value={String(p.status)} onChange={e => act("placement-status", { placementId: p.id, status: e.target.value })}>{["active", "left_in_guarantee", "replaced", "left"].map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select>{p.left_on ? ` · left ${p.left_on}` : ""}{p.note ? ` · ${p.note}` : ""}</td></tr>)}</tbody></table>}
    </section>

    <section className="admin-records"><h2>Companies <span>{o.companies.length}</span></h2>
      {o.companies.map(c => <article className="admin-detail" key={String(c.id)}><div>
        <b>{c.display_name}</b> <span className="pill">{c.status}</span><p>{c.legal_name} · {c.city} · {c.owner_email} · guarantee {c.guarantee_days ?? 90} days · non-solicit {c.non_solicit_months ?? 12} months{c.fee_terms ? ` · ${c.fee_terms}` : ""}</p>
        {c.status === "applied" && <>
          <button className="text-link" onClick={() => setOpen(open === c.id ? null : String(c.id))}>{open === c.id ? "Cancel" : "Approve with matching parameters"}</button>
          {open === c.id && <form className="admin-form" onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = new FormData(e.currentTarget); act("company-activate", { companyId: c.id, params: paramsFrom(f), plan: f.get("plan") }).then(() => setOpen(null)); }}>
            <ParamsFields /><label>Starting plan<select name="plan">{o.plans.map(p => <option key={String(p.code)} value={String(p.code)}>{p.name} ({p.unlock_quota} unlocks, {p.validity_days} days{p.price_inr ? `, ₹${p.price_inr} + GST` : ""})</option>)}</select></label>
            <button className="button button-small">Approve company</button></form>}
        </>}
        {c.status === "active" && <div className="admin-record-actions">
          <select defaultValue="" onChange={e => e.target.value && act("plan-assign", { companyId: c.id, plan: e.target.value }, `Assign the ${e.target.value} plan? Record the invoice separately (payments are a stub).`)}><option value="">Assign plan…</option>{o.plans.filter(p => !p.is_free).map(p => <option key={String(p.code)} value={String(p.code)}>{p.name}</option>)}</select>
          <button className="text-link" onClick={() => { const d = window.prompt("Adjust unlock quota by (e.g. 10 or -5):"); const n = d && window.prompt("Reason:"); if (d && n) act("quota-adjust", { companyId: c.id, delta: Number(d), note: n }); }}>Adjust quota</button>
          <button className="text-link" onClick={() => setOpen(open === `p${c.id}` ? null : `p${c.id}`)}>Change parameters</button>
          <button className="text-link" onClick={() => { const g = window.prompt("Replacement guarantee (days):", String(c.guarantee_days ?? 90)); if (g === null) return; const n = window.prompt("Months Job Point will not approach people placed here about other jobs:", String(c.non_solicit_months ?? 12)); if (n === null) return; const t = window.prompt("Fee terms:", String(c.fee_terms ?? "")); if (t !== null) act("client-terms", { companyId: c.id, guaranteeDays: Number(g), nonSolicitMonths: Number(n), feeTerms: t }); }}>Client terms</button>
          <button className="delete-link" onClick={() => act("company-status", { companyId: c.id, status: "suspended" }, "Suspend this company? Its users lose access to the portal.")}>Suspend</button>
          {open === `p${c.id}` && <form className="admin-form" onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); act("company-params", { companyId: c.id, params: paramsFrom(new FormData(e.currentTarget)) }).then(() => setOpen(null)); }}><ParamsFields /><button className="button button-small">Save parameters</button></form>}
        </div>}
        {c.status === "suspended" && <button className="text-link" onClick={() => act("company-status", { companyId: c.id, status: "active" })}>Reactivate</button>}
      </div></article>)}
    </section>

    <section className="admin-records"><h2>Parameter change requests <span>{o.paramRequests.length}</span></h2>
      {o.paramRequests.length === 0 ? <p>None.</p> : o.paramRequests.map(r => <article className="admin-detail" key={String(r.id)}><div><b>{r.display_name}</b> · version {r.version}
        <p><b>Requested:</b> <code>{String(r.params)}</code></p><p><b>Current:</b> <code>{String(r.current)}</code></p>
        <div className="admin-record-actions"><button className="button button-small" onClick={() => act("params-decide", { requestId: r.id, approve: true })}>Approve</button><button className="delete-link" onClick={() => { const n = window.prompt("Reason for rejecting:"); if (n) act("params-decide", { requestId: r.id, approve: false, note: n }); }}>Reject</button></div></div></article>)}
    </section>

    <section className="admin-records"><h2>Jobs awaiting approval <span>{o.pendingJds.length}</span></h2>
      {o.pendingJds.length === 0 ? <p>None.</p> : o.pendingJds.map(j => { const r = JSON.parse(String(j.requirements)); return <article className="admin-detail" key={String(j.id)}><div><b>{j.title}</b> · {j.display_name}
        <p>Must-have: {r.mustHave.map((s: { name: string }) => s.name).join(", ") || "none"} · Essential: {r.hard.mandatorySkills.map((s: { name: string }) => s.name).join(", ") || "none"} · {r.minYears ?? 0}{r.maxYears ? `–${r.maxYears}` : "+"} yrs · {r.hard.remote ? "Remote" : r.hard.cities.join(", ")} · CTC {r.hard.ctcMinInr ? r.hard.ctcMinInr / 100000 : "?"}–{r.hard.ctcMaxInr ? r.hard.ctcMaxInr / 100000 : "?"} LPA · notice ≤ {r.hard.maxNoticeDays ?? "any"} days · role family {r.roleFamily}</p>
        <details><summary>Job description</summary><p style={{ whiteSpace: "pre-wrap" }}>{String(j.raw_text)}</p></details>
        <div className="admin-record-actions"><button className="button button-small" onClick={() => act("jd-decide", { jdId: j.id, approve: true })}>Approve and go live</button><button className="delete-link" onClick={() => { const n = window.prompt("What should the company change?"); if (n) act("jd-decide", { jdId: j.id, approve: false, note: n }); }}>Reject</button></div></div></article>; })}
    </section>

    <section className="admin-records"><h2>CVs needing manual review <span>{o.reviews.length}</span></h2>
      <p className="admin-help">Scanned or unreadable CVs are never dropped. Open the file, transcribe the key facts, and the CV joins matching.</p>
      {o.reviews.map(r => <article className="admin-detail" key={String(r.id)}><div><b>{r.display_name || "Candidate"}</b> · {r.file_name} · {String(r.created_at).slice(0, 10)}
        <p><a className="text-link" href={`/api/admin/portal/review-cv?candidate=${r.id}`}>Open the CV file</a></p>
        <form className="admin-profile" onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); act("review-resolve", { candidateId: r.id, ...Object.fromEntries(new FormData(e.currentTarget).entries()) }); }}>
          <label>Most recent title<input name="title" required /></label><label>Years of experience<input name="years" type="number" step={0.5} min={0} required /></label>
          <label>City<input name="city" /></label><label>Notice (days)<input name="noticeDays" type="number" min={0} /></label>
          <label>Expected CTC (₹ per year)<input name="ctcExpectedInr" type="number" min={0} /></label>
          <label className="full-field">Skills shown in the CV (comma-separated)<input name="skills" required /></label>
          <button className="button button-small">Save and release for matching</button></form></div></article>)}
    </section>

    <section className="admin-records"><h2>Possible duplicates <span>{o.duplicates.length}</span></h2>
      <p className="admin-help">Until you resolve a CV duplicate, only the earlier record can be shown to companies. Showing up to 50, CV duplicates first.</p>
      {o.duplicates.map(d => { const [keep, drop] = String(d.a_created) <= String(d.b_created) ? [d.a_id, d.b_id] : [d.b_id, d.a_id]; const keepName = keep === d.a_id ? d.a_name : d.b_name, dropName = keep === d.a_id ? d.b_name : d.a_name; return <article key={String(d.id)}><div><b>{d.kind === "cv" ? "Same or near-identical CV" : "Same contact details"} · {String(d.signal).replace(/_/g, " ")}</b><p>{keepName || "Candidate"} (earlier) and {dropName || "Candidate"} (later) · {String(d.created_at).slice(0, 10)}</p></div>
        <div className="admin-record-actions"><button className="text-link" onClick={() => act("merge", { survivorId: keep, duplicateId: drop }, `Merge ${dropName || "the later record"} into ${keepName || "the earlier record"}? Releases and unlocks follow the earlier record.`)}>Merge into earlier</button><button className="text-link" onClick={() => act("duplicate-dismiss", { flagId: d.id })}>Not a duplicate</button></div></article>; })}
    </section>

    <section className="admin-records"><h2>Test attempts on hold <span>{o.heldAttempts?.length ?? 0}</span></h2>
      {(o.heldAttempts ?? []).map(a => { const i = JSON.parse(String(a.integrity || "{}")) as { hidden?: number; pastes?: number; rapid?: number };
        return <article key={String(a.id)}><div><b>{a.display_name || "Candidate"}</b> · {a.title} · score {Math.round(Number(a.score) * 100)}%<p>Tab switches {i.hidden ?? 0} · pastes {i.pastes ?? 0} · rapid answers {i.rapid ?? 0} · {String(a.submitted_at).slice(0, 16)}</p></div>
          <div className="admin-record-actions"><button className="button button-small" onClick={() => act("attempt-review", { attemptId: a.id, accept: true })}>Clear, let it count</button><button className="delete-link" onClick={() => act("attempt-review", { attemptId: a.id, accept: false }, "Void this attempt? It will not count towards matching.")}>Void</button></div></article>; })}
    </section>
    <section className="admin-records"><h2>Abuse flags <span>{o.flags.length}</span></h2>
      {o.flags.map(f => <article key={String(f.id)}><div><b>{f.rule}</b> · {f.display_name ?? ""}<p>{f.detail} · {String(f.created_at).slice(0, 16)}</p></div>
        <div className="admin-record-actions"><button className="delete-link" onClick={() => act("flag-resolve", { flagId: f.id, suspend: true }, "Suspend this account and sign it out?")}>Suspend account</button><button className="text-link" onClick={() => act("flag-resolve", { flagId: f.id, suspend: false })}>Dismiss</button></div></article>)}
    </section>

    <section className="admin-records"><h2>Release and unlock log</h2>
      <table className="pj-table"><thead><tr><th>When</th><th>Event</th><th>Company</th><th>Job</th><th>Candidate ref</th><th>Score</th><th>Revoked</th></tr></thead>
        <tbody>{o.log.map((l, i) => <tr key={i}><td>{String(l.at).slice(0, 16).replace("T", " ")}</td><td>{l.kind}</td><td>{l.company}</td><td>{l.jd}</td><td>{l.candidate}</td><td>{l.score === null ? "" : Math.round(Number(l.score))}</td><td>{l.revoked_at ? String(l.revoked_at).slice(0, 10) : ""}</td></tr>)}</tbody></table>
    </section>
  </div>;
}
