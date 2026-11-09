"use client";

import Image from "next/image";
import { DEMO_MODE } from "@/lib/demo";

export default function PublicFooter({ onCandidate, onEmployer }: { onCandidate?: () => void; onEmployer?: () => void }) {
  return <footer className="footer"><div className="container footer-top"><div><Image src="/images/jobboard300-logo-on-dark.png" alt="Jobboard300" width={499} height={81} /><p>Connecting job seekers and employers across India for more than 13 years. Based at Webel IT Park, Durgapur, West Bengal.</p></div><div className="footer-links"><div><b>Explore</b><a href="/#about">About Jobboard300</a><a href="/#services">Recruitment services</a><a href="/#jobs">Find jobs</a><a href="/#faq">FAQs</a></div><div><b>Get in touch</b>{onCandidate ? <button onClick={onCandidate}>{DEMO_MODE ? "Preview CV form" : "Register your CV"}</button> : <a href="/#candidates">{DEMO_MODE ? "Preview CV form" : "Register your CV"}</a>}{onEmployer ? <button onClick={onEmployer}>{DEMO_MODE ? "Preview enquiry form" : "Employer enquiry"}</button> : <a href="/#employers">{DEMO_MODE ? "Preview enquiry form" : "Employer enquiry"}</a>}<a href="/#contact">Contact Jobboard300</a><a href="/admin">Recruiter sign-in</a></div></div></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} Jobboard300</span><span>Durgapur · West Bengal · India</span><nav aria-label="Legal navigation"><a href="/privacy">Privacy</a><a href="/terms">Terms of use</a><a href="/compliance">Privacy safeguards</a></nav></div></footer>;
}
