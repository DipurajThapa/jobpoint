import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Job Point Consultancy | Recruitment & Jobs in India", template: "%s | Job Point Consultancy" },
  description: "Find your next opportunity or hire with Job Point Consultancy. People-first recruitment support from Durgapur, West Bengal, connecting talent and employers across India.",
  keywords: ["recruitment consultancy Durgapur", "jobs in West Bengal", "job placement consultancy India", "hiring support India", "Job Point Consultancy"],
  openGraph: { type: "website", locale: "en_IN", title: "Job Point Consultancy", description: "Thoughtful recruitment support for candidates and employers across India.", images: ["/images/career-conversation.webp"] },
  twitter: { card: "summary_large_image", title: "Job Point Consultancy", description: "Find your next opportunity or hire with confidence." },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  icons: {
    icon: "/images/job-point-light.png",
    shortcut: "/images/job-point-light.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
