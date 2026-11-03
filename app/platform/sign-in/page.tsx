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
  return <AuthCard title="Sign in" intro="For authorised Job Point team members.">
    <SignInForm next={next} signedOut={params.signed_out === "1"} />
    <div className="wp-auth-foot"><a href="/platform/forgot">Forgot password?</a><a href="/">Back to website</a></div>
  </AuthCard>;
}
