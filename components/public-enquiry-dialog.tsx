"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { DEMO_MODE, DEMO_MESSAGE } from "@/lib/demo";
import CandidateFields from "./candidate-fields";
import DemoFormNotice from "./demo-form-notice";
import FormConfirmation from "./form-confirmation";
import Icon from "./icon";

type Props = { type: "candidate" | "employer"; onClose: () => void };

export default function PublicEnquiryDialog({ type, onClose }: Props) {
  const dialog = useRef<HTMLElement>(null);
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
  }, [onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (DEMO_MODE) { setError(DEMO_MESSAGE); return; }
    setBusy(true); setError("");
    const form = event.currentTarget;
    try {
      const candidate = type === "candidate";
      const response = await fetch(candidate ? "/api/applications" : "/api/employer-enquiries", {
        method: "POST",
        body: candidate ? new FormData(form) : JSON.stringify(Object.fromEntries(new FormData(form).entries())),
        headers: candidate ? undefined : { "content-type": "application/json" },
      });
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

  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-intro">
      <button className="modal-close" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
      <span className="eyebrow">{candidate ? "FOR JOB SEEKERS" : "FOR EMPLOYERS"}</span>
      <h2 id="dialog-title">{candidate ? "Upload your CV." : "Tell us what you are looking for."}</h2>
      {done ? <><p id="dialog-intro" className="visually-hidden">{done.title}</p><FormConfirmation title={done.title} message={done.message} onClose={onClose} /></> : <>
      <p id="dialog-intro">{DEMO_MODE ? "Preview the information we would request when recruitment intake opens." : candidate ? "It takes about a minute and it is free. A recruiter reviews every CV and contacts you when a role fits." : "A short message is enough. A consultant will call you to understand the role; the job description comes later."}</p>
      {/* method="post" so that a press before the script has loaded never puts the details in the address bar. */}
      <form method="post" action={candidate ? "/api/applications" : "/api/employer-enquiries"} encType={candidate ? "multipart/form-data" : undefined} onSubmit={submit}>
        <DemoFormNotice />
        <fieldset className="demo-fields" disabled={DEMO_MODE}>
          {candidate ? <CandidateFields /> : <>
            <input name="website" className="honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            <div className="form-grid">
              <label>Your name<input name="contactName" required maxLength={120} autoComplete="name" /></label>
              <label>Company<input name="company" required maxLength={160} autoComplete="organization" /></label>
              <label>Work email<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
              <label>Phone <span className="label-note">with WhatsApp, if you use it</span><input name="phone" type="tel" required maxLength={30} autoComplete="tel" placeholder="+91" /></label>
              <label className="full-field">What are you looking for?<textarea name="details" required maxLength={1800} rows={4} placeholder="For example: two accounts executives for our Durgapur office, to start next month." /></label>
              <fieldset className="call-picker full-field"><legend>Book a call with a consultant <span className="label-note">optional · 30 minutes · India time</span></legend>
                {days.length === 0 ? <p className="label-note">No times are showing right now. Send the enquiry and a consultant will contact you within one working day.</p> : <div className="form-grid">
                  <label>Day<select value={day} onChange={e => setDay(e.target.value)} aria-label="Day for the call"><option value="">No call for now</option>{days.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label>Time<select name="meetingAt" key={day} defaultValue="" disabled={!day} required={!!day} aria-label="Time for the call"><option value="" disabled>{day ? "Choose a time" : "Choose a day first"}</option>{slots.filter(s => dayOf(s) === day).map(s => <option key={s} value={s}>{timeLabel(s)}</option>)}</select></label>
                </div>}
              </fieldset>
              <label className="consent full-field"><input name="consent" type="checkbox" value="yes" required /> <span>I am authorised to enquire for this company. Jobboard300 may contact me about this enquiry, as set out in the <a href="/privacy" target="_blank" rel="noopener noreferrer">privacy notice</a> and the <a href="/terms/employers" target="_blank" rel="noopener noreferrer">terms for employers</a>.</span></label>
              <label className="consent full-field"><input name="whatsappConsent" type="checkbox" value="yes" /> <span>You may also message me on WhatsApp at this number. <span className="label-note">Optional</span></span></label>
            </div>
          </>}
          {!DEMO_MODE && <button className="button" disabled={busy}>{busy ? "Sending…" : candidate ? "Upload my CV" : "Send enquiry"} <Icon name="north_east" /></button>}
        </fieldset>
        {error && <p className="form-message form-error" role="alert">{error}</p>}
      </form>
      <p className="privacy-inline">{DEMO_MODE ? "Live intake opens after the company completes its launch checks." : candidate ? <>Registering is free. We confirm by email. To correct your details or replace your CV later, use the <a href="/privacy#privacy-request">privacy request form</a>.</> : <>Nothing is charged for an enquiry, a call or a shortlist. We confirm by email to your work address.</>}</p>
      </>}
    </section>
  </div>;
}
