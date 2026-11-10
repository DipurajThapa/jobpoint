import { redirect } from "next/navigation";
import { requirePlatformPage, toolEnabled } from "@/lib/platform/auth";
import Shell from "../shell";
import Assessments from "./assessments";
import "../../portal/portal.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assessments" };

export default async function Page() {
  const user = await requirePlatformPage("/platform/assessments");
  if (!user.access.assessments || !await toolEnabled("assessments")) redirect("/platform");
  return <Shell user={user} current="/platform/assessments">
    <header className="wp-head"><div><span className="wp-overline">Working Platform</span><h1>Assessments</h1><p>Question banks for technical, aptitude and client tests. Only administrators and invigilators can open this tool.</p></div></header>
    <Assessments />
  </Shell>;
}
