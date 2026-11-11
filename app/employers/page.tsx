import type { Metadata } from "next";
import LandingPage from "@/components/landing-page";
import { EMPLOYER_PAGE } from "@/lib/landing";
import { SITE_URL } from "@/lib/site";

const title = "Hire Accounts, Sales & Support Staff";
const description = "Hire accounts, sales and support staff. Recruiter-screened shortlist, 7.5% to 8.33% fee only when your hire joins, 60-day replacement.";
const shareTitle = `${title} | Jobboard300`;
const shareImage = "/images/candidate-meeting.webp";

export const metadata: Metadata = {
  title, description, alternates: { canonical: "/employers" },
  openGraph: { title: shareTitle, description, url: "/employers", type: "website", siteName: "Jobboard300", locale: "en_IN", images: [shareImage] },
  twitter: { card: "summary_large_image", title: shareTitle, description, images: [shareImage] },
};

export default function Page() {
  const faq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: EMPLOYER_PAGE.faqs.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) };
  const service = { "@context": "https://schema.org", "@type": "Service", name: "Recruitment for accounts, sales and support roles", provider: { "@id": `${SITE_URL}/#agency` }, url: `${SITE_URL}/employers`, description };
  return <><LandingPage page={EMPLOYER_PAGE} />{[faq, service].map((data, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />)}</>;
}
