import PublicLinkPage from "@/components/public-link-page";
import "../portal/portal.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your test", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return <PublicLinkPage kind="test" token={(await searchParams).token ?? ""} />;
}
