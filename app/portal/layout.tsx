import type { Metadata } from "next";
import "../platform/platform.css";
import "./portal.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Jobboard300 jobs", template: "%s | Jobboard300" }, robots: { index: false, follow: false } };

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <div className="wp-root">{children}</div>;
}
