import { notFound, redirect } from "next/navigation";
import { getChatGPTUser, chatGPTSignOutPath } from "../chatgpt-auth";
import { isSiteOwner } from "@/lib/admin";
import AdminClient from "./admin-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recruitment dashboard", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const user = await getChatGPTUser();
  if (!user) redirect(`/signin-with-chatgpt?return_to=${encodeURIComponent("/admin")}`);
  if (!await isSiteOwner()) notFound();
  return <AdminClient name={user.fullName ?? user.email} signOut={chatGPTSignOutPath("/")} />;
}
