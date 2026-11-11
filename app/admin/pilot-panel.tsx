"use client";
// Pilot and investor view (site owner only): the investor's conditions measured from the records, the weekly
// funnel, unit economics per placement (fee, collected, recruiter time, direct costs), lead sources and email delivery.
import { useCallback, useEffect, useState, type FormEvent } from "react";

type Readiness = { key: string; label: string; target: string; actual: string; met: boolean };
type Week = { week: string; prospects: number; mandates: number; vacanciesAuthorised: number; candidatesSubmitted: number; shortlistsAccepted: number; interviews: number; offers: number; joins: number; invoicedInr: number; collectedInr: number; recruiterHours: number; directCostInr: number };
type Placement = { id: string; title: string; client: string; joined_on: string; fee_inr: number | null; invoiced_on: string | null; collected_on: string | null; collected_inr: number | null; hours: number; timeCostInr: number; directCostInr: number; contributionInr: number; expectedContributionInr: number; replaces_placement_id: string | null };
type Pilot = {
  readiness: Readiness[]; funnel: Week[];
  sources: { employers: { source: string; enquiries: number; becameClients: number }[]; candidates: { source: string; applications: number }[] };
  economics: { hourlyCostInr: number; placements: Placement[]; totals: { joins: number; collectedInr: number; recruiterHours: number; totalCostInr: number; costPerHireInr: number | null; contributionInr: number } };
  email: { configured: boolean; provider: string; queued: number; last7Days: Record<string, number>; recent: { kind: string; recipient: string; subject: string; provider: string; status: string; detail: string; created_at: string }[] };
};

const inr = (n: number | null | undefined) => n == null ? "—" : `₹${Math.round(n).toLocaleString("en-IN")}`;
const today = () => new Date().toISOString().slice(0, 10);

