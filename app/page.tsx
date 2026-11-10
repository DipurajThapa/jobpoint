import HomeClient from "./home-client";
import { listPublicJobs } from "@/lib/public-jobs";
import { faqs } from "@/lib/faqs";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function Home() {
  let listings: Awaited<ReturnType<typeof listPublicJobs>>;
  let initialLoaded = true;
  try { listings = await listPublicJobs(); }
  catch { listings = { jobs: [], locations: [] }; initialLoaded = false; }
  const url = SITE_URL;
  const company = {
    "@context": "https://schema.org", "@type": "EmploymentAgency", "@id": `${url}/#agency`, name: "Jobboard300", alternateName: ["Job Board 300", "Jobboard300 job board"], url, logo: `${url}/images/jobboard300-logo.png`, image: `${url}/images/career-conversation.webp`,
    description: "Jobboard300 is a job board and recruitment consultancy based in Kolkata, India, for IT and other office-based (white-collar) roles. Candidates register a CV and apply free of charge; employers hire recruiter-screened candidates and pay 7.5% to 8.33% of annual salary only on a successful placement.",
    address: { "@type": "PostalAddress", addressLocality: "Kolkata", addressCountry: "IN" },
    knowsAbout: ["IT recruitment", "Non-IT recruitment", "Software developer hiring", "Finance and accounts hiring", "Sales hiring", "Operations and HR hiring", "Permanent recruitment", "CV screening"],
    makesOffer: [
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Permanent recruitment", description: "Recruiter-screened shortlists for IT and non-IT white-collar roles. The fee is 7.5% to 8.33% of annual salary, charged only on a successful placement, with one free replacement if the hire leaves within 60 days." } },
      { "@type": "Offer", price: "0", priceCurrency: "INR", itemOffered: { "@type": "Service", name: "CV registration and job applications for candidates", description: "Candidates register a CV and apply for jobs free of charge." } },
    ],
  };
  const website = { "@context": "https://schema.org", "@type": "WebSite", "@id": `${url}/#website`, name: "Jobboard300", alternateName: "Job Board 300", url, publisher: { "@id": `${url}/#agency` }, inLanguage: "en-IN" };
  const faq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) };
  return <><HomeClient initialJobs={listings.jobs} initialLocations={listings.locations} initialLoaded={initialLoaded} /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(company).replace(/</g, "\\u003c") }} /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(website).replace(/</g, "\\u003c") }} /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq).replace(/</g, "\\u003c") }} /></>;
}
