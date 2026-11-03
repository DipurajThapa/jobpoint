import { apiError, apiJson, authorizeApi } from "@/lib/platform/auth";
import { Refusal, TOOL, createSnapshot, listSnapshots, snapshotData } from "@/lib/email-kit/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await authorizeApi(request, { tool: TOOL, min: "view" });
  if (user instanceof Response) return user;
  const id = new URL(request.url).searchParams.get("id");
  if (id) { const snap = await snapshotData(id); return snap ? apiJson(snap) : apiError("Not found.", 404); }
  return apiJson({ snapshots: await listSnapshots() });
}

// The server builds today's recovery copy from its own records (at most once a day).
export async function POST(request: Request) {
  const user = await authorizeApi(request, { tool: TOOL, min: "edit", mutate: true });
  if (user instanceof Response) return user;
  let body: { today?: unknown };
  try { body = await request.json(); } catch { return apiError("The request was not readable."); }
  try { return apiJson(await createSnapshot(body.today, user)); }
  catch (e) { return e instanceof Refusal ? apiError(e.message, e.status, e.code) : apiError("The recovery copy could not be saved.", 503); }
}
