import AuthFrame from "../auth-frame";
import { SignIn } from "../forms";

export const metadata = { title: "Sign in" };
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; inactive?: string }> }) {
  const { next, inactive } = await searchParams;
  return <AuthFrame title="Sign in" intro="For candidates and hiring companies.">
    {inactive === "1" && <p className="pj-notice bad" role="alert">This company account is not active. Contact Jobboard300 to have it reactivated.</p>}
    <SignIn next={next ?? ""} />
  </AuthFrame>;
}
