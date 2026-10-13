import { listPublicJobs } from "@/lib/public-jobs";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
    const location = (url.searchParams.get("location") ?? "").trim().slice(0, 100);
    return json(await listPublicJobs(q, location));
  } catch { return json({ error: "Job listings are temporarily unavailable." }, 503); }
}
