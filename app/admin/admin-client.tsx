"use client";

import Image from "next/image";
import Icon from "@/components/icon";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

type Job = { id: string; title: string; company: string; location: string; employmentType: string; sector: string; status: string };
type Application = { id: string; fullName: string; email: string; phone: string; location: string; experience: string; desiredRole: string; skills: string; education: string; availability: string; message: string; resumeName: string | null; hasResume: boolean; shareConsent: boolean; futureConsent: boolean; possibleDuplicate: boolean; reviewDue: boolean; status: string; recruiterNotes: string; createdAt: string; updatedAt: string; roleTitle: string | null };
type Enquiry = { id: string; contactName: string; company: string; email: string; phone: string; roleTitle: string; location: string; headcount: number; details: string; status: string; createdAt: string; reviewDue: boolean };
type PrivacyRequest = { id: string; requestType: string; requesterName: string; email: string; details: string; status: string; resolutionNote: string; createdAt: string };
type Activity = { action: string; targetType: string; targetId: string; createdAt: string };

const pipeline = ["new", "screening", "qualified", "shortlisted", "submitted", "interview", "selected", "offer", "joined", "rejected", "withdrawn", "on_hold"];
const label = (value: string) => value.replaceAll("_", " ");

export default function AdminClient({ name, signOut }: { name: string; signOut: string }) {
  const [tab, setTab] = useState("jobs"), [search, setSearch] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]), [applications, setApplications] = useState<Application[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]), [requests, setRequests] = useState<PrivacyRequest[]>([]), [activity, setActivity] = useState<Activity[]>([]);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [editingId, setEditingId] = useState<string | null>(null);

  const refresh = useCallback(async (q = "") => {
    const [j, r, p] = await Promise.all([
      fetch("/api/admin/jobs", { cache: "no-store" }),
      fetch(`/api/admin/records?q=${encodeURIComponent(q)}`, { cache: "no-store" }),
      fetch("/api/admin/privacy-requests", { cache: "no-store" }),
    ]);
    if (!j.ok || !r.ok || !p.ok) throw new Error("Admin records could not be loaded.");
    const jd = await j.json(), rd = await r.json(), pd = await p.json();
    setJobs(jd.jobs); setApplications(rd.applications); setEnquiries(rd.enquiries); setRequests(pd.requests); setActivity(pd.activity);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { refresh(search).catch(e => setNotice(e.message)); }, 250); return () => window.clearTimeout(timer); }, [refresh, search]);

  async function mutate(path: string, method: string, body?: object) {
    const response = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "The change could not be saved.");
    setNotice(result.message); await refresh(search);
  }
  async function removeRecord(type: string, id: string) {
    if (!window.confirm("Permanently delete this record and any stored CV? Verify the request and retention duties first.")) return;
    try { await mutate(`/api/admin/records/${type}/${id}`, "DELETE"); } catch (error) { setNotice(error instanceof Error ? error.message : "Deletion failed."); }
  }
  async function changeStatus(path: string, status: string) {
    try { await mutate(path, "PATCH", { status }); } catch (error) { setNotice(error instanceof Error ? error.message : "Update failed."); }
  }
  async function createJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice(""); const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    values.status = (form.elements.namedItem("publish") as HTMLInputElement).checked ? "published" : "draft";
    try { await mutate("/api/admin/jobs", "POST", values); form.reset(); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save role."); }
    finally { setBusy(false); }
  }
  async function saveNotes(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault(); const notes = String(new FormData(event.currentTarget).get("notes") ?? "");
    try { await mutate(`/api/admin/records/applications/${id}`, "PATCH", { notes }); } catch (error) { setNotice(error instanceof Error ? error.message : "Notes could not be saved."); }
  }
  async function correctProfile(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const profile = Object.fromEntries(new FormData(event.currentTarget).entries());
    try { await mutate(`/api/admin/records/applications/${id}`, "PATCH", { profile }); setEditingId(null); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Correction could not be saved."); }
  }
  async function withdrawOptionalConsents(id: string) {
    if (!window.confirm("Confirm you have verified this candidate's request to withdraw future-contact and employer-sharing consent.")) return;
    try { await mutate(`/api/admin/records/applications/${id}`, "PATCH", { withdrawOptionalConsents: true }); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Consent could not be updated."); }
  }
  async function privacyAction(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault(); const fields = new FormData(event.currentTarget);
    try { await mutate(`/api/admin/privacy-requests/${id}`, "PATCH", { status: fields.get("status"), resolutionNote: fields.get("resolutionNote"), identityVerified: fields.get("identityVerified") === "yes" }); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Request could not be updated."); }
  }
  const titles: Record<string, string> = { jobs: "Manage open roles", applications: "Candidate pipeline", enquiries: "Employer enquiries", privacy: "Privacy requests", activity: "Access history" };

  return <main className="admin-shell"><aside className="admin-sidebar"><a href="/"><Image src="/images/job-point-dark.png" width={160} height={160} alt="Job Point Consultancy" /></a><span className="admin-overline">RECRUITMENT CONSOLE</span><nav>
    {[["jobs", "Open roles", jobs.length], ["applications", "Candidate pipeline", applications.length], ["enquiries", "Employer enquiries", enquiries.length], ["privacy", "Privacy requests", requests.filter(r => !["completed", "declined"].includes(r.status)).length], ["activity", "Access history", activity.length]].map(([id, text, count]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(String(id))}>{text}<span>{count}</span></button>)}
    </nav><div className="admin-user"><b>{name}</b><span>Site administrator</span><a href={signOut}>Sign out</a></div></aside><section className="admin-main"><header><div><span className="eyebrow">JOB POINT CONSULTANCY</span><h1>{titles[tab]}</h1></div><a className="button button-quiet" href="/">View website <Icon name="north_east" /></a></header>{notice && <p className="admin-notice" role="status">{notice}</p>}
    {tab === "jobs" && <><form className="admin-form" onSubmit={createJob}><h2>Post a verified role</h2><div className="form-grid"><label>Job title<input name="title" required maxLength={160} /></label><label>Company<input name="company" placeholder="Confidential client" maxLength={160} /></label><label>Location<input name="location" required maxLength={120} /></label><label>Employment type<select name="employmentType"><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Temporary</option></select></label><label>Work mode<select name="workMode"><option>On-site</option><option>Hybrid</option><option>Remote</option></select></label><label>Sector<input name="sector" required placeholder="Operations, Technology…" /></label><label>Salary range<input name="salaryRange" placeholder="Optional" /></label><label className="full-field">Job description<textarea name="description" required rows={4} maxLength={4000} /></label><label className="full-field">Requirements<textarea name="requirements" rows={3} maxLength={2400} /></label><label className="consent full-field"><input type="checkbox" name="publish" /> Publish this role immediately</label></div><button className="button" disabled={busy}>{busy ? "Saving…" : "Save role"}</button></form><div className="admin-records"><h2>Role listings <span>{jobs.length}</span></h2>{jobs.length === 0 ? <p>No roles have been added. Add a confirmed vacancy above.</p> : jobs.map(job => <article key={job.id}><div><b>{job.title}</b><p>{job.location} · {job.employmentType} · {job.sector}</p></div><span className={`pill ${job.status}`}>{job.status}</span><select aria-label={`Set status for ${job.title}`} value={job.status} onChange={e => changeStatus(`/api/admin/jobs/${job.id}`, e.target.value)}><option value="draft">Draft</option><option value="published">Published</option><option value="closed">Closed</option></select></article>)}</div></>}
    {tab === "applications" && <div className="admin-records"><h2>Candidate records <span>{applications.length}</span></h2><label className="admin-search">Search by name, email, location, role or skill<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search candidate records" maxLength={100} /></label><p className="admin-help">Possible duplicates are flagged for human review. No candidate is rejected automatically. Results show the latest 200 matches.</p>{applications.length === 0 ? <p>No candidate records match this search.</p> : applications.map(a => <article className="admin-detail" key={a.id}><div><b>{a.fullName}</b>{a.possibleDuplicate && <span className="pill">Possible duplicate</span>}{a.reviewDue && <span className="pill">Retention review due</span>}<p>{a.roleTitle || a.desiredRole || "General candidate profile"} · {a.location} · {new Date(a.createdAt).toLocaleDateString()}</p><p><a href={`mailto:${a.email}`}>{a.email}</a> · <a href={`tel:${a.phone}`}>{a.phone}</a></p><p>Reference: JP-{a.id.slice(0,13).replaceAll("-", "").toUpperCase()}</p><p>{a.experience}</p>{a.message && <p><b>Submitted message:</b> {a.message}</p>}{a.skills && <p><b>Skills:</b> {a.skills}</p>}{a.education && <p><b>Education:</b> {a.education}</p>}{a.availability && <p><b>Available:</b> {a.availability}</p>}<p className="admin-consent">CV sharing: <b>{a.shareConsent ? "consented" : "ask first"}</b> · Future contact: <b>{a.futureConsent ? "yes" : "no"}</b></p>{a.hasResume && <a className="text-link" href={`/api/admin/resumes/${a.id}`}>Download CV ({a.resumeName}) <Icon name="north_east" /></a>}<div className="admin-record-actions"><button className="text-link" onClick={() => setEditingId(editingId === a.id ? null : a.id)}>{editingId === a.id ? "Cancel correction" : "Correct profile"}</button>{(a.shareConsent || a.futureConsent) && <button className="text-link" onClick={() => withdrawOptionalConsents(a.id)}>Withdraw optional consents</button>}</div>{editingId === a.id && <form className="admin-profile" onSubmit={event => correctProfile(event, a.id)}><p>Verify the candidate's identity and requested changes before saving.</p><label>Name<input name="fullName" defaultValue={a.fullName} required maxLength={120} /></label><label>Email<input type="email" name="email" defaultValue={a.email} required maxLength={254} /></label><label>Phone<input name="phone" defaultValue={a.phone} required maxLength={30} /></label><label>Location<input name="location" defaultValue={a.location} required maxLength={100} /></label><label>Desired role<input name="desiredRole" defaultValue={a.desiredRole} maxLength={160} /></label><label>Skills<input name="skills" defaultValue={a.skills} maxLength={500} /></label><label>Education<input name="education" defaultValue={a.education} maxLength={160} /></label><label>Availability<input name="availability" defaultValue={a.availability} maxLength={100} /></label><label className="full-field">Experience<textarea name="experience" defaultValue={a.experience} required maxLength={1200} rows={3} /></label><button className="button button-small">Save correction</button></form>}<form className="admin-notes" onSubmit={event => saveNotes(event, a.id)}><label>Private recruiter notes<textarea name="notes" defaultValue={a.recruiterNotes} rows={2} maxLength={2000} /></label><button type="submit" className="button button-small">Save notes</button></form></div><select aria-label={`Stage for ${a.fullName}`} value={a.status} onChange={e => changeStatus(`/api/admin/records/applications/${a.id}`, e.target.value)}>{pipeline.map(stage => <option key={stage} value={stage}>{label(stage)}</option>)}</select><button className="delete-link" onClick={() => removeRecord("applications", a.id)}>Delete</button></article>)}</div>}
    {tab === "enquiries" && <div className="admin-records"><h2>Employer enquiries <span>{enquiries.length}</span></h2>{enquiries.length === 0 ? <p>Employer enquiries will appear here.</p> : enquiries.map(q => <article className="admin-detail" key={q.id}><div><b>{q.company} · {q.roleTitle}</b>{q.reviewDue && <span className="pill">Retention review due</span>}<p>{q.contactName} · {q.location} · {q.headcount} hire(s)</p><p><a href={`mailto:${q.email}`}>{q.email}</a> · <a href={`tel:${q.phone}`}>{q.phone}</a></p><p>Reference: HE-{q.id.slice(0,13).replaceAll("-", "").toUpperCase()}</p><p>{q.details}</p></div><select aria-label={`Status for ${q.company}`} value={q.status} onChange={e => changeStatus(`/api/admin/records/enquiries/${q.id}`, e.target.value)}>{["new", "contacted", "in_progress", "closed"].map(status => <option key={status} value={status}>{label(status)}</option>)}</select><button className="delete-link" onClick={() => removeRecord("enquiries", q.id)}>Delete</button></article>)}</div>}
    {tab === "privacy" && <div className="admin-records"><h2>Privacy requests <span>{requests.length}</span></h2><p className="admin-help">Verify identity outside this form before disclosing, correcting or deleting data. Search the candidate records by email, carry out the requested action, then record the outcome here.</p>{requests.length === 0 ? <p>No privacy requests have been received.</p> : requests.map(r => <article className="admin-detail" key={r.id}><div><b>{r.requestType} · {r.requesterName}</b><p>{r.email} · {new Date(r.createdAt).toLocaleDateString()}</p><p>{r.details}</p><form className="privacy-action" onSubmit={event => privacyAction(event, r.id)}><label>Stage<select name="status" defaultValue={r.status}><option value="new">New</option><option value="verifying">Verifying identity</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="declined">Declined</option></select></label><label>Outcome and actions taken<textarea name="resolutionNote" defaultValue={r.resolutionNote} rows={2} maxLength={1200} /></label><label className="consent"><input name="identityVerified" type="checkbox" value="yes" /> I verified the requester before closing</label><button className="button button-small">Save request</button></form></div></article>)}</div>}
    {tab === "activity" && <div className="admin-records"><h2>Recent admin actions</h2><p className="admin-help">This list records actions without copying candidate or employer details into the audit log.</p>{activity.length === 0 ? <p>No actions have been recorded.</p> : activity.map((a, i) => <article key={`${a.targetId}-${i}`}><div><b>{label(a.action)} · {label(a.targetType)}</b><p>{a.targetId} · {new Date(a.createdAt).toLocaleString()}</p></div></article>)}</div>}
  </section></main>;
}
