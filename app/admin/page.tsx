import { notFound, redirect } from "next/navigation";
import { getChatGPTUser, chatGPTSignOutPath } from "../chatgpt-auth";
import { isSiteOwner } from "@/lib/admin";
import { pageUser } from "@/lib/platform/auth";
import AdminClient from "./admin-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recruitment dashboard", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const user = await getChatGPTUser();
  // One staff sign-in: an administrator signed in to the Working Platform with two-step sign-in reaches this console too.
  if (!user) {
    const staff = await pageUser();
    if (staff && await isSiteOwner()) return <AdminClient name={staff.name || staff.email} signOut="/platform/account" />;
    redirect(`/signin-with-chatgpt?return_to=${encodeURIComponent("/admin")}`);
  }
  if (!await isSiteOwner()) notFound();
  return <AdminClient name={user.fullName ?? user.email} signOut={chatGPTSignOutPath("/")} />;
}
