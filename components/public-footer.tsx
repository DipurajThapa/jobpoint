"use client";
import Link from "next/link";

import Image from "next/image";
import { DEMO_MODE } from "@/lib/demo";

export default function PublicFooter({ onCandidate, onEmployer }: { onCandidate?: () => void; onEmployer?: () => void }) {
  return <footer className="footer"><div className="container footer-top"><div><Image src="/images/jobboard300-logo-on-dark.png" alt="Jobboard300" width={499} height={81} /><p>Connecting job seekers and employers across India for more than 13 years. Based in Kolkata, West Bengal.</p></div><div className="footer-links"><div><b>Explore</b><Link href="/#about">About Jobboard300</Link><Link href="/#services">Recruitment services</Link><Link href="/#jobs">Find jobs</Link><Link href="/#faq">FAQs</Link></div><div><b>Get in touch</b>{onCandidate ? <button onClick={onCandidate}>{DEMO_MODE ? "Preview CV form" : "Register your CV"}</button> : <Link href="/#candidates">{DEMO_MODE ? "Preview CV form" : "Register your CV"}</Link>}{onEmployer ? <button onClick={onEmployer}>{DEMO_MODE ? "Preview enquiry form" : "Employer enquiry"}</button> : <Link href="/#employers">{DEMO_MODE ? "Preview enquiry form" : "Employer enquiry"}</Link>}<Link href="/#contact">Contact Jobboard300</Link><Link href="/admin">Recruiter sign-in</Link></div></div></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} Jobboard300</span><span>Kolkata · West Bengal · India</span><nav aria-label="Legal navigation"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms of use</Link><Link href="/compliance">Privacy safeguards</Link></nav></div></footer>;
}
