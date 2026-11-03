import { audit, requireAdminPage, requirePlatformPage } from "@/lib/platform/auth";
import Shell from "../../shell";
import Operations from "./operations";

export const dynamic = "force-dynamic";
export const metadata = { title: "Platform operations" };

export default async function OperationsPage() {
  const admin = await requireAdminPage("/platform/admin/operations");
  if (!admin) {
    const user = await requirePlatformPage("/platform/admin/operations");
    return <Shell user={user} current="/platform/admin/operations"><section className="wp-card wp-denied"><h1>Administrators only</h1><p>Your account cannot manage platform operations.</p></section></Shell>;
  }
  await audit(`platform:${admin.id}`, "platform.admin_operations_opened", "platform", "operations");
  return <Shell user={admin} current="/platform/admin/operations">
    <header className="wp-head"><div><span className="wp-overline">Administration</span><h1>Platform operations</h1><p>Teams, connections, tool availability, settings, health and audit activity.</p></div></header>
    <Operations />
  </Shell>;
}
