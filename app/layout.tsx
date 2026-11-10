import { DEMO_MODE } from "@/lib/demo";
import type { Metadata } from "next";
import "./globals.css";

import { SITE_URL as siteUrl } from "@/lib/site";
const fontsUrl = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,400,0,0&display=swap";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  alternates: { canonical: "/" },
  title: { default: "Jobboard300 | Job board and recruitment consultancy for IT and non-IT roles", template: "%s | Jobboard300" },
  description: "Jobboard300 is a job board and recruitment consultancy for IT and non-IT professionals. Upload your CV free, or hire screened talent and pay only on placement.",
  applicationName: "Jobboard300",
  keywords: ["Jobboard300", "job board", "Jobboard300 job board", "Job Board 300", "IT jobs", "software developer jobs", "non-IT jobs", "finance and accounts jobs", "sales jobs", "upload CV for jobs", "recruitment consultancy", "IT recruitment agency", "placement consultancy", "hire software developers", "hiring solutions for companies", "recruitment with replacement guarantee"],
  openGraph: { type: "website", url: siteUrl, siteName: "Jobboard300", locale: "en_IN", title: "Jobboard300 | Job board and recruitment consultancy", description: "Find IT and non-IT professional jobs, or hire recruiter-screened talent and pay only on a successful placement.", images: ["/images/career-conversation.webp"] },
  twitter: { card: "summary_large_image", title: "Jobboard300 | Job board and recruitment consultancy", description: "Jobs for professionals. Screened shortlists for employers, with one free replacement within 60 days." },
  robots: { index: !DEMO_MODE, follow: !DEMO_MODE, googleBot: { index: !DEMO_MODE, follow: !DEMO_MODE, "max-image-preview": "large" } },
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/icon-192.png", type: "image/png", sizes: "192x192" }],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={fontsUrl} />
      </head>
      <body className="antialiased">{DEMO_MODE && <div className="demo-banner"><div className="container"><strong>Website demo</strong><span>Explore the design. Submissions and CV uploads are disabled.</span></div></div>}{children}</body>
    </html>
  );
}
