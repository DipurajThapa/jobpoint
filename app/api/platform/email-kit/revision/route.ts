import { apiError, apiJson, authorizeApi } from "@/lib/platform/auth";
import { TOOL, currentRev } from "@/lib/email-kit/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await authorizeApi(request, { tool: TOOL, min: "view" });
  if (user instanceof Response) return user;
  try { return apiJson({ rev: await currentRev() }); } catch { return apiError("Email Kit records are temporarily unavailable.", 503); }
}
