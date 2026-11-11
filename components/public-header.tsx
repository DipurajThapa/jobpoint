"use client";
import Link from "@/components/app-link";

import Image from "next/image";
import { useState } from "react";
import Icon from "./icon";

/** The same header on every public page. Section links point at the home page's sections. */
const navigation = [["/#jobs", "Find jobs"], ["/job-seekers", "Job seekers"], ["/employers", "Employers"], ["/#about", "About"], ["/#faq", "FAQs"]];

export default function PublicHeader({ onHire, audience = "candidate" }: { onHire?: () => void; audience?: "candidate" | "employer" }) {
  const [open, setOpen] = useState(false);
  return <header className="header"><div className="container nav">
    <Link className="brand" href="/#top" aria-label="Jobboard300 home"><Image src="/images/jobboard300-logo.png" alt="Jobboard300" width={499} height={81} priority /></Link>
    <button className="menu-button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="public-navigation" aria-label="Toggle navigation"><Icon name={open ? "close" : "menu"} /></button>
    <nav id="public-navigation" aria-label="Main navigation" className={open ? "nav-links open" : "nav-links"}>
      {navigation.map(([href, name]) => <Link key={href} href={href} onClick={() => setOpen(false)}>{name}</Link>)}
      <div className="nav-auth"><Link className="nav-signin" href={audience === "employer" ? "/portal/sign-in?kind=company" : "/portal/sign-in?kind=candidate"} onClick={() => setOpen(false)}>{audience === "employer" ? "Employer sign in" : "Sign in"}</Link><Link className="nav-signup" href={audience === "employer" ? "/portal/register?kind=company" : "/portal/register?kind=candidate"} onClick={() => setOpen(false)}>Sign up</Link></div>
      {onHire ? <button className="button button-small" onClick={() => { onHire(); setOpen(false); }}>Hire talent <Icon name="north_east" /></button> : <Link className="button button-small" href="/employers">Hire talent <Icon name="north_east" /></Link>}
    </nav>
  </div></header>;
}
