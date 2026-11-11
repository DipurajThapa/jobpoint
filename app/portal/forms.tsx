"use client";
import { useState, type FormEvent } from "react";
import { CONSENT_NOTICE } from "@/lib/portal/notice";

export async function post<T = Record<string, unknown>>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Something went wrong. Try again.");
  return data;
}

// Every form here is method="post": if the button is pressed before the page's script has loaded, the
// browser must not put what was typed (a password) into the address bar. The script then takes over.
function useForm() {
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [link, setLink] = useState("");
  return { error, setError, notice, setNotice, busy, setBusy, link, setLink };
}

export function SignIn({ next, kind = "candidate" }: { next: string; kind?: "candidate" | "company" }) {
  const f = useForm();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const d = new FormData(e.currentTarget); f.setBusy(true); f.setError("");
    try { const r = await post<{ next: string }>("/api/portal/auth/sign-in", { email: d.get("email"), password: d.get("password") }); window.location.assign((next === r.next || next.startsWith(`${r.next}/`) || next.startsWith(`${r.next}?`)) ? next : r.next); }
    catch (err) { f.setError((err as Error).message); f.setBusy(false); }
  }
  return <form onSubmit={submit} method="post" className="pj-list">
    {f.error && <p className="pj-notice bad" role="alert">{f.error}</p>}
    <label>{kind === "company" ? "Work email" : "Email"}<input name="email" type="email" required autoComplete="username" /></label>
    <label>Password<input name="password" type="password" required autoComplete="current-password" /></label>
    <button className="wp-btn" disabled={f.busy}>{f.busy ? "Signing in…" : kind === "company" ? "Sign in to your hiring account" : "Sign in to your candidate account"}</button>
    <button type="button" className="text-link" disabled={f.busy} onClick={async e => {
      const form = e.currentTarget.form;
      const email = form?.querySelector<HTMLInputElement>('input[name="email"]');
      if (!email?.reportValidity()) return;
      f.setBusy(true); f.setError(""); f.setNotice("");
      try { f.setNotice((await post<{ message: string }>("/api/portal/auth/resend-verification", { email: email.value })).message); }
      catch (error) { f.setError((error as Error).message); } finally { f.setBusy(false); }
    }}>Resend verification email</button>
    {f.notice && <p className="pj-notice" role="status">{f.notice}</p>}
    <p className="pj-muted"><a href={`/portal/register?kind=${kind}`}>Sign up</a> · <a href="/portal/forgot">Forgot password?</a></p>
  </form>;
}

export function Verify({ token }: { token: string }) {
  const f = useForm();
  async function go() { f.setBusy(true); try { const result = await post<{ message: string; next: string }>("/api/portal/auth/verify", { token }); f.setNotice(result.message); f.setLink(result.next); } catch (err) { f.setError((err as Error).message); } finally { f.setBusy(false); } }
  return <div className="pj-list">
    {f.error && <p className="pj-notice bad">{f.error}</p>}
    {f.notice ? <><p className="pj-notice good">{f.notice}</p><a className="wp-btn" href={f.link || "/portal/sign-in"}>Sign in</a></> : <button className="wp-btn" onClick={go} disabled={f.busy}>Verify my email</button>}
  </div>;
}

export function Forgot() {
  const f = useForm();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); f.setBusy(true);
    try { const r = await post<{ message: string; devLink?: string }>("/api/portal/auth/reset-request", { email: new FormData(e.currentTarget).get("email") }); f.setNotice(r.message); f.setLink(r.devLink ?? ""); }
    catch (err) { f.setError((err as Error).message); } finally { f.setBusy(false); }
  }
  return <form onSubmit={submit} method="post" className="pj-list">
    {f.error && <p className="pj-notice bad">{f.error}</p>}{f.notice && <p className="pj-notice good">{f.notice}</p>}{f.link && <a href={f.link}>Local development: reset link</a>}
    <label>Email<input name="email" type="email" required /></label><button className="wp-btn" disabled={f.busy}>Send reset link</button>
    <p className="pj-muted">Remembered it? <a href="/portal/sign-in">Back to sign in</a></p>
  </form>;
}

export function Reset({ token }: { token: string }) {
  const f = useForm();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const d = new FormData(e.currentTarget);
    if (d.get("password") !== d.get("confirm")) { f.setError("The two passwords do not match."); return; }
    f.setBusy(true); try { f.setNotice((await post<{ message: string }>("/api/portal/auth/reset", { token, password: d.get("password") })).message); } catch (err) { f.setError((err as Error).message); } finally { f.setBusy(false); }
  }
  if (f.notice) return <div className="pj-list"><p className="pj-notice good">{f.notice}</p><a className="wp-btn" href={f.link || "/portal/sign-in"}>Sign in</a></div>;
  return <form onSubmit={submit} method="post" className="pj-list">
    {f.error && <p className="pj-notice bad">{f.error}</p>}
    <label>New password<input name="password" type="password" minLength={12} required autoComplete="new-password" /></label>
    <label>Repeat password<input name="confirm" type="password" minLength={12} required autoComplete="new-password" /></label>
    <button className="wp-btn" disabled={f.busy}>Change password</button>
  </form>;
}

export const NOTICE = CONSENT_NOTICE;

/** Invited client users (added by Jobboard300 or their company owner) set their first password. */
export function Accept({ token }: { token: string }) {
  const f = useForm();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const d = new FormData(e.currentTarget);
    if (d.get("password") !== d.get("confirm")) { f.setError("The two passwords do not match."); return; }
    f.setBusy(true); try { f.setNotice((await post<{ message: string }>("/api/portal/auth/accept", { token, password: d.get("password") })).message); } catch (err) { f.setError((err as Error).message); } finally { f.setBusy(false); }
  }
  if (f.notice) return <div className="pj-list"><p className="pj-notice good">{f.notice}</p><a className="wp-btn" href={f.link || "/portal/sign-in"}>Sign in</a></div>;
  return <form onSubmit={submit} method="post" className="pj-list">
    <p className="pj-muted">Choose a password of at least 12 characters. You will use it with your email address to sign in.</p>
    {f.error && <p className="pj-notice bad">{f.error}</p>}
    <label>Password<input name="password" type="password" minLength={12} required autoComplete="new-password" /></label>
    <label>Repeat password<input name="confirm" type="password" minLength={12} required autoComplete="new-password" /></label>
    <button className="wp-btn" disabled={f.busy}>Set password</button>
  </form>;
}
