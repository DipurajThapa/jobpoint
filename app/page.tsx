import HomeClient from "./home-client";
import { listPublicJobs } from "@/lib/public-jobs";
import { faqs } from "@/lib/faqs";

export const dynamic = "force-dynamic";

export default async function Home() {
  let listings: Awaited<ReturnType<typeof listPublicJobs>>;
  let initialLoaded = true;
  try { listings = await listPublicJobs(); }
  catch { listings = { jobs: [], locations: [] }; initialLoaded = false; }
  const company = { "@context": "https://schema.org", "@type": "EmploymentAgency", name: "Job Point Consultancy", description: "Recruitment consultancy based at Webel IT Park in Durgapur, West Bengal, connecting job seekers and employers across India.", areaServed: { "@type": "Country", name: "India" }, address: { "@type": "PostalAddress", addressLocality: "Durgapur", addressRegion: "West Bengal", addressCountry: "IN" }, knowsAbout: ["Recruitment", "Candidate screening", "Hiring support", "Job search support"] };
  const faq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) };
  return <><HomeClient initialJobs={listings.jobs} initialLocations={listings.locations} initialLoaded={initialLoaded} /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(company).replace(/</g, "\\u003c") }} /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq).replace(/</g, "\\u003c") }} /></>;
}