async function call(action: string, body: object) {
  const r = await fetch(`/api/admin/portal/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({})) as { message?: string; error?: string };
  if (!r.ok) throw new Error(d.error ?? d.message ?? "The action failed.");
  return d.message ?? "Done.";
}

export default function PilotPanel() {
  const [p, setP] = useState<Pilot | null>(null), [notice, setNotice] = useState("");
  const load = useCallback(() => fetch("/api/admin/portal/pilot", { cache: "no-store" }).then(r => r.json() as Promise<Pilot>).then(setP).catch(() => setNotice("The pilot report could not be loaded.")), []);
  useEffect(() => { load(); }, [load]);
  const act = async (action: string, body: object) => { try { setNotice(await call(action, body)); await load(); return true; } catch (e) { setNotice((e as Error).message); return false; } };
  if (!p) return <p>{notice || "Loading the pilot report…"}</p>;
  const met = p.readiness.filter(r => r.met).length;
  return <div className="admin-portal">
    {notice && <p className="admin-notice" role="status">{notice}</p>}

    <section className="admin-records"><h2>Investor conditions <span>{met} of {p.readiness.length} met</span></h2>
      <p className="admin-help">Measured from the records, not entered by hand. A condition is met only when the records show it.</p>
      <table className="pj-table"><thead><tr><th>Condition</th><th>Target</th><th>Today</th><th></th></tr></thead>
        <tbody>{p.readiness.map(r => <tr key={r.key}><td>{r.label}</td><td>{r.target}</td><td>{r.actual}</td><td><span className="pill">{r.met ? "Met" : "Not yet"}</span></td></tr>)}</tbody></table>
    </section>

    <section className="admin-records"><h2>Weekly funnel</h2>
      <p className="admin-help">Weeks start on Monday (India time). Prospects are employer enquiries; mandates and authorised vacancies are recorded under Job portal; recruiter hours come from the time recruiters log in the Recruiting tool. <a href="/api/admin/portal/funnel.csv">Download 26 weeks as CSV</a></p>
      <div style={{ overflowX: "auto" }}><table className="pj-table"><thead><tr><th>Week of</th><th>Prospects</th><th>Mandates</th><th>Vacancies authorised</th><th>Submitted</th><th>Shortlisted</th><th>Interviews</th><th>Offers</th><th>Joins</th><th>Invoiced</th><th>Collected</th><th>Recruiter hours</th><th>Direct costs</th></tr></thead>
        <tbody>{p.funnel.map(w => <tr key={w.week}><td>{w.week}</td><td>{w.prospects}</td><td>{w.mandates}</td><td>{w.vacanciesAuthorised}</td><td>{w.candidatesSubmitted}</td><td>{w.shortlistsAccepted}</td><td>{w.interviews}</td><td>{w.offers}</td><td>{w.joins}</td><td>{inr(w.invoicedInr)}</td><td>{inr(w.collectedInr)}</td><td>{w.recruiterHours}</td><td>{inr(w.directCostInr)}</td></tr>)}</tbody></table></div>
    </section>

    <section className="admin-records"><h2>Unit economics</h2>
      <p className="admin-help">Contribution = money collected − recruiter time (hours × hourly cost) − direct costs on the job. A fee invoiced is not profit until it is collected.</p>
      <p>Hires {p.economics.totals.joins} · collected {inr(p.economics.totals.collectedInr)} · recruiter hours {p.economics.totals.recruiterHours} · total cost {inr(p.economics.totals.totalCostInr)} · cost per hire {inr(p.economics.totals.costPerHireInr)} · contribution <b>{inr(p.economics.totals.contributionInr)}</b></p>
      <form className="admin-record-actions" onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); act("hourly-cost", { inr: Number(new FormData(e.currentTarget).get("inr")) }); }}>
        <label>Cost of one recruiter hour (₹, salary and overheads) <input name="inr" type="number" min={0} defaultValue={p.economics.hourlyCostInr} key={p.economics.hourlyCostInr} /></label><button className="text-link">Save</button></form>
      {p.economics.placements.length === 0 ? <p>No placements yet.</p> : <div style={{ overflowX: "auto" }}><table className="pj-table"><thead><tr><th>Client</th><th>Role</th><th>Joined</th><th>Fee</th><th>Invoice</th><th>Collected</th><th>Hours</th><th>Time cost</th><th>Direct cost</th><th>Contribution</th></tr></thead>
        <tbody>{p.economics.placements.map(r => <tr key={r.id}><td>{r.client}</td><td>{r.title}{r.replaces_placement_id ? " (replacement, no fee)" : ""}</td><td>{r.joined_on}</td><td>{inr(r.fee_inr)}</td>
          <td>{r.invoiced_on ?? <button className="text-link" onClick={() => { const n = window.prompt("Invoice number:"); if (!n) return; const d = window.prompt("Invoice date (YYYY-MM-DD):", today()); if (d) act("placement-invoice", { placementId: r.id, invoiceNumber: n, invoicedOn: d }); }}>Record invoice</button>}</td>
          <td>{r.collected_on ? `${inr(r.collected_inr)} on ${r.collected_on}` : r.invoiced_on ? <button className="text-link" onClick={() => { const a = window.prompt("Amount received (₹):", String(r.fee_inr ?? "")); if (!a) return; const d = window.prompt("Date received (YYYY-MM-DD):", today()); if (d) act("placement-collected", { placementId: r.id, amountInr: Number(a), collectedOn: d }); }}>Record payment</button> : "—"}</td>
          <td>{r.hours}</td><td>{inr(r.timeCostInr)}</td><td>{inr(r.directCostInr)}</td><td>{r.collected_on ? inr(r.contributionInr) : `${inr(r.expectedContributionInr)} if paid`}</td></tr>)}</tbody></table></div>}
      <form className="admin-form" onSubmit={async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const form = e.currentTarget, f = Object.fromEntries(new FormData(form).entries()); if (await act("cost-log", { ...f, amountInr: Number(f.amountInr) })) form.reset(); }}>
        <h3>Record a direct cost</h3><div className="form-grid">
          <label>What for<select name="kind"><option value="job_ads">Job advertising</option><option value="sourcing_tools">Sourcing tools</option><option value="messaging">Messaging</option><option value="travel">Travel</option><option value="other">Other</option></select></label>
          <label>Amount (₹)<input name="amountInr" type="number" min={1} required /></label>
          <label>Date<input name="spentOn" type="date" defaultValue={today()} /></label>
          <label>Job id (optional, from the Recruiting tool)<input name="jdId" maxLength={60} /></label>
          <label className="full-field">Note<input name="note" maxLength={300} /></label></div>
        <button className="button button-small">Save cost</button></form>
    </section>

    <section className="admin-records"><h2>Where leads come from</h2>
      <div className="form-grid">
        <table className="pj-table"><thead><tr><th>Employer source</th><th>Enquiries</th><th>Became clients</th></tr></thead><tbody>{p.sources.employers.map(s => <tr key={s.source}><td>{s.source}</td><td>{s.enquiries}</td><td>{s.becameClients}</td></tr>)}</tbody></table>
        <table className="pj-table"><thead><tr><th>Candidate source</th><th>Applications</th></tr></thead><tbody>{p.sources.candidates.map(s => <tr key={s.source}><td>{s.source}</td><td>{s.applications}</td></tr>)}</tbody></table>
      </div>
    </section>

    <section className="admin-records"><h2>Email delivery</h2>
      <p className="admin-help">{p.email.configured ? `Sending through ${p.email.provider}.` : "Not set up: no email leaves the site. Free option: create a Brevo account, verify your sender address, then set MAIL_PROVIDER=brevo, MAIL_API_KEY and MAIL_FROM in the hosting settings."} Last 7 days: {Object.entries(p.email.last7Days).map(([k, v]) => `${v} ${k.replace("_", " ")}`).join(" · ") || "nothing attempted"}. {p.email.queued} update(s) waiting to be sent.</p>
      <form className="admin-record-actions" onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); act("mail-test", { to: new FormData(e.currentTarget).get("to") }); }}>
        <input name="to" type="email" required placeholder="Send a test email to…" /><button className="button button-small">Send test</button></form>
      <table className="pj-table"><thead><tr><th>When</th><th>What</th><th>To</th><th>Status</th><th>Detail</th></tr></thead>
        <tbody>{p.email.recent.map((m, i) => <tr key={i}><td>{m.created_at.slice(0, 16).replace("T", " ")}</td><td>{m.kind || m.subject}</td><td>{m.recipient}</td><td><span className="pill">{m.status.replace("_", " ")}</span></td><td>{m.detail}</td></tr>)}</tbody></table>
    </section>
  </div>;
}
