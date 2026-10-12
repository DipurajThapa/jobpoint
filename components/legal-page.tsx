import type { ReactNode } from "react";
import PublicHeader from "./public-header";
import PublicFooter from "./public-footer";

export default function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return <><PublicHeader /><main className="privacy-page"><article className="container privacy-content"><span className="eyebrow">JOB POINT CONSULTANCY · WEBSITE INFORMATION</span><h1>{title}</h1><p>{intro}</p><nav className="legal-nav" aria-label="Policy pages"><a href="/privacy">Privacy notice</a><a href="/terms">Terms of use</a><a href="/compliance">Privacy safeguards</a></nav>{children}</article></main><PublicFooter /></>;
}
