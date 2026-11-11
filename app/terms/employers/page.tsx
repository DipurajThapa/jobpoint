import Link from "@/components/app-link";
import LegalPage from "@/components/legal-page";

export const metadata = { title: "Terms for employers", description: "The terms an employer accepts when sending a hiring enquiry to Jobboard300.", alternates: { canonical: "/terms/employers" } };

export default function Page() {
  return <LegalPage title="Terms for employers" intro="You accept these terms when you send Jobboard300 a hiring enquiry or use the hiring workspace. A signed recruitment services agreement is also required before we submit candidates; where the two differ, the signed agreement applies. Version of 11 November 2026.">
    <h2>1. The service</h2><p>Jobboard300 provides permanent recruitment. An enquiry starts a conversation; we agree the role with you on a call before any work begins. We then search for, screen and submit candidates for the roles you give us, and interviews are arranged through us. You make the hiring decision. We do not guarantee that a role will be filled.</p>
    <h2>2. Authority</h2><p>The person sending an enquiry confirms that they are authorised to act for the company and that the role is genuine and lawful.</p>
    <h2>3. Fee</h2><p>The placement fee is between 7.5% and 8.33% of the hired candidate&apos;s annual salary, as agreed for your account. It becomes payable when the candidate joins. There is no charge for a shortlist or for interviews. Taxes apply as the law requires.</p>
    <h2>4. Replacement</h2><p>If a candidate we placed leaves within 60 days of joining, we provide one replacement for the same role free of charge. The replacement does not apply where the fee is unpaid, the role or its terms changed materially after the offer, or the departure was caused by redundancy or by a breach on the employer&apos;s side.</p>
    <h2>5. Candidates we introduce</h2><p>A candidate we introduce is hired through Jobboard300. If you or a group company engage that candidate, in any role, within 12 months of the introduction, the placement fee is payable.</p>
    <h2>6. Candidate information</h2><p>Profiles and CVs are confidential and are provided only for your decision on the role in question. You see a candidate&apos;s profile while your hiring process with that person is open, and their contact details from the offer stage. Do not copy, share or keep candidate information beyond that purpose, and delete it when the process ends or the candidate asks. Every downloaded CV carries a watermark that identifies your company. You do not receive access to the candidate database, to scores or to the method by which candidates are selected.</p>
    <h2>7. Tests</h2><p>If you opt for our aptitude test or supply your own test, we run it for the candidates in your process. Test levels and answers stay with Jobboard300; you receive the candidates we judge the best fit.</p>
    <h2>8. Fair hiring</h2><p>Requirements must relate to the job. We do not act on requirements that discriminate unlawfully.</p>
    <h2>9. Our candidates and your staff</h2><p>For the period stated in your agreement, we will not approach people we placed with you about other roles.</p>
    <h2>10. Data protection</h2><p>Each party follows the data protection law that applies to it. The <Link href="/privacy">privacy notice</Link> describes how we handle personal data.</p>
    <h2>11. General</h2><p>These terms are governed by the laws of India. If we change them, we publish the new version here with its date.</p>
  </LegalPage>;
}
