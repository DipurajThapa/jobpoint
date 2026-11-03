import { apiError, apiJson, authorizeApi } from "@/lib/platform/auth";
import { TOOL, summary } from "@/lib/email-kit/server";

export const dynamic = "force-dynamic";

// Record counts per type, for checking a migration against the backup.
export async function GET(request: Request) {
  const user = await authorizeApi(request, { tool: TOOL, min: "manage" });
  if (user instanceof Response) return user;
  try { return apiJson(await summary()); } catch { return apiError("Email Kit records are temporarily unavailable.", 503); }
}
