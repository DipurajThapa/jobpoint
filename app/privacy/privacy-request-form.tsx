"use client";

import { DEMO_MODE, DEMO_MESSAGE } from "@/lib/demo";
import DemoFormNotice from "@/components/demo-form-notice";
import { useState } from "react";
import type { FormEvent } from "react";

export default function PrivacyRequestForm() {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (DEMO_MODE) { setMessage(DEMO_MESSAGE); return; } setBusy(true); setMessage("");
    const form = event.currentTarget;
    try {
      const response = await fetch("/api/privacy-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage(result.message); form.reset();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again later."); }
    finally { setBusy(false); }
  }
  return <form className="apply-form privacy-request-form" onSubmit={submit}><DemoFormNotice /><fieldset className="demo-fields" disabled={DEMO_MODE}>
    <input name="website" className="honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" />
    <label>Request type<select name="requestType" required><option value="access">Access my information</option><option value="correction">Correct my information</option><option value="deletion">Delete my information</option><option value="withdrawal">Withdraw consent</option><option value="grievance">Raise a privacy concern</option></select></label>
    <label>Your name<input name="requesterName" required maxLength={120} autoComplete="name" /></label>
    <label>Email used with Job Point<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
    <label>Details (optional)<textarea name="details" rows={3} maxLength={1200} placeholder="Tell us what you would like corrected or reviewed." /></label>
    {!DEMO_MODE && <button className="button" disabled={busy}>{busy ? "Submitting…" : "Send privacy request"}</button>}</fieldset>
    {message && <p role="status" className="form-message">{message}</p>}
  </form>;
}
