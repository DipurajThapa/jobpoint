import { apiError, apiJson, authorizeApi } from "@/lib/platform/auth";
import { TOOL, readState } from "@/lib/email-kit/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await authorizeApi(request, { tool: TOOL, min: "view" });
  if (user instanceof Response) return user;
  try {
    const { rev, state } = await readState();
    return apiJson({ rev, state, access: user.access[TOOL], user: { id: user.id, name: user.name || user.email } });
  } catch { return apiError("Email Kit records are temporarily unavailable.", 503); }
}
