import { DEMO_MODE } from "@/lib/demo";
import type { Metadata } from "next";
import "./globals.css";

import { SITE_URL as siteUrl } from "@/lib/site";
// Two requests: the text font may swap in late; the icon font blocks briefly instead,
// so icon names such as "north_east" are not shown as words while it loads.
const textFontUrl = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";
const iconFontUrl = "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,400,0,0&display=block";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  alternates: { canonical: "/" },
  title: { default: "Jobboard300 | Job board and recruitment agency in Kolkata", template: "%s | Jobboard300" },
  description: "Jobboard300 is a job board and recruitment consultancy in Kolkata for IT and office roles. Register your CV free, or send a short hiring enquiry.",
  applicationName: "Jobboard300",
  openGraph: { type: "website", url: siteUrl, siteName: "Jobboard300", locale: "en_IN", title: "Jobboard300 | Jobs and recruitment in Kolkata", description: "Find IT and office jobs, or hire through a recruiter who screens every candidate. A recruitment consultancy in Kolkata. Free for job seekers.", images: ["/images/career-conversation.webp"] },
  twitter: { card: "summary_large_image", title: "Jobboard300 | Jobs and recruitment in Kolkata", description: "Jobs for professionals and screened shortlists for employers, from a recruitment consultancy in Kolkata. Free for job seekers.", images: ["/images/career-conversation.webp"] },
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
    <html lang="en-IN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={textFontUrl} />
        <link rel="stylesheet" href={iconFontUrl} />
      </head>
      <body className="antialiased">{DEMO_MODE && <div className="demo-banner"><div className="container"><strong>Website demo</strong><span>Explore the design. Submissions and CV uploads are disabled.</span></div></div>}{children}</body>
    </html>
  );
}
