import type { Metadata } from "next";
import "../platform/platform.css";
import "../portal/portal.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Jobboard300", template: "%s | Jobboard300" }, robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="wp-root">{children}</div>;
}
