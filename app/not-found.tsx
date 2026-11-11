import type { Metadata } from "next";
import Link from "@/components/app-link";
import PublicHeader from "@/components/public-header";
import PublicFooter from "@/components/public-footer";

// A wrong address must never be indexed, and must not borrow the home page title.
export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: true }, alternates: { canonical: null } };

export default function NotFound() {
  return <><PublicHeader /><main className="privacy-page"><div className="container privacy-content"><span className="eyebrow">PAGE NOT FOUND</span><h1>That page isn’t available.</h1><p>The link may be outdated or a role may have closed. Browse current opportunities or return to the homepage.</p><p><Link className="button" href="/jobs">Browse current roles</Link> <Link className="text-link" href="/">Go home</Link></p></div></main><PublicFooter /></>;
}
