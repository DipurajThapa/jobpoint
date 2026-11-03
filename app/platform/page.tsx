import Icon from "@/components/icon";
import { requirePlatformPage } from "@/lib/platform/auth";
import { LEVEL_LABEL, TOOLS } from "@/lib/platform/tools";
import Shell from "./shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const user = await requirePlatformPage("/platform");
  const tools = TOOLS.filter(t => user.access[t.key]);
  const first = (user.name || user.email).split(" ")[0];
  return <Shell user={user} current="/platform">
    <header className="wp-head"><div><span className="wp-overline">Working Platform</span><h1>Welcome, {first}</h1><p>Your tools are listed below. An administrator controls what you can open.</p></div></header>
    {tools.length === 0
      ? <p className="wp-empty">No tools are assigned to you yet. Ask an administrator to grant access.</p>
      : <section className="wp-tools" aria-label="Your tools">
        {tools.map(tool => <a className="wp-tool" key={tool.key} href={tool.href}>
          <Icon name={tool.icon} />
          <h2>{tool.name}</h2>
          <p>{tool.description}</p>
          <footer><span className="wp-badge">{LEVEL_LABEL[user.access[tool.key]]} access</span><span className="wp-btn small">Open <Icon name="arrow_forward" /></span></footer>
        </a>)}
      </section>}
  </Shell>;
}
