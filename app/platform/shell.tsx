import Image from "next/image";
import Icon from "@/components/icon";
import { toolEnabled, type PlatformUser } from "@/lib/platform/auth";
import { TOOLS } from "@/lib/platform/tools";

type Props = { user: PlatformUser; current: string; children: React.ReactNode };

// Shared signed-in frame. It only renders after the page's server-side check.
export default async function Shell({ user, current, children }: Props) {
  const enabled = await Promise.all(TOOLS.map(t => toolEnabled(t.key)));
  const tools = TOOLS.filter((t,i) => user.access[t.key] && enabled[i]);
  const link = (href: string, icon: string, label: string) =>
    <a href={href} aria-current={current === href ? "page" : undefined}><Icon name={icon} />{label}</a>;
  return <div className="wp-shell">
    <aside className="wp-side">
      <a className="wp-brand" href="/platform"><Image src="/images/jobboard300-icon.png" width={512} height={512} alt="" /><span><b>Working Platform</b><span>JOBBOARD300</span></span></a>
      <nav className="wp-nav" aria-label="Working Platform">
        {link("/platform", "dashboard", "Dashboard")}
        {tools.length > 0 && <span className="wp-nav-label">TOOLS</span>}
        {tools.map(t => <a key={t.key} href={t.href}><Icon name={t.icon} />{t.name}</a>)}
        <span className="wp-nav-label">ACCOUNT</span>
        {user.role === "admin" && link("/platform/admin", "manage_accounts", "Team access")}
        {user.role === "admin" && link("/platform/admin/operations", "settings", "Operations")}
        {link("/platform/account", "person", "My account")}
      </nav>
      <div className="wp-me">
        <b>{user.name || user.email}</b>
        <span>{user.role === "admin" ? "Administrator" : "Team member"}</span>
        <form method="post" action="/api/platform/auth/sign-out"><button type="submit">Sign out</button></form>
      </div>
    </aside>
    <main className="wp-main" id="main">{children}</main>
  </div>;
}
