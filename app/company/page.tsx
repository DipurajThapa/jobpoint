import { requirePage } from "@/lib/portal/session";
import CompanyApp from "./company-app";

export const metadata = { title: "Hiring dashboard" };

export default async function Page() {
  await requirePage("company", "/company");
  return <CompanyApp />;
}
