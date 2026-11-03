import { requirePlatformPage } from "@/lib/platform/auth";
import { LEVEL_LABEL, TOOLS } from "@/lib/platform/tools";
import Shell from "../shell";
import { ChangePasswordForm } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "My account" };

export default async function AccountPage() {
  const user = await requirePlatformPage("/platform/account");
  const tools = TOOLS.filter(t => user.access[t.key]);
  return <Shell user={user} current="/platform/account">
    <header className="wp-head"><div><span className="wp-overline">Account</span><h1>My account</h1></div></header>
    <section className="wp-card"><h2>Profile</h2>
      <p><b>{user.name || "—"}</b><br />{user.email}<br />{user.role === "admin" ? "Administrator" : "Team member"}</p>
      <p className="hint">Tool access: {tools.length ? tools.map(t => `${t.name} (${LEVEL_LABEL[user.access[t.key]]})`).join(", ") : "none yet"}. Ask an administrator to change your name or access.</p>
    </section>
    <section className="wp-card"><h2>Change password</h2><ChangePasswordForm /></section>
  </Shell>;
}
