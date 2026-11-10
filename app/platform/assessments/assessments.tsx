"use client";
// Assessments tool: question banks (create, add questions one at a time or by
// upload, withdraw, set live) for administrators and invigilators, and Fast Track
// price and payment confirmation for administrators.
import { useCallback, useEffect, useState, type FormEvent } from "react";

type Row = Record<string, string | number | null>;
type Question = { id: string; level: number; topic: string; stem: string; options: string[]; answer_index: number; explanation: string; active: number };
type View = { banks: Row[]; clients: Row[]; canEdit: boolean; admin: boolean; test: { questions: number; minutes: number }; fastTrack: { offer: { priceInr: number | null; payNote: string }; orders: Row[] } | null };

async function api<T>(action: string, body?: object, query = ""): Promise<T> {
  const r = await fetch(`/api/platform/assessments/${action}${query}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const d = await r.json().catch(() => ({})) as T & { error?: string };
  if (!r.ok) throw new Error(d.error ?? "The request failed.");
  return d;
}
const KIND: Record<string, string> = { technical: "Technical (Fast Track candidates choose it)", aptitude: "Aptitude and soft skills (sent when the client opts in)", client: "Client test (the client's own questions)" };

export default function Assessments() {
  const [v, setV] = useState<View | null>(null), [notice, setNotice] = useState(""), [errors, setErrors] = useState<string[]>([]), [open, setOpen] = useState<string | null>(null), [kind, setKind] = useState("technical");
  const load = useCallback(() => api<View>("banks").then(setV).catch(e => setNotice(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const act = async (action: string, body: object) => { try { const d = await api<{ message: string; errors?: string[] }>(action, body); setNotice(d.message); setErrors(d.errors ?? []); await load(); return true; } catch (e) { setNotice((e as Error).message); setErrors([]); return false; } };
  if (!v) return <p className="pj-muted">{notice || "Loading…"}</p>;
  return <div className="pj-main" style={{ padding: 0 }}>
    {notice && <p className="pj-notice" role="status">{notice}</p>}
    {errors.length > 0 && <ul className="pj-notice bad">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
    <p className="pj-muted">Each test asks {v.test.questions} questions in {v.test.minutes} minutes, starting at level 5 of 10 and moving up or down with each answer. Aim for 10 to 20 questions at every level. Answer options are shuffled for every candidate.</p>

    <section className="pj-card"><div className="pj-row" style={{ justifyContent: "space-between" }}><h2>Question banks</h2>{v.admin && !v.banks.some(b => b.is_sample) && <button className="pj-btn quiet" onClick={() => act("sample-load", {})}>Load sample banks</button>}</div>
      {v.banks.length === 0 ? <p className="pj-muted">No question banks yet.</p> : <div className="pj-list">{v.banks.map(b => <article className="pj-item" key={String(b.id)}>
        <div><b>{b.title}</b> <span className="pj-pill">{String(b.kind)}</span> <span className="pj-pill">{String(b.status)}</span>{b.is_sample ? <span className="pj-pill">Sample</span> : null}
          <p className="pj-muted">{b.questions} active question(s) across {b.levels} of 10 levels{b.skill_id ? ` · skill: ${b.skill_id}` : ""}{b.company ? ` · ${b.company}` : ""} · {b.completed} test(s) taken</p>
          {open === b.id && <Bank bank={b} canEdit={v.canEdit} act={act} />}
        </div>
        <div className="pj-row">{v.canEdit && <select value={String(b.status)} aria-label="Status" onChange={e => act("bank-status", { bankId: b.id, status: e.target.value })}><option value="draft">Draft</option><option value="active">Live</option><option value="retired">Retired</option></select>}<button className="pj-btn quiet" onClick={() => setOpen(open === b.id ? null : String(b.id))}>{open === b.id ? "Close" : "Open"}</button></div>
      </article>)}</div>}
      {v.canEdit && <form className="pj-form" onSubmit={async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const form = e.currentTarget, f = Object.fromEntries(new FormData(form).entries()); if (await act("bank-create", f)) form.reset(); }}>
        <h3 className="full">New question bank</h3>
        <label>Kind<select name="kind" value={kind} onChange={e => setKind(e.target.value)}>{Object.entries(KIND).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label>
        <label>Name<input name="title" required minLength={3} maxLength={160} placeholder="e.g. Java for backend developers" /></label>
        {kind === "technical" && <label>Skill it certifies <span className="pj-muted">Used to suggest the test to candidates with this skill on their CV.</span><input name="skillId" maxLength={60} placeholder="e.g. java" /></label>}
        {kind === "client" && <label>Client<select name="companyId" required defaultValue=""><option value="" disabled>Choose…</option>{v.clients.map(c => <option key={String(c.id)} value={String(c.id)}>{c.display_name}</option>)}</select></label>}
        <div className="full"><button className="pj-btn">Create bank</button></div>
      </form>}
    </section>

    {v.fastTrack && <section className="pj-card"><h2>Fast Track</h2>
      <p className="pj-muted">Fast Track is the paid candidate package. It includes the technical tests, so the tests have no separate price. A candidate is marked Fast Track only when you confirm their payment here.</p>
      <form className="pj-form" onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = new FormData(e.currentTarget); act("fast-track-settings", { priceInr: Number(f.get("priceInr")), payNote: f.get("payNote") }); }}>
        <label>Price (₹)<input name="priceInr" type="number" min={1} required defaultValue={v.fastTrack.offer.priceInr ?? ""} /></label>
        <label className="full">How to pay <span className="pj-muted">Shown to the candidate with their reference: UPI ID or bank details.</span><textarea name="payNote" required minLength={10} maxLength={600} rows={2} defaultValue={v.fastTrack.offer.payNote} /></label>
        <div className="full"><button className="pj-btn quiet">Save</button></div>
      </form>
      <h3>Payments</h3>
      {v.fastTrack.orders.length === 0 ? <p className="pj-muted">No Fast Track requests yet.</p> : <table className="pj-table"><thead><tr><th>Candidate</th><th>Reference</th><th>Amount</th><th>Requested</th><th>Status</th></tr></thead><tbody>{v.fastTrack.orders.map(o => <tr key={String(o.id)}>
        <td>{o.display_name}</td><td>{o.reference}</td><td>₹{Number(o.amount_inr).toLocaleString("en-IN")}</td><td>{String(o.created_at).slice(0, 10)}</td>
        <td>{o.status === "awaiting_payment" ? <span className="pj-row"><button className="pj-btn" onClick={() => { const note = window.prompt("How was the payment received? (UPI or bank reference)"); if (note) act("order-decide", { orderId: o.id, paid: true, note }); }}>Payment received</button><button className="pj-link" onClick={() => window.confirm("Cancel this request?") && act("order-decide", { orderId: o.id, paid: false, note: "" })}>Cancel</button></span> : `${String(o.status)}${o.paid_at ? ` on ${String(o.paid_at).slice(0, 10)}` : ""}${o.note ? ` · ${o.note}` : ""}`}</td>
      </tr>)}</tbody></table>}
    </section>}
  </div>;
}

function Bank({ bank, canEdit, act }: { bank: Row; canEdit: boolean; act: (action: string, body: object) => Promise<boolean> }) {
  const [qs, setQs] = useState<Question[] | null>(null), [level, setLevel] = useState(0);
  const load = useCallback(() => api<{ questions: Question[] }>("questions", undefined, `?bank=${bank.id}`).then(d => setQs(d.questions)).catch(() => setQs([])), [bank.id]);
  useEffect(() => { load(); }, [load, bank.questions]);
  const counts = Array.from({ length: 10 }, (_, i) => (qs ?? []).filter(q => q.level === i + 1 && q.active).length);
  const shown = (qs ?? []).filter(q => !level || q.level === level);
  return <div>
    <table className="pj-table"><thead><tr><th>Level</th>{counts.map((_, i) => <th key={i}>{i + 1}</th>)}</tr></thead><tbody><tr><td>Active questions</td>{counts.map((n, i) => <td key={i} style={{ color: n < 10 ? "#b45309" : undefined }}>{n}</td>)}</tr></tbody></table>
    {canEdit && <>
      <form className="pj-form" onSubmit={async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const form = e.currentTarget, f = new FormData(form); const options = [1, 2, 3, 4, 5, 6].map(i => String(f.get(`o${i}`) ?? "").trim()).filter(Boolean);
        if (await act("question-add", { bankId: bank.id, level: Number(f.get("level")), topic: f.get("topic"), stem: f.get("stem"), options, answerIndex: Number(f.get("answer")) - 1, explanation: f.get("explanation") })) { form.reset(); load(); } }}>
        <h3 className="full">Add a question</h3>
        <label>Level (1 easiest, 10 hardest)<input name="level" type="number" min={1} max={10} required /></label><label>Topic <span className="pj-muted">Used to tell candidates what to prepare.</span><input name="topic" maxLength={80} required /></label>
        <label className="full">Question<textarea name="stem" required minLength={10} maxLength={1000} rows={2} /></label>
        {[1, 2, 3, 4].map(i => <label key={i}>Option {i}<input name={`o${i}`} maxLength={300} required={i <= 3} /></label>)}
        <label>Correct option number<input name="answer" type="number" min={1} max={4} required /></label><label>Explanation (staff only)<input name="explanation" maxLength={600} /></label>
        <div className="full"><button className="pj-btn quiet">Add question</button></div>
      </form>
      <form className="pj-form" onSubmit={async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const form = e.currentTarget; if (await act("question-upload", { bankId: bank.id, text: new FormData(form).get("text") })) { form.reset(); load(); } }}>
        <h3 className="full">Upload questions</h3>
        <label className="full">Paste rows from a spreadsheet or a CSV file <span className="pj-muted">One question per row: level, topic, question, option 1, option 2, option 3, option 4, answer, explanation. Write the answer as a letter (A for the first option) or as the exact text of the correct option. Do not use &ldquo;all of the above&rdquo;: options are shuffled.</span><textarea name="text" required rows={5} placeholder={"5,Collections,Which Java collection keeps insertion order and allows duplicates?,ArrayList,HashSet,TreeSet,HashMap,A,Lists keep order"} /></label>
        <div className="full"><button className="pj-btn quiet">Check and add</button></div>
      </form>
    </>}
    <div className="pj-row"><label>Show level <select value={level} onChange={e => setLevel(Number(e.target.value))}><option value={0}>All</option>{counts.map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label><span className="pj-muted">{shown.length} question(s)</span></div>
    {shown.slice(0, 100).map(q => <div className="pj-note" key={q.id} style={{ opacity: q.active ? 1 : 0.55 }}>
      <b>L{q.level}</b> <span className="pj-muted">{q.topic}</span> {q.stem}
      <ol type="A">{q.options.map((o, i) => <li key={i} style={{ fontWeight: i === q.answer_index ? 700 : 400 }}>{o}{i === q.answer_index ? " (correct)" : ""}</li>)}</ol>
      {q.explanation && <p className="pj-muted">{q.explanation}</p>}
      {canEdit && <button className="pj-link" onClick={() => act("question-active", { questionId: q.id, active: !q.active }).then(load)}>{q.active ? "Withdraw" : "Restore"}</button>}
    </div>)}
  </div>;
}
