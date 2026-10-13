import { DEMO_MODE } from "@/lib/demo";
import type { Metadata } from "next";
import "./globals.css";

const siteUrl = "https://job-point-consultancy.dippurajthapa.chatgpt.site";
const fontsUrl = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,400,0,0&display=swap";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  alternates: { canonical: "/" },
  title: { default: "Job Point Consultancy | Recruitment & Jobs in India", template: "%s | Job Point Consultancy" },
  description: "Find your next opportunity or hire with Job Point Consultancy. People-first recruitment support from Durgapur, West Bengal, connecting talent and employers across India.",
  keywords: ["recruitment consultancy Durgapur", "jobs in West Bengal", "job placement consultancy India", "hiring support India", "Job Point Consultancy"],
  openGraph: { type: "website", url: siteUrl, locale: "en_IN", title: "Job Point Consultancy", description: "Thoughtful recruitment support for candidates and employers across India.", images: ["/images/career-conversation.webp"] },
  twitter: { card: "summary_large_image", title: "Job Point Consultancy", description: "Find your next opportunity or hire with confidence." },
  robots: { index: !DEMO_MODE, follow: !DEMO_MODE, googleBot: { index: !DEMO_MODE, follow: !DEMO_MODE, "max-image-preview": "large" } },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/images/job-point-light.png",
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
