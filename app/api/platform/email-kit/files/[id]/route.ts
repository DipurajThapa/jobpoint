import { apiError, apiJson, authorizeApi } from "@/lib/platform/auth";
import { Refusal, TOOL, getFile, putFile, validFileId } from "@/lib/email-kit/server";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const user = await authorizeApi(request, { tool: TOOL, min: "view" });
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!validFileId(id)) return apiError("Not found.", 404);
  const file = await getFile(id);
  return file ? apiJson(file) : apiError("Not found.", 404);
}

export async function PUT(request: Request, { params }: Params) {
  const user = await authorizeApi(request, { tool: TOOL, min: "edit", mutate: true });
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!validFileId(id)) return apiError("The file id is not valid.");
  const text = await request.text();
  if (text.length > 7_400_000) return apiError("The attachment is larger than 5 MB.", 413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return apiError("The request was not readable."); }
  try { return apiJson(await putFile(id, body, user)); }
  catch (e) {
    if (e instanceof Refusal) return apiError(e.message, e.status, e.code);
    console.error("Email Kit attachment not stored:", e instanceof Error ? e.message : String(e));
    return apiError("The attachment could not be stored.", 503);
  }
}
