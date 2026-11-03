"use client";
import { useEffect, useState, type FormEvent } from "react";

async function post(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong. Try again.");
  return data;
}

const safeNext = (value: string | null) => value && value.startsWith("/platform") && !value.startsWith("//") && !value.includes("\\") ? value : "/platform";

export function SignInForm({ next, signedOut }: { next: string | null; signedOut: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    // Remove anything Email Kit kept in this browser for the previous person.
    if (signedOut) try { Object.keys(localStorage).filter(k => k.startsWith("email-kit-")).forEach(k => localStorage.removeItem(k)); } catch { /* storage unavailable */ }
  }, [signedOut]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      await post("/api/platform/auth/sign-in", { email: form.get("email"), password: form.get("password") });
      window.location.assign(safeNext(next));
    } catch (e) { setError(e instanceof Error ? e.message : "Sign-in failed."); setBusy(false); }
  }
  return <form onSubmit={submit} noValidate>
    {signedOut && <p className="wp-notice good" role="status">You are signed out.</p>}
    {error && <p className="wp-notice bad" role="alert">{error}</p>}
    <label>Work email<input name="email" type="email" autoComplete="username" required maxLength={254} autoFocus /></label>
    <label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={200} /></label>
    <button className="wp-btn" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
  </form>;
}

export function SetPasswordForm({ token, invite, email }: { token: string; invite: boolean; email: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("confirm")) { setError("The two passwords do not match."); return; }
    setBusy(true); setError("");
    try {
      await post("/api/platform/auth/accept", { token, name: form.get("name"), password: form.get("password") });
      window.location.assign("/platform");
    } catch (e) { setError(e instanceof Error ? e.message : "The password was not saved."); setBusy(false); }
  }
  return <form onSubmit={submit} noValidate>
    {error && <p className="wp-notice bad" role="alert">{error}</p>}
    <label>Email<input value={email} readOnly autoComplete="username" /></label>
    {invite && <label>Your name<input name="name" required maxLength={120} autoComplete="name" /></label>}
    <label>New password<input name="password" type="password" required minLength={12} maxLength={200} autoComplete="new-password" /></label>
    <label>Repeat the password<input name="confirm" type="password" required minLength={12} maxLength={200} autoComplete="new-password" /></label>
    <p className="hint">At least 12 characters. A short sentence works well.</p>
    <button className="wp-btn" disabled={busy}>{busy ? "Saving…" : invite ? "Create my account" : "Set new password"}</button>
  </form>;
}

export function ChangePasswordForm() {
  const [notice, setNotice] = useState<{ text: string; good: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    if (form.get("next") !== form.get("confirm")) { setNotice({ text: "The two new passwords do not match.", good: false }); return; }
    setBusy(true);
    try {
      await post("/api/platform/auth/password", { current: form.get("current"), next: form.get("next") });
      element.reset();
      setNotice({ text: "Password changed. Other devices have been signed out.", good: true });
    } catch (e) { setNotice({ text: e instanceof Error ? e.message : "Not changed.", good: false }); }
    setBusy(false);
  }
  return <form onSubmit={submit} className="wp-form-grid" style={{ gridTemplateColumns: "1fr" }}>
    {notice && <p className={`wp-notice ${notice.good ? "good" : "bad"}`} role="status">{notice.text}</p>}
    <label>Current password<input name="current" type="password" required autoComplete="current-password" maxLength={200} /></label>
    <label>New password<input name="next" type="password" required minLength={12} maxLength={200} autoComplete="new-password" /></label>
    <label>Repeat the new password<input name="confirm" type="password" required minLength={12} maxLength={200} autoComplete="new-password" /></label>
    <div><button className="wp-btn" disabled={busy}>{busy ? "Saving…" : "Change password"}</button></div>
  </form>;
}

export function OwnerForms({ hasAdmin }: { hasAdmin: boolean }) {
  const [notice, setNotice] = useState<{ text: string; good: boolean } | null>(null);
  const [link, setLink] = useState("");
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await post("/api/platform/owner", { action: "create-admin", name: form.get("name"), email: form.get("email"), password: form.get("password") });
      setNotice({ text: "Administrator created. Sign in at the Working Platform with that email and password.", good: true });
    } catch (e) { setNotice({ text: e instanceof Error ? e.message : "Not created.", good: false }); }
  }
  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const data = await post("/api/platform/owner", { action: "reset-admin", email: form.get("email") });
      setLink(data.link); setNotice(null);
    } catch (e) { setNotice({ text: e instanceof Error ? e.message : "No link was created.", good: false }); }
  }
  return <div style={{ display: "grid", gap: 18 }}>
    {notice && <p className={`wp-notice ${notice.good ? "good" : "bad"}`} role="status">{notice.text}</p>}
    {!hasAdmin && <form onSubmit={create} style={{ display: "grid", gap: 12 }}>
      <h2>Create the first administrator</h2>
      <label>Name<input name="name" required maxLength={120} /></label>
      <label>Email<input name="email" type="email" required maxLength={254} /></label>
      <label>Password<input name="password" type="password" required minLength={12} maxLength={200} autoComplete="new-password" /></label>
      <button className="wp-btn">Create administrator</button>
    </form>}
    <form onSubmit={reset} style={{ display: "grid", gap: 12 }}>
      <h2>Recover an administrator</h2>
      <p className="hint">Creates a one-time link (valid 24 hours) for an administrator who cannot sign in. Give it to them directly.</p>
      <label>Administrator email<input name="email" type="email" required maxLength={254} /></label>
      <button className="wp-btn quiet">Create recovery link</button>
    </form>
    {link && <div className="wp-link-box"><b>One-time link</b><code>{link}</code><button className="wp-btn small quiet" type="button" onClick={() => navigator.clipboard?.writeText(link)}>Copy link</button></div>}
  </div>;
}
