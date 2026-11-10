"use client";
// Pages opened from a one-time link sent to a candidate: an invited test, or the
// commitment they accept when an offer is made. No account is needed.
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import TestRunner, { type Step } from "./test-runner";

async function api<T>(action: string, token: string, body?: object): Promise<T> {
  const r = body ? await fetch(`/api/portal/public/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, ...body }) })
    : await fetch(`/api/portal/public/${action}?token=${encodeURIComponent(token)}`, { cache: "no-store" });
  const d = await r.json().catch(() => ({})) as T & { error?: string };
  if (!r.ok) throw new Error(d.error ?? "The request failed.");
  return d;
}

export default function PublicLinkPage({ kind, token }: { kind: "test" | "commitment"; token: string }) {
  const call = useCallback((action: "load" | "start" | "answer", choice?: number | null) => action === "load" ? api<Step>("test", token) : api<Step>(action === "start" ? "test-start" : "test-answer", token, { choice }), [token]);
  return <div className="pj-shell"><header className="pj-top"><Link href="/" aria-label="Jobboard300 home"><Image src="/images/jobboard300-logo.png" alt="Jobboard300" width={160} height={26} /></Link></header>
    <main className="pj-main">{kind === "test" ? <TestRunner call={call} /> : <Commitment token={token} />}</main></div>;
}

function Commitment({ token }: { token: string }) {
  const [c, setC] = useState<{ body: string; acceptedAt: string | null } | null>(null), [error, setError] = useState(""), [agree, setAgree] = useState(false);
  useEffect(() => { api<{ body: string; acceptedAt: string | null }>("commitment", token).then(setC).catch(e => setError(e.message)); }, [token]);
  if (!c) return <p className={error ? "pj-notice bad" : "pj-muted"}>{error || "Loading…"}</p>;
  return <section className="pj-card"><h2>Your commitment for this offer</h2>
    {c.body.split("\n").map((line, i) => <p key={i}>{line}</p>)}
    {c.acceptedAt ? <p className="pj-notice good">You accepted this on {new Date(c.acceptedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}. Thank you.</p> : <>
      {error && <p className="pj-notice bad" role="alert">{error}</p>}
      <label className="pj-row"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} /> <span>I have read this commitment and I accept it.</span></label>
      <button className="pj-btn" disabled={!agree} onClick={() => api<{ acceptedAt: string }>("commitment-accept", token, { agree: true }).then(r => setC({ ...c, acceptedAt: r.acceptedAt })).catch(e => setError(e.message))}>Accept</button>
    </>}
  </section>;
}
