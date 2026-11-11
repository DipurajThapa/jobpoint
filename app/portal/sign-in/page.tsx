import AccessFrame from "../access-frame";
import { SignIn } from "../forms";

export const metadata = { title: "Account sign in" };
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; inactive?: string; kind?: string }> }) {
  const { next, inactive, kind } = await searchParams;
  const company = kind === "company" || (!kind && (next === "/company" || next?.startsWith("/company/")));
  return <AccessFrame kind={company ? "company" : "candidate"} mode="sign-in">
    <p className="pj-muted">{company ? "Use the email linked to your company's hiring account." : "Use the email linked to your candidate account."}</p>
    {inactive === "1" && <p className="pj-notice bad" role="alert">This company account is not active. Contact Jobboard300 to have it reactivated.</p>}
    <SignIn next={next ?? ""} kind={company ? "company" : "candidate"} />
  </AccessFrame>;
}
