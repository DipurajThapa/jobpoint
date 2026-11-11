import { DEMO_MODE } from "@/lib/demo";
import Arrival from "@/components/arrival";
import type { Metadata } from "next";
import "./globals.css";

import { SITE_URL as siteUrl } from "@/lib/site";
// Two requests: the text font may swap in late; the icon font blocks briefly instead,
// so icon names such as "north_east" are not shown as words while it loads.
const textFontUrl = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700&family=Roboto:wght@400;500;600;700&display=swap";
const iconFontUrl = "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,400,0,0&display=block";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  alternates: { canonical: "/" },
  title: { default: "Accounts, Sales & Support Jobs and Hiring | Jobboard300", template: "%s | Jobboard300" },
  description: "Jobboard300 recruits for accounts, sales and customer support roles. Register your CV free, or send a hiring enquiry.",
  applicationName: "Jobboard300",
  openGraph: { type: "website", url: siteUrl, siteName: "Jobboard300", locale: "en_IN", title: "Accounts, Sales & Support Jobs and Hiring | Jobboard300", description: "Find accounts, sales and support jobs, or hire through recruiter-screened shortlists. CV registration and applications are free.", images: ["/images/career-conversation.webp"] },
  twitter: { card: "summary_large_image", title: "Accounts, Sales & Support Jobs and Hiring | Jobboard300", description: "Find accounts, sales and support jobs, or hire through recruiter-screened shortlists. CV registration and applications are free.", images: ["/images/career-conversation.webp"] },
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
      <body className="antialiased"><Arrival />{DEMO_MODE && <div className="demo-banner"><div className="container"><strong>Website demo</strong><span>Explore the design. Submissions and CV uploads are disabled.</span></div></div>}{children}</body>
    </html>
  );
}
