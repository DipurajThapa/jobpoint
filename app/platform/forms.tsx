"use client";
import { useEffect, useState, type FormEvent } from "react";

async function post(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  const data = await response.json().catch(() => ({})) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!response.ok) throw Object.assign(new Error(data.error || "Something went wrong. Try again."), { code: typeof data.code === "string" ? data.code : "" });
  return data;
}

const safeNext = (value: string | null) => value && value.startsWith("/platform") && !value.startsWith("//") && !value.includes("\\") ? value : "/platform";

const SIGN_IN_ERRORS: Record<string, string> = { INVALID: "Email or password is incorrect.", MISSING: "Enter your email and password.", TWO_FACTOR: "Enter the 6-digit code from your authenticator app.", TWO_FACTOR_INVALID: "That code is not right, or it was already used. Wait for the next code and try again.", RATE_LIMIT: "Too many sign-in attempts. Wait 15 minutes, then try again.", UNAVAILABLE: "Sign-in is temporarily unavailable." };

export function SignInForm({ next, signedOut, errorCode }: { next: string | null; signedOut: boolean; errorCode?: string }) {
  const [error, setError] = useState(errorCode ? SIGN_IN_ERRORS[errorCode] ?? "Sign-in failed." : "");
  const [busy, setBusy] = useState(false);
  // The code box appears only for people who turned two-step sign-in on.
  const [needCode, setNeedCode] = useState(!!errorCode?.startsWith("TWO_FACTOR"));
  useEffect(() => {
    // Remove anything Email Kit kept in this browser for the previous person.
    if (signedOut) try { Object.keys(localStorage).filter(k => k.startsWith("email-kit-")).forEach(k => localStorage.removeItem(k)); } catch { /* storage unavailable */ }
  }, [signedOut]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      await post("/api/platform/auth/sign-in", { email: form.get("email"), password: form.get("password"), code: form.get("code") ?? "" });
      window.location.assign(safeNext(next));
    } catch (e) {
      if (String((e as { code?: string }).code ?? "").startsWith("TWO_FACTOR")) setNeedCode(true);
      setError(e instanceof Error ? e.message : "Sign-in failed."); setBusy(false);
    }
  }
  return <form onSubmit={submit} method="post" action="/api/platform/auth/sign-in" noValidate>
    <input type="hidden" name="next" value={safeNext(next)} />
    {signedOut && <p className="wp-notice good" role="status">You are signed out.</p>}
    {error && <p className="wp-notice bad" role="alert">{error}</p>}
    <label>Work email<input name="email" type="email" autoComplete="username" required maxLength={254} autoFocus /></label>
    <label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={200} /></label>
    {needCode && <label>Authenticator code (or a recovery code)<input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={20} autoFocus /></label>}
    <button className="wp-btn" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
  </form>;
}

export function SetPasswordForm({ token, invite, email, initialError }: { token: string; invite: boolean; email: string; initialError?: string }) {
  const [error, setError] = useState(initialError ?? "");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("confirm")) { setError("The two passwords do not match."); return; }
    setBusy(true); setError("");
    try {
      await post("/api/platform/auth/accept", { token, name: form.get("name"), password: form.get("password") });
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full page load on purpose: it clears client state and re-runs the server session check
      window.location.assign("/platform");
    } catch (e) { setError(e instanceof Error ? e.message : "The password was not saved."); setBusy(false); }
  }
  return <form onSubmit={submit} method="post" action="/api/platform/auth/accept" noValidate>
    <input type="hidden" name="token" value={token} />
    <input type="hidden" name="purpose" value={invite ? "accept" : "reset"} />
    {error && <p className="wp-notice bad" role="alert">{error}</p>}
    <label>Email<input value={email} readOnly autoComplete="username" /></label>
    {invite && <label>Your name<input name="name" required maxLength={120} autoComplete="name" /></label>}
    <label>New password<input name="password" type="password" required minLength={12} maxLength={200} autoComplete="new-password" /></label>
    <label>Repeat the password<input name="confirm" type="password" required minLength={12} maxLength={200} autoComplete="new-password" /></label>
    <p className="hint">At least 12 characters. A short sentence works well.</p>
    <button className="wp-btn" disabled={busy}>{busy ? "Saving…" : invite ? "Create my account" : "Set new password"}</button>
  </form>;
}

export function ChangePasswordForm({ initial }: { initial?: { text: string; good: boolean } }) {
  const [notice, setNotice] = useState<{ text: string; good: boolean } | null>(initial ?? null);
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
  return <form onSubmit={submit} method="post" action="/api/platform/auth/password" className="wp-form-grid" style={{ gridTemplateColumns: "1fr" }}>
    {notice && <p className={`wp-notice ${notice.good ? "good" : "bad"}`} role="status">{notice.text}</p>}
    <label>Current password<input name="current" type="password" required autoComplete="current-password" maxLength={200} /></label>
    <label>New password<input name="next" type="password" required minLength={12} maxLength={200} autoComplete="new-password" /></label>
    <label>Repeat the new password<input name="confirm" type="password" required minLength={12} maxLength={200} autoComplete="new-password" /></label>
    <div><button className="wp-btn" disabled={busy}>{busy ? "Saving…" : "Change password"}</button></div>
  </form>;
}

