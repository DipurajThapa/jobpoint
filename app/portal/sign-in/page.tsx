import AuthFrame from "../auth-frame";
import { SignIn } from "../forms";

export const metadata = { title: "Sign in" };
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthFrame title="Sign in" intro="For candidates and hiring companies."><SignIn next={next ?? ""} /></AuthFrame>;
}
