"use client";
// One question at a time. The server chooses each question, holds the answers and
// keeps the clock; this component only shows what it is given.
import { useCallback, useEffect, useState } from "react";

export type Step = { id: string; title: string; total: number; minutes: number; state: "ready" | "question" | "done" | "expired"; number?: number; deadline?: string | null; question?: { stem: string; options: string[] }; level?: number | null; band?: string | null; weakTopics?: string[] | null };
type Call = (action: "load" | "start" | "answer", choice?: number | null) => Promise<Step>;

export default function TestRunner({ call, onDone }: { call: Call; onDone?: () => void }) {
  const [step, setStep] = useState<Step | null>(null), [error, setError] = useState(""), [pick, setPick] = useState<number | null>(null), [busy, setBusy] = useState(false), [left, setLeft] = useState("");
  const run = useCallback(async (action: "load" | "start" | "answer", choice?: number | null) => {
    setBusy(true); setError("");
    try { const s = await call(action, choice); setStep(s); setPick(null); if (s.state === "done") onDone?.(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }, [call, onDone]);
  useEffect(() => { call("load").then(s => { setStep(s); if (s.state === "done") onDone?.(); }).catch(e => setError((e as Error).message)); }, [call, onDone]);
  const deadline = step?.state === "question" ? step.deadline : null;
  useEffect(() => {
    if (!deadline) return;
    const tick = () => { const ms = Date.parse(deadline) - Date.now(); if (ms <= 0) { run("load"); return; } setLeft(`${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`); };
    tick(); const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer);
  }, [deadline, run]);

  if (!step) return <p className="pj-muted">{error || "Loading…"}</p>;
  return <section className="pj-card" aria-live="polite">
    <h2>{step.title}</h2>
    {error && <p className="pj-notice bad" role="alert">{error}</p>}
    {step.state === "ready" && <>
      <p>{step.total} multiple-choice questions in {step.minutes} minutes. The questions get harder when you answer correctly and easier when you do not, so expect some you cannot answer.</p>
      <ul><li>The clock starts when you press Start and does not pause.</li><li>You cannot go back to an earlier question.</li><li>Work alone, without help from other people or tools.</li></ul>
      <button className="pj-btn" disabled={busy} onClick={() => run("start")}>Start the test</button>
    </>}
    {step.state === "question" && step.question && <>
      <p className="pj-muted">Question {step.number} of {step.total} · Time left {left}</p>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend style={{ fontWeight: 600, marginBottom: 12 }}>{step.question.stem}</legend>
        {step.question.options.map((o, i) => <label key={`${step.number}-${i}`} className="pj-row" style={{ alignItems: "flex-start", marginBottom: 8 }}><input type="radio" name="choice" checked={pick === i} onChange={() => setPick(i)} /> <span>{o}</span></label>)}
      </fieldset>
      <div className="pj-row"><button className="pj-btn" disabled={busy || pick === null} onClick={() => run("answer", pick)}>Next</button><button className="pj-btn quiet" disabled={busy} onClick={() => run("answer", null)}>Skip</button></div>
    </>}
    {step.state === "done" && <>
      <p>You have finished. {step.level ? <>Your level on this test is <b>{step.band}</b> (level {step.level} of 10).</> : "Your result is recorded."}</p>
      {step.weakTopics && (step.weakTopics.length ? <p>Topics to prepare: <b>{step.weakTopics.join(", ")}</b>.</p> : <p>No weak topics stood out in this sitting.</p>)}
      
    </>}
    {step.state === "expired" && <p className="pj-notice bad">This test is no longer open. Ask your recruiter if you need a new link.</p>}
  </section>;
}
