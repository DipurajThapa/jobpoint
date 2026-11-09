import AuthFrame from "../auth-frame";
import { Verify } from "../forms";

export const metadata = { title: "Verify email" };
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <AuthFrame title="Verify your email">{token ? <Verify token={token} /> : <p className="pj-notice bad">This link is incomplete.</p>}</AuthFrame>;
}
