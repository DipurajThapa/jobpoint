"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { DEMO_MODE, DEMO_MESSAGE } from "@/lib/demo";
import CandidateFields from "./candidate-fields";
import DemoFormNotice from "./demo-form-notice";
import Icon from "./icon";

type Props = { type: "candidate" | "employer"; onClose: () => void };

export default function PublicEnquiryDialog({ type, onClose }: Props) {
  const dialog = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

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
    if (DEMO_MODE) { setMessage(DEMO_MESSAGE); return; }
    setBusy(true); setMessage("");
    const form = event.currentTarget;
    try {
      const candidate = type === "candidate";
      const response = await fetch(candidate ? "/api/applications" : "/api/employer-enquiries", {
        method: "POST",
        body: candidate ? new FormData(form) : JSON.stringify(Object.fromEntries(new FormData(form).entries())),
        headers: candidate ? undefined : { "content-type": "application/json" },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "We couldn't send your request. Please try again.");
      setMessage(data.message); form.reset();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  }

  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-intro">
      <button className="modal-close" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
      <span className="eyebrow">{type === "candidate" ? "FOR CANDIDATES" : "FOR EMPLOYERS"}</span>
      <h2 id="dialog-title">{type === "candidate" ? "Share your experience." : "Tell us about the role."}</h2>
      <p id="dialog-intro">{DEMO_MODE ? "Preview the information we would request when recruitment intake opens." : type === "candidate" ? "We’ll review your information for relevant openings and contact you about suitable opportunities." : "Give us a few details about your hiring requirement. A consultant will follow up."}</p>
      <form onSubmit={submit}>
        <DemoFormNotice />
        <fieldset className="demo-fields" disabled={DEMO_MODE}>
          {type === "candidate" ? <CandidateFields /> : <>
            <input name="website" className="honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            <div className="form-grid">
              <label>Your name<input name="contactName" required maxLength={120} /></label>
              <label>Company<input name="company" required maxLength={160} /></label>
              <label>Work email<input name="email" type="email" required maxLength={254} /></label>
              <label>Phone<input name="phone" type="tel" required maxLength={30} /></label>
              <label>Position to fill<input name="roleTitle" required maxLength={160} /></label>
              <label>Hiring location<input name="location" required maxLength={120} /></label>
              <label>Number of hires<input name="headcount" type="number" min="1" max="500" defaultValue="1" required /></label>
              <label className="full-field">Role details<textarea name="details" required maxLength={1800} rows={3} placeholder="Key skills, experience and expected start date" /></label>
              <label className="consent full-field"><input name="consent" type="checkbox" value="yes" required /> I agree that Job Point Consultancy may contact me about this hiring requirement.</label>
            </div>
          </>}
          {!DEMO_MODE && <button className="button" disabled={busy}>{busy ? "Sending…" : type === "candidate" ? "Submit my details" : "Send hiring enquiry"} <Icon name="north_east" /></button>}
        </fieldset>
        {message && <p className="form-message" role="status">{message}</p>}
      </form>
      <p className="privacy-inline">{DEMO_MODE ? "Live intake opens after the company completes its launch checks." : <>A consultant follows up using your contact details. To correct a profile or request a CV replacement, use the <a href="/privacy#privacy-request">privacy request form</a>. Read our <a href="/terms">terms of use</a>.</>}</p>
    </section>
  </div>;
}
