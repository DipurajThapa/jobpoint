import { redirect } from "next/navigation";
import { pageUser } from "@/lib/platform/auth";
import AuthCard from "../auth-card";
import { SignInForm } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const next = params.next && params.next.startsWith("/platform") && !params.next.startsWith("//") ? params.next : null;
  if (await pageUser()) redirect(next ?? "/platform");
  return <AuthCard title="Sign in" intro="For authorised Jobboard300 team members.">
    <SignInForm next={next} signedOut={params.signed_out === "1"} errorCode={params.error} />
    <div className="wp-auth-foot">
      <a href="/platform/forgot">Forgot password?</a>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full page load back to the public site */}
      <a href="/">Back to website</a>
    </div>
  </AuthCard>;
}
