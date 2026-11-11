"use client";

import { DEMO_MODE, DEMO_MESSAGE } from "@/lib/demo";
import DemoFormNotice from "@/components/demo-form-notice";
import CandidateFields from "@/components/candidate-fields";
import FormConfirmation from "@/components/form-confirmation";
import { useState } from "react";
import { attributionFields } from "@/lib/attribution";
import type { FormEvent } from "react";

type Result = { error?: string; title?: string; message?: string };

export default function ApplicationForm({ jobId }: { jobId: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [done, setDone] = useState<{ title: string; message: string } | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (DEMO_MODE) { setError(DEMO_MESSAGE); return; }
    setBusy(true); setError("");
    try {
      const data0 = new FormData(e.currentTarget);
      for (const [name, value] of Object.entries(attributionFields())) if (value) data0.set(name, String(value));
      const response = await fetch("/api/applications", { method: "POST", body: data0 });
      const data = await response.json().catch(() => ({})) as Result;
      if (!response.ok) throw new Error(data.error || "We could not send your application. Please try again.");
      setDone({ title: data.title ?? "Thank you. Your CV is with us.", message: data.message ?? "" });
    } catch (err) { setError(err instanceof Error ? err.message : "Please try again."); }
    finally { setBusy(false); }
  }
  if (done) return <div className="apply-form"><FormConfirmation title={done.title} message={done.message} /></div>;
  // method="post" so that a press before the script has loaded never puts the details in the address bar.
  return <form className="apply-form" method="post" action="/api/applications" encType="multipart/form-data" onSubmit={submit}>
    <DemoFormNotice />
    <fieldset className="demo-fields" disabled={DEMO_MODE}>
      <CandidateFields jobId={jobId} />
      {!DEMO_MODE && <button className="button" disabled={busy}>{busy ? "Sending…" : "Apply for this role"}</button>}
    </fieldset>
    {error && <p className="form-message form-error" role="alert">{error}</p>}
    <p className="privacy-inline">{DEMO_MODE ? "This is a preview. Applications are currently disabled." : <>Applying is free. You get a reference number on screen. To correct your details or replace your CV later, use the <a href="/privacy#privacy-request">privacy request form</a>.</>}</p>
  </form>;
}
