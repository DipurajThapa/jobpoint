import LandingPage from "@/components/landing-page";
import { CANDIDATE_PAGE } from "@/lib/landing";
import { SITE_URL } from "@/lib/site";

export const metadata = { title: "Upload your CV and apply for IT and non-IT jobs", description: "Register your CV free on the Jobboard300 job board. A recruiter matches you to IT and non-IT professional jobs and shares your CV only with your consent.", alternates: { canonical: "/job-seekers" }, openGraph: { title: "Upload your CV and apply for IT and non-IT jobs | Jobboard300", description: "Register your CV free on the Jobboard300 job board. A recruiter matches you to IT and non-IT professional jobs and shares your CV only with your consent.", url: "/job-seekers", type: "website" } };

export default function Page() {
  const faq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: CANDIDATE_PAGE.faqs.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) };
  const service = { "@context": "https://schema.org", "@type": "Service", name: "Job search support for professionals", provider: { "@id": `${SITE_URL}/#agency` }, url: `${SITE_URL}/job-seekers`, description: "Register your CV free on the Jobboard300 job board. A recruiter matches you to IT and non-IT professional jobs and shares your CV only with your consent." };
  return <><LandingPage page={CANDIDATE_PAGE} />{[faq, service].map((data, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />)}</>;
}
