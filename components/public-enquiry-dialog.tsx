"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { DEMO_MODE, DEMO_MESSAGE } from "@/lib/demo";
import CandidateFields from "./candidate-fields";
import DemoFormNotice from "./demo-form-notice";
import FormConfirmation from "./form-confirmation";
import Icon from "./icon";
import { attributionFields } from "@/lib/attribution";

/** Adds where the visitor came from (campaign tags, referring site) to a form about to be sent. */
function withArrival(data: FormData) { for (const [name, value] of Object.entries(attributionFields())) if (value) data.set(name, String(value)); return data; }

type Props = { type: "candidate" | "employer"; onClose: () => void; inline?: boolean };

export default function PublicEnquiryDialog({ type, onClose, inline = false }: Props) {
  const dialog = useRef<HTMLElement>(null);
  const titleId = useId(), introId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ title: string; message: string } | null>(null);
  // Times free for a call with a consultant (employer enquiries only), grouped by India-time day.
  const [slots, setSlots] = useState<string[]>([]), [day, setDay] = useState("");
  useEffect(() => {
    if (type !== "employer" || DEMO_MODE) return;
    fetch("/api/employer-enquiries").then(r => r.ok ? r.json() as Promise<{ slots?: string[] }> : { slots: [] }).then(d => setSlots(d.slots ?? [])).catch(() => setSlots([]));
  }, [type]);

  useEffect(() => {
    if (inline) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (DEMO_MODE ? dialog.current?.querySelector<HTMLElement>(".modal-close") : dialog.current?.querySelector<HTMLElement>("input:not(.honeypot)"))?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key !== "Tab" || !dialog.current) return;
      const items = [...dialog.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')].filter(el => el.getClientRects().length > 0);
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keys);
    return () => { document.removeEventListener("keydown", keys); document.body.style.overflow = overflow; previous?.focus(); };
  }, [onClose, inline]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (DEMO_MODE) { setError(DEMO_MESSAGE); return; }
    setBusy(true); setError("");
    const form = event.currentTarget;
    try {
      const candidate = type === "candidate";
      const payload = withArrival(new FormData(form));
      payload.set("kind", candidate ? "candidate" : "company");
      const response = await fetch("/api/portal/registration", { method: "POST", body: payload });
      const data = await response.json().catch(() => ({})) as { error?: string; title?: string; message?: string };
      if (!response.ok) {
        // A call time taken while the form was open: fetch the times again.
        if (response.status === 409 && !candidate) fetch("/api/employer-enquiries").then(r => r.json() as Promise<{ slots?: string[] }>).then(d => setSlots(d.slots ?? [])).catch(() => undefined);
        throw new Error(data.error || "We couldn't send your request. Please try again.");
      }
      setDone({ title: data.title ?? "Thank you.", message: data.message ?? "" });
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  }

  const candidate = type === "candidate";
  const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" });
  const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
  const days = [...new Map(slots.map(s => [dayOf(s), dayLabel(s)])).entries()];

  // Closed only by the close button or Escape: a stray tap outside must not throw away what was typed.
  return <div className={inline ? "enquiry-inline" : "modal-backdrop"}>
    <section ref={dialog} className={inline ? "enquiry-panel" : "modal"} role={inline ? "region" : "dialog"} aria-modal={inline ? undefined : true} aria-labelledby={titleId} aria-describedby={introId}>
      {!inline && <button className="modal-close" onClick={onClose} aria-label="Close"><Icon name="close" /></button>}
      <span className="eyebrow">{candidate ? "FOR JOB SEEKERS" : "FOR EMPLOYERS"}</span>
      <h2 id={titleId}>{candidate ? "Create your candidate account" : "Create your business account"}</h2>
      {done ? <><p id={introId} className="visually-hidden">{done.title}</p><FormConfirmation title={done.title} message={done.message} onClose={inline ? undefined : onClose} /><p><a className="text-link" href={`/portal/sign-in?kind=${candidate ? "candidate" : "company"}`}>Go to sign in or resend verification email</a></p></> : <>
      <p id={introId}>{DEMO_MODE ? "Preview the information we would request when recruitment intake opens." : candidate ? "Create your free login, upload your CV and choose your consent preferences in this form. Verify your email to access your candidate dashboard. Registration does not guarantee contact, an interview or a job." : "Create your business login and share your IT or non-IT hiring needs in this form. You can request a meeting too. Verify your email to access your dashboard; hiring access is subject to company review."}</p>
      {/* method="post" so that a press before the script has loaded never puts the details in the address bar. */}
      <form method="post" action="/api/portal/registration" encType="multipart/form-data" onSubmit={submit}>
        <DemoFormNotice />
        <fieldset className="demo-fields" disabled={DEMO_MODE}>
          {candidate ? <CandidateFields /> : <div className="public-form">
            <input name="website" className="honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            <div className="form-section-heading"><Icon name="business" /><div><h3>Company and contact</h3><p>Who should we speak to about this role?</p></div></div>
            <div className="form-grid">
              <label>Your name<input name="contactName" required maxLength={120} autoComplete="name" /></label>
              <label>Company<input name="company" required maxLength={160} autoComplete="organization" /></label>
              <label className="full-field">Registered legal name<input name="legalName" required maxLength={160} autoComplete="organization" /></label>
              <label>Work email<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
              <label>Phone<input name="phone" type="tel" required maxLength={30} autoComplete="tel" placeholder="+91" /><span className="label-note">Include a country code for WhatsApp messages</span></label>
            </div>
            <div className="form-section-heading"><Icon name="work_outline" /><div><h3>The role</h3><p>A few lines are enough to get started</p></div></div>
            <div className="form-grid"><label className="full-field">What are you looking for?<textarea name="details" required maxLength={1800} rows={4} placeholder="For example: a software developer or an accounts executive, starting next month." /></label></div>
            <div className="form-section-heading"><Icon name="event" /><div><h3>Request a call</h3><p>Optional request; times shown in India time</p></div></div>
              <fieldset className="call-picker"><legend>Choose a time <span className="label-note">Subject to availability and confirmation</span></legend>
                {days.length === 0 ? <p className="label-note">No call times are showing right now. You can still send your enquiry for review. Response times vary.</p> : <div className="form-grid">
                  <label>Day<select value={day} onChange={e => setDay(e.target.value)} aria-label="Day for the call"><option value="">No call for now: contact me instead</option>{days.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label>Time<select name="meetingAt" key={day} defaultValue="" disabled={!day} required={!!day} aria-label="Time for the call"><option value="" disabled>{day ? "Choose a time" : "Choose a day first"}</option>{slots.filter(s => dayOf(s) === day).map(s => <option key={s} value={s}>{timeLabel(s)}</option>)}</select></label>
                </div>}
              </fieldset>
            <div className="form-section-heading"><Icon name="verified_user" /><div><h3>Consent</h3><p>Confirm how we may contact you</p></div></div>
            <div className="form-consents">
              <label className="consent full-field"><input name="consent" type="checkbox" value="yes" required /> <span>Jobboard300 may contact me about this enquiry. <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy notice</a>.</span></label>
              <label className="consent full-field"><input name="terms" type="checkbox" value="yes" required /> <span>I am authorised to act for this company, and I have read and agree to the <a href="/terms/employers" target="_blank" rel="noopener noreferrer">terms for employers</a>.</span></label>
              <label className="consent full-field"><input name="whatsappConsent" type="checkbox" value="yes" /> <span>You may also message me on WhatsApp at this number. <span className="label-note">(optional)</span></span></label>
            </div>
          </div>}
          <div className="public-form">
            <div className="form-section-heading"><Icon name="lock" /><div><h3>Your login</h3><p>Use this email and password to sign in after verification.</p></div></div>
            <div className="form-grid"><label className="full-field">Create a password<input name="password" type="password" required minLength={12} maxLength={200} autoComplete="new-password" /><span className="label-note">At least 12 characters. Use a unique password.</span></label></div>
          </div>
          <input type="hidden" name="kind" value={candidate ? "candidate" : "company"} />
          {!DEMO_MODE && <button className="button" disabled={busy}>{busy ? "Sending…" : candidate ? "Create account and upload CV" : "Create account and send enquiry"} <Icon name="north_east" /></button>}
        </fieldset>
        {error && <p className="form-message form-error" role="alert">{error}</p>}
      </form>
      <p className="privacy-inline">Already registered? <a href={`/portal/sign-in?kind=${candidate ? "candidate" : "company"}`}>Sign in</a> or <a href="/portal/forgot">recover account access</a>.</p>
      <p className="privacy-inline">{DEMO_MODE ? "Live intake opens after the company completes its launch checks." : candidate ? <>Registering is free, and payment never affects who is shortlisted. After email verification, manage your CV and consent in your dashboard.</> : <>Nothing is charged for an enquiry, a call or a shortlist. Your enquiry is linked to your business account for review. Meeting requests need confirmation; response times vary.</>}</p>
      </>}
    </section>
  </div>;
}
