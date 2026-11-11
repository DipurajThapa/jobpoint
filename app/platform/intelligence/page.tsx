import { requireAdminPage, requirePlatformPage } from "@/lib/platform/auth";
import Shell from "../shell";
import IntelligenceDashboard from "./dashboard";
import "./intelligence.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Employment Intelligence", robots: { index: false, follow: false, nocache: true } };

export default async function IntelligencePage() {
  const admin = await requireAdminPage("/platform/intelligence");
  if (!admin) {
    const user = await requirePlatformPage("/platform/intelligence");
    return <Shell user={user} current="/platform/intelligence"><section className="wp-card wp-denied"><h1>Administrators only</h1><p>Research evidence and editorial approvals are restricted to administrators.</p></section></Shell>;
  }
  return <Shell user={admin} current="/platform/intelligence"><IntelligenceDashboard /></Shell>;
}
