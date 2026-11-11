import type { Metadata } from "next";
import LandingPage from "@/components/landing-page";
import { CANDIDATE_PAGE } from "@/lib/landing";
import { SITE_URL } from "@/lib/site";

const title = "IT & Non-IT Jobs: Free CV Registration";
const description = "Register your CV free for IT and non-IT jobs, including software, data, accounts, sales and operations. Your CV goes to an employer only with your consent.";
const shareTitle = `${title} | Jobboard300`;
const shareImage = "/images/candidate-meeting.webp";

export const metadata: Metadata = {
  title, description, alternates: { canonical: "/job-seekers" },
  openGraph: { title: shareTitle, description, url: "/job-seekers", type: "website", siteName: "Jobboard300", locale: "en_IN", images: [shareImage] },
  twitter: { card: "summary_large_image", title: shareTitle, description, images: [shareImage] },
};

export default function Page() {
  const faq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: CANDIDATE_PAGE.faqs.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) };
  const service = { "@context": "https://schema.org", "@type": "Service", name: "Job search support for professionals", provider: { "@id": `${SITE_URL}/#agency` }, url: `${SITE_URL}/job-seekers`, description };
  return <><LandingPage page={CANDIDATE_PAGE} />{[faq, service].map((data, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />)}</>;
}
