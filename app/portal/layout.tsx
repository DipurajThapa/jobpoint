import type { Metadata } from "next";
import "../platform/platform.css";
import "./portal.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Job Point jobs", template: "%s | Job Point" }, robots: { index: false, follow: false } };

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <div className="wp-root">{children}</div>;
}
