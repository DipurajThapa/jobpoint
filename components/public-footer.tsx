"use client";
import Link from "@/components/app-link";

import Image from "next/image";
import { DEMO_MODE } from "@/lib/demo";
import { CONTACT } from "@/lib/site";

/**
 * The same footer on every public page: one column for job seekers, one for
 * employers, one about the company, then the legal links. Candidates and
 * clients share one sign-in; Jobboard300 staff have their own.
 */
export default function PublicFooter({ onCandidate, onEmployer }: { onCandidate?: () => void; onEmployer?: () => void }) {
  const cv = DEMO_MODE ? "Preview CV form" : "Upload your CV", enquiry = DEMO_MODE ? "Preview enquiry form" : "Send a hiring enquiry";
  return <footer className="footer"><div className="container footer-top">
    <div><Image src="/images/jobboard300-logo-on-dark.png" alt="Jobboard300" width={499} height={81} /><p>Jobboard300 is a job board and recruitment consultancy for IT and non-IT roles, including software, data, IT support, accounts, sales and operations.</p></div>
    <div className="footer-links">
      <div><b>Job seekers</b>
        <Link href="/#jobs">Find jobs</Link>
        {onCandidate ? <button onClick={onCandidate}>{cv}</button> : <Link href="/job-seekers">{cv}</Link>}
        <Link href="/job-seekers">How it works for job seekers</Link>
        <Link href="/terms/job-seekers">Terms for job seekers</Link>
        <Link href="/portal/sign-in?kind=candidate">Candidate sign-in</Link>
      </div>
      <div><b>Employers</b>
        <Link href="/employers">Hire through Jobboard300</Link>
        {onEmployer ? <button onClick={onEmployer}>{enquiry}</button> : <Link href="/employers">{enquiry}</Link>}
        <Link href="/employers#page-terms">Fee and terms</Link>
        <Link href="/terms/employers">Terms for employers</Link>
        <Link href="/portal/sign-in?kind=company">Employer sign-in</Link>
      </div>
      <div><b>Jobboard300</b>
        <Link href="/#about">About us</Link>
        <Link href="/#services">Recruitment services</Link>
        <Link href="/#faq">FAQs</Link>
        <Link href="/#contact">Contact</Link>
        <Link href="/platform/sign-in">Staff sign-in</Link>
      </div>
    </div>
  </div><div className="container footer-bottom"><span>© {new Date().getFullYear()} Jobboard300</span><span><a href={CONTACT.phoneHref}>{CONTACT.phone}</a> · <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></span><nav aria-label="Legal navigation"><Link href="/privacy">Privacy notice</Link><Link href="/privacy#privacy-request">Your data requests</Link><Link href="/terms">Terms of use</Link><Link href="/compliance">Privacy safeguards</Link></nav></div></footer>;
}
