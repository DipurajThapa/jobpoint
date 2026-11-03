import { findToken } from "@/lib/platform/auth";
import AuthCard from "../auth-card";
import { SetPasswordForm } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reset password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const token = params.token ?? "";
  const row = await findToken(token);
  if (!row || row.purpose !== "reset") return <AuthCard title="This link cannot be used"><p>The reset link has expired, was already used, or was replaced by a newer link. Ask an administrator for a new one.</p><div className="wp-auth-foot"><a href="/platform/sign-in">Go to sign in</a></div></AuthCard>;
  return <AuthCard title="Choose a new password" intro="Setting a new password signs you out on every other device.">
    <SetPasswordForm token={token} invite={false} email={row.email} initialError={params.error?.slice(0, 200)} />
  </AuthCard>;
}
