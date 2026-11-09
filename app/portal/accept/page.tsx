import AuthFrame from "../auth-frame";
import { Accept } from "../forms";

export const metadata = { title: "Set up your account" };
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <AuthFrame title="Set up your hiring account">{token ? <Accept token={token} /> : <p className="pj-notice bad">This link is incomplete. Ask Job Point or your company owner for a new one.</p>}</AuthFrame>;
}