/** Optional two-step sign-in: add the account to an authenticator app, confirm one code, keep the recovery codes. */
export function TwoFactorForm({ on }: { on: boolean }) {
  const [enabled, setEnabled] = useState(on);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<{ text: string; good: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(event: FormEvent<HTMLFormElement>, action: "setup" | "enable" | "disable") {
    event.preventDefault();
    const element = event.currentTarget, form = new FormData(element);
    setBusy(true); setNotice(null);
    try {
      const out = await post("/api/platform/auth/two-factor", { action, password: form.get("password") ?? "", code: form.get("code") ?? "" });
      if (action === "setup") setSetup({ secret: String(out.secret), uri: String(out.uri) });
      if (action === "enable") { setEnabled(true); setSetup(null); setRecovery(out.recoveryCodes as string[]); }
      if (action === "disable") { window.location.reload(); return; }
      element.reset();
    } catch (e) { setNotice({ text: e instanceof Error ? e.message : "Not saved.", good: false }); }
    setBusy(false);
  }
  const grid = { gridTemplateColumns: "1fr" };
  return <div className="wp-form-grid" style={grid}>
    {notice && <p className={`wp-notice ${notice.good ? "good" : "bad"}`} role="status">{notice.text}</p>}
    {recovery && <div className="wp-notice good" role="status"><p><b>Two-step sign-in is on.</b> Keep these recovery codes somewhere safe. Each works once if you lose your phone. They are not shown again.</p><p style={{ fontFamily: "monospace", lineHeight: 1.9 }}>{recovery.join("  ")}</p></div>}
    {!enabled && !setup && <form onSubmit={e => run(e, "setup")} className="wp-form-grid" style={grid}>
      <p className="hint">Optional. After your password you will also enter a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy or similar).</p>
      <label>Current password<input name="password" type="password" required autoComplete="current-password" maxLength={200} /></label>
      <div><button className="wp-btn" disabled={busy}>Set up two-step sign-in</button></div>
    </form>}
    {!enabled && setup && <form onSubmit={e => run(e, "enable")} className="wp-form-grid" style={grid}>
      <p>In your authenticator app choose “add account” and “enter a setup key”, then type this key:</p>
      <p style={{ fontFamily: "monospace", fontSize: 18, letterSpacing: 1, wordBreak: "break-all" }}>{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</p>
      <p className="hint">On this phone you can <a href={setup.uri}>open the authenticator app</a> instead.</p>
      <label>The 6-digit code the app shows<input name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={8} /></label>
      <div><button className="wp-btn" disabled={busy}>Turn on</button></div>
    </form>}
    {enabled && <form onSubmit={e => run(e, "disable")} className="wp-form-grid" style={grid}>
      <p>Two-step sign-in is <b>on</b> for your account.</p>
      <label>Current password<input name="password" type="password" required autoComplete="current-password" maxLength={200} /></label>
      <label>A current code from the app (or a recovery code)<input name="code" required autoComplete="one-time-code" maxLength={20} /></label>
      <div><button className="wp-btn" disabled={busy}>Turn off</button></div>
    </form>}
  </div>;
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
    {!hasAdmin && <form onSubmit={create} method="post" action="/api/platform/owner" style={{ display: "grid", gap: 12 }}>
      <input type="hidden" name="action" value="create-admin" />
      <h2>Create the first administrator</h2>
      <label>Name<input name="name" required maxLength={120} /></label>
      <label>Email<input name="email" type="email" required maxLength={254} /></label>
      <label>Password<input name="password" type="password" required minLength={12} maxLength={200} autoComplete="new-password" /></label>
      <button className="wp-btn">Create administrator</button>
    </form>}
    <form onSubmit={reset} method="post" action="/api/platform/owner" style={{ display: "grid", gap: 12 }}>
      <input type="hidden" name="action" value="reset-admin" />
      <h2>Recover an administrator</h2>
      <p className="hint">Creates a one-time link (valid 24 hours) for an administrator who cannot sign in. Give it to them directly.</p>
      <label>Administrator email<input name="email" type="email" required maxLength={254} /></label>
      <button className="wp-btn quiet">Create recovery link</button>
    </form>
    {link && <div className="wp-link-box"><b>One-time link</b><code>{link}</code><button className="wp-btn small quiet" type="button" onClick={() => navigator.clipboard?.writeText(link)}>Copy link</button></div>}
  </div>;
}
