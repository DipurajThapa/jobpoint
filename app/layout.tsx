import { DEMO_MODE } from "@/lib/demo";
import type { Metadata } from "next";
import "./globals.css";

const siteUrl = "https://jobboard300.dippurajthapa.chatgpt.site";
const fontsUrl = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,400,0,0&display=swap";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  alternates: { canonical: "/" },
  title: { default: "Jobboard300 | IT job board and recruitment consultancy in Kolkata, India", template: "%s | Jobboard300" },
  description: "Jobboard300 is a job board for IT jobs in India and a recruitment consultancy in Kolkata. Upload your CV free, or hire screened IT talent and pay on joining.",
  applicationName: "Jobboard300",
  keywords: ["Jobboard300", "job board", "Jobboard300 job board", "Job Board 300", "IT jobs in Kolkata", "IT jobs in India", "software developer jobs", "upload CV for IT jobs", "IT recruitment agency in Kolkata", "recruitment consultancy Kolkata", "placement consultancy India", "IT staffing", "hire software developers in India", "hiring solutions for companies"],
  openGraph: { type: "website", url: siteUrl, siteName: "Jobboard300", locale: "en_IN", title: "Jobboard300 | IT job board and recruitment consultancy", description: "Find IT jobs across India, or hire screened IT talent through a Kolkata recruiter and pay only when your hire joins.", images: ["/images/career-conversation.webp"] },
  twitter: { card: "summary_large_image", title: "Jobboard300 | IT job board and recruitment consultancy", description: "IT jobs for candidates. Screened shortlists for employers, with a 60-day replacement guarantee." },
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
