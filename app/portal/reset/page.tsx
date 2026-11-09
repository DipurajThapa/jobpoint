import AuthFrame from "../auth-frame";
import { Reset } from "../forms";

export const metadata = { title: "Choose a new password" };
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <AuthFrame title="Choose a new password">{token ? <Reset token={token} /> : <p className="pj-notice bad">This link is incomplete.</p>}</AuthFrame>;
}
