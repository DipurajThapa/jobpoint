import AccessFrame from "../access-frame";
import Link from "@/components/app-link";
export const metadata = { title: "Create an account", robots: { index: false, follow: true } };
export default async function Page({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const company = (await searchParams).kind === "company";
  return <AccessFrame kind={company ? "company" : "candidate"} mode="register"><p>Create your {company ? "business" : "candidate"} account using the registration pop-up.</p><Link className="wp-btn" href={`/portal/register?kind=${company ? "company" : "candidate"}`}>Open registration form</Link><p>Already registered? <Link href={`/portal/sign-in?kind=${company ? "company" : "candidate"}`}>Sign in</Link></p></AccessFrame>;
}
