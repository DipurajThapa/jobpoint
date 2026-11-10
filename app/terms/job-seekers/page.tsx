import Link from "next/link";
import LegalPage from "@/components/legal-page";

export const metadata = { title: "Terms for job seekers", description: "The terms a job seeker accepts when registering a CV or applying through Jobboard300.", alternates: { canonical: "/terms/job-seekers" } };

export default function Page() {
  return <LegalPage title="Terms for job seekers" intro="You accept these terms when you register your CV, apply for a job or open an account with Jobboard300. Version of 10 November 2026.">
    <h2>1. What Jobboard300 does for you</h2><p>We review your CV, match it to roles our client employers are filling and, with your consent, put you forward for those roles. We cannot promise an interview, an offer or a job. Employers make their own hiring decisions.</p>
    <h2>2. What it costs</h2><p>Registering your CV, applying for jobs and being put forward for a role are free. We never charge you a fee for being considered or placed. Fast Track is a separate, optional paid package described in section 7.</p>
    <h2>3. Your information</h2><p>You must be at least 18. The CV and details you give must be true, complete and your own. Tell us when they change. If information is found to be false, we may withdraw you from a role and close your profile.</p>
    <h2>4. Consent and sharing</h2><p>We share your CV with an employer only with your consent, and only for a role that suits you. You can withdraw consent, hide your profile from a named employer or ask us to delete your data at any time. The <Link href="/privacy">privacy notice</Link> explains how.</p>
    <h2>5. Roles we introduce</h2><p>If we introduce you to an employer, please continue that hiring process through Jobboard300. Tell your recruiter if the employer contacts you directly about the same role.</p>
    <h2>6. Your commitment when you receive an offer</h2><p>When an employer makes you an offer through us, we ask you to confirm in writing that you intend to join on the agreed date and to stay at least 60 days. If you leave within 60 days of joining without a serious reason, we record it on your profile and give your profile lower priority for other roles for 12 months. Serious reasons include unpaid salary, an unsafe workplace, harassment, a role materially different from the one offered, and a medical or family emergency. We do not charge you a fee or penalty under this commitment.</p>
    <h2>7. Fast Track and tests</h2><p>Fast Track is a paid package. It includes technical tests in your skills, your level on each test, the topics to prepare and interview guidance. You are on Fast Track once we confirm your payment. A strong test result counts when recruiters shortlist; payment alone does not improve your ranking and does not guarantee a job. An employer may also ask shortlisted candidates to take a test; those tests are free to you. Take every test alone and without outside help. We may cancel a result obtained unfairly.</p>
    <h2>8. Messages from us</h2><p>We contact you about your applications by the phone number, WhatsApp number and email address you give us. You can ask us to stop at any time.</p>
    <h2>9. Ending this arrangement</h2><p>You can close your profile whenever you wish. We may close a profile that breaks these terms. Deleting your data follows the privacy notice.</p>
    <h2>10. General</h2><p>These terms are governed by the laws of India. Nothing in them removes a right that the law gives you. If we change these terms, we publish the new version here with its date.</p>
  </LegalPage>;
}
