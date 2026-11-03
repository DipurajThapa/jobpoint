import AuthCard from "../auth-card";

export const metadata = { title: "Forgot password" };

// No email service is configured, so recovery runs through an administrator.
// This page never reveals whether an account exists.
export default function ForgotPage() {
  return <AuthCard title="Forgot your password?">
    <p>Ask a Working Platform administrator to create a password reset link for you. The link works once and expires after 24 hours.</p>
    <p className="hint">Administrators: open <b>Team access</b>, find the person, and choose <b>Create reset link</b>. Send the link to them directly, not in a shared channel.</p>
    <p className="hint">If no administrator can sign in, the site owner can create a recovery link from the owner page.</p>
    <div className="wp-auth-foot"><a href="/platform/sign-in">Back to sign in</a></div>
  </AuthCard>;
}
