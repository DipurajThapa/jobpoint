import type { Metadata } from "next";
import "./platform.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { default: "Working Platform", template: "%s | Working Platform" },
  robots: { index: false, follow: false, nocache: true },
};

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <div className="wp-root">{children}</div>;
}
