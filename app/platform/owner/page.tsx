import { notFound, redirect } from "next/navigation";
import { getChatGPTUser } from "../../chatgpt-auth";
import { isSiteOwner } from "@/lib/admin";
import { db } from "@/lib/platform/auth";
import AuthCard from "../auth-card";
import { OwnerForms } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Owner setup" };

// Only the site owner (verified by Sign in with ChatGPT, as for /admin) may
// create the first administrator or recover an administrator account.
export default async function OwnerPage() {
  const user = await getChatGPTUser();
  if (!user) redirect(`/signin-with-chatgpt?return_to=${encodeURIComponent("/platform/owner")}`);
  if (!await isSiteOwner()) notFound();
  const row = await db().prepare("SELECT COUNT(*) AS n FROM platform_users WHERE role = 'admin' AND status = 'active'").first<{ n: number }>();
  return <AuthCard title="Owner setup" intro={`Signed in as ${user.email}. Actions here are recorded in the audit log.`}>
    <OwnerForms hasAdmin={(row?.n ?? 0) > 0} />
    <div className="wp-auth-foot"><a href="/platform/sign-in">Working Platform sign-in</a></div>
  </AuthCard>;
}
