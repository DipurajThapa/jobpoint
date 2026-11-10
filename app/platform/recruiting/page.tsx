import { redirect } from "next/navigation";
import { requirePlatformPage, toolEnabled } from "@/lib/platform/auth";
import Shell from "../shell";
import Recruiting from "./recruiting";
import "../../portal/portal.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recruiting" };

export default async function Page() {
  const user = await requirePlatformPage("/platform/recruiting");
  if (!user.access.recruiting || !await toolEnabled("recruiting")) redirect("/platform");
  return <Shell user={user} current="/platform/recruiting">
    <header className="wp-head"><div><span className="wp-overline">Working Platform</span><h1>Recruiting</h1><p>Your assigned clients and jobs. You see only your team&apos;s work.</p></div></header>
    <Recruiting />
  </Shell>;
}
