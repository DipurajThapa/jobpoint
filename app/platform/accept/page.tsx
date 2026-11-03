import { findToken } from "@/lib/platform/auth";
import AuthCard from "../auth-card";
import { SetPasswordForm } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accept invitation" };

export default async function AcceptPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const token = params.token ?? "";
  const row = await findToken(token);
  if (!row || row.purpose !== "invite") return <AuthCard title="This link cannot be used"><p>The invitation has expired, was already used, or was replaced by a newer link. Ask an administrator for a new invitation.</p><div className="wp-auth-foot"><a href="/platform/sign-in">Go to sign in</a></div></AuthCard>;
  return <AuthCard title="Set up your account" intro="You have been invited to the Job Point Working Platform. Choose your password to continue.">
    <SetPasswordForm token={token} invite email={row.email} initialError={params.error?.slice(0, 200)} />
  </AuthCard>;
}
