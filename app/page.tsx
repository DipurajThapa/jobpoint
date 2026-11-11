import HomeClient from "./home-client";
import { faqs } from "@/lib/faqs";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function Home() {
  const url = SITE_URL;
  const company = {
    "@context": "https://schema.org", "@type": "EmploymentAgency", "@id": `${url}/#agency`, name: "Jobboard300", alternateName: ["Job Board 300", "Jobboard300 job board"], url, logo: `${url}/images/jobboard300-logo.png`, image: `${url}/images/candidate-meeting.webp`,
    description: "Jobboard300 is a job board and recruitment consultancy for small and growing businesses. It supports both IT and non-IT hiring. IT roles include software development and testing, data and analytics, and IT support and infrastructure. Non-IT roles include accounts and finance, sales and business development, and customer support and operations. Candidates register a CV and apply free of charge; employers hire recruiter-screened candidates and pay 7.5% to 8.33% of annual salary only on a successful placement.",
    knowsAbout: ["Software development and testing hiring", "Data and analytics hiring", "IT support and infrastructure hiring", "Accounts and finance hiring", "Sales and business development hiring", "Customer support and operations hiring", "Permanent recruitment", "CV screening"],
    makesOffer: [
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Permanent recruitment", description: "Recruiter-screened shortlists for IT and non-IT roles, including software, data, infrastructure, accounts, sales and operations. The fee is 7.5% to 8.33% of annual salary, charged only on a successful placement, with replacement terms set out in the recruitment agreement." } },
      { "@type": "Offer", price: "0", priceCurrency: "INR", itemOffered: { "@type": "Service", name: "CV registration and job applications for candidates", description: "Candidates register a CV and apply for jobs free of charge." } },
    ],
  };
  const website = { "@context": "https://schema.org", "@type": "WebSite", "@id": `${url}/#website`, name: "Jobboard300", alternateName: "Job Board 300", url, publisher: { "@id": `${url}/#agency` }, inLanguage: "en-IN" };
  const faq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) };
  return <><HomeClient /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(company).replace(/</g, "\\u003c") }} /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(website).replace(/</g, "\\u003c") }} /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq).replace(/</g, "\\u003c") }} /></>;
}
