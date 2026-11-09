import { requirePage } from "@/lib/portal/session";
import CandidateApp from "./candidate-app";

export const metadata = { title: "My CV and privacy" };

export default async function Page() {
  await requirePage("candidate", "/candidate");
  return <CandidateApp />;
}
