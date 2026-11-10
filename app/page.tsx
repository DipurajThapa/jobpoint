import HomeClient from "./home-client";
import { listPublicJobs } from "@/lib/public-jobs";
import { faqs } from "@/lib/faqs";

export const dynamic = "force-dynamic";

export default async function Home() {
  let listings: Awaited<ReturnType<typeof listPublicJobs>>;
  let initialLoaded = true;
  try { listings = await listPublicJobs(); }
  catch { listings = { jobs: [], locations: [] }; initialLoaded = false; }
  const url = "https://jobboard300.dippurajthapa.chatgpt.site";
  const company = {
    "@context": "https://schema.org", "@type": "EmploymentAgency", "@id": `${url}/#agency`, name: "Jobboard300", alternateName: ["Job Board 300", "Jobboard300 job board"], url, logo: `${url}/images/jobboard300-logo.png`, image: `${url}/images/career-conversation.webp`,
    description: "Jobboard300 is a job board and IT recruitment consultancy based in Kolkata, West Bengal. Candidates find IT jobs across India; employers hire recruiter-screened candidates and pay a placement fee only when the hire joins.",
    areaServed: { "@type": "Country", name: "India" }, address: { "@type": "PostalAddress", addressLocality: "Kolkata", addressRegion: "West Bengal", addressCountry: "IN" },
    knowsAbout: ["IT recruitment", "IT jobs in India", "Software developer hiring", "Data and AI hiring", "Cloud and DevOps hiring", "Contract staffing", "CV screening"],
    makesOffer: [
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Permanent IT recruitment", description: "Recruiter-screened shortlists for technology roles. The fee is a percentage of annual salary, charged when the hire joins, with a 60-day replacement guarantee." } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Contract and temporary staffing", description: "Short-term and project hires for technology teams." } },
      { "@type": "Offer", price: "0", priceCurrency: "INR", itemOffered: { "@type": "Service", name: "CV registration and job applications for candidates", description: "Candidates register a CV and apply for jobs free of charge." } },
    ],
  };
  const website = { "@context": "https://schema.org", "@type": "WebSite", name: "Jobboard300", alternateName: "Job Board 300", url, publisher: { "@id": `${url}/#agency` }, inLanguage: "en-IN" };
  const faq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) };
  return <><HomeClient initialJobs={listings.jobs} initialLocations={listings.locations} initialLoaded={initialLoaded} /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(company).replace(/</g, "\\u003c") }} /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(website).replace(/</g, "\\u003c") }} /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq).replace(/</g, "\\u003c") }} /></>;
}
