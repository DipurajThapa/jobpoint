import { audit, requireAdminPage, requirePlatformPage } from "@/lib/platform/auth";
import { TOOLS } from "@/lib/platform/tools";
import Shell from "../shell";
import TeamAccess from "./team-access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team access" };

export default async function AdminPage() {
  const admin = await requireAdminPage("/platform/admin");
  if (!admin) {
    const user = await requirePlatformPage("/platform/admin");
    return <Shell user={user} current="/platform/admin"><section className="wp-card wp-denied"><h1>Administrators only</h1><p>Your account cannot manage team access. Ask an administrator if you need a change.</p><a className="wp-btn quiet" href="/platform">Back to dashboard</a></section></Shell>;
  }
  await audit(`platform:${admin.id}`, "platform.team_access_opened", "platform", "team-access");
  const tools = TOOLS.map(t => ({ key: t.key, name: t.name, levels: t.levels }));
  return <Shell user={admin} current="/platform/admin">
    <header className="wp-head"><div><span className="wp-overline">Administration</span><h1>Team access</h1><p>Invite people, choose which tools they can use, and remove access. Changes apply on their next request.</p></div></header>
    <TeamAccess tools={tools} />
  </Shell>;
}
