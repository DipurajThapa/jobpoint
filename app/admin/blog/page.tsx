import { redirect } from "next/navigation";
import { isSiteOwner } from "@/lib/admin";
import { pageUser } from "@/lib/platform/auth";
import BlogEditor from "./editor";
export const dynamic = "force-dynamic";
export const metadata = { title: "Blog CMS | Administration", robots: { index: false, follow: false, nocache: true } };
export default async function Page() {
  if (!await isSiteOwner()) { const user = await pageUser(); if (!user || user.role !== "admin") redirect("/platform/sign-in?next=/admin/blog"); }
  return <BlogEditor />;
}
