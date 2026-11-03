import { apiError, apiJson, authorizeApi } from "@/lib/platform/auth";
import { Refusal, TOOL, commit } from "@/lib/email-kit/server";

export const dynamic = "force-dynamic";
const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await authorizeApi(request, { tool: TOOL, min: "edit", mutate: true });
  if (user instanceof Response) return user;
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) return apiError("Send JSON.", 415);
  const text = await request.text();
  if (text.length > MAX_BYTES) return apiError("This change is larger than 20 MB, so nothing was saved. Restore a smaller backup or ask for help.", 413, "TOO_LARGE");
  let body: unknown;
  try { body = JSON.parse(text); } catch { return apiError("The request was not readable."); }
  try {
    return apiJson({ rev: await commit(body, user) });
  } catch (e) {
    if (e instanceof Refusal) return apiError(e.message, e.status, e.code);
    return apiError("Email Kit could not save this change. Nothing was saved.", 503);
  }
}
