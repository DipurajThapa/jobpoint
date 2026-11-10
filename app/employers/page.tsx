import LandingPage from "@/components/landing-page";
import { EMPLOYER_PAGE } from "@/lib/landing";
import { SITE_URL } from "@/lib/site";

export const metadata = { title: "Hire screened talent and pay only on placement", description: "Hire IT and non-IT professionals through Jobboard300. A recruiter-screened shortlist, a fee of 7.5% to 8.33% on placement and one free replacement within 60 days.", alternates: { canonical: "/employers" }, openGraph: { title: "Hire screened talent and pay only on placement | Jobboard300", description: "Hire IT and non-IT professionals through Jobboard300. A recruiter-screened shortlist, a fee of 7.5% to 8.33% on placement and one free replacement within 60 days.", url: "/employers", type: "website" } };

export default function Page() {
  const faq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: EMPLOYER_PAGE.faqs.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) };
  const service = { "@context": "https://schema.org", "@type": "Service", name: "Recruitment services for employers", provider: { "@id": `${SITE_URL}/#agency` }, url: `${SITE_URL}/employers`, description: "Hire IT and non-IT professionals through Jobboard300. A recruiter-screened shortlist, a fee of 7.5% to 8.33% on placement and one free replacement within 60 days." };
  return <><LandingPage page={EMPLOYER_PAGE} />{[faq, service].map((data, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />)}</>;
}
