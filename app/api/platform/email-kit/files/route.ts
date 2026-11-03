import { apiError, apiJson, authorizeApi, db } from "@/lib/platform/auth";
import { TOOL, deleteFiles, validFileId } from "@/lib/email-kit/server";
import { levelAtLeast } from "@/lib/platform/tools";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await authorizeApi(request, { tool: TOOL, min: "view" });
  if (user instanceof Response) return user;
  const rows = await db().prepare("SELECT id FROM email_kit_files").all<{ id: string }>();
  return apiJson({ ids: (rows.results ?? []).map(r => r.id) });
}

// { action: "delete", ids } removes unused attachments; { action: "erase" } (Manage) removes every unused one.
export async function POST(request: Request) {
  const user = await authorizeApi(request, { tool: TOOL, min: "edit", mutate: true });
  if (user instanceof Response) return user;
  let body: { action?: unknown; ids?: unknown };
  try { body = await request.json(); } catch { return apiError("The request was not readable."); }
  if (body.action === "erase") {
    if (!levelAtLeast(user.access[TOOL], "manage")) return apiError("This needs Manage access to Email Kit.", 403, "LEVEL");
    return apiJson({ deleted: await deleteFiles("all", user, 10 * 60_000) });
  }
  if (body.action === "delete" && Array.isArray(body.ids)) {
    const ids = body.ids.filter((id): id is string => typeof id === "string" && validFileId(id)).slice(0, 1000);
    return apiJson({ deleted: await deleteFiles(ids, user, 24 * 3600_000) });
  }
  return apiError("Unknown action.");
}
