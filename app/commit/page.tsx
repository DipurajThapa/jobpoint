import PublicLinkPage from "@/components/public-link-page";
import "../portal/portal.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your commitment", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return <PublicLinkPage kind="commitment" token={(await searchParams).token ?? ""} />;
}
