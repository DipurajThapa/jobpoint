import { env } from "cloudflare:workers";
import { isOwnerRequest } from "@/lib/admin";
import { clean, errorJson, json, sameOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";
const statuses = ["new", "verifying", "in_progress", "completed", "declined"];

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return errorJson("Cross-site requests are not accepted.", 403);
  if (!await isOwnerRequest(request)) return errorJson("Sign-in required.", 401);
  const { id } = await context.params;
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 4_000) return errorJson("Request too large.", 413);
    const body = await request.json() as Record<string, unknown>;
    const status = clean(body.status, 30), note = clean(body.resolutionNote, 1200);
    if (!statuses.includes(status)) return errorJson("Invalid status.");
    if (["completed", "declined"].includes(status) && (!note || body.identityVerified !== true)) return errorJson("Verify the requester and record the outcome before closing.");
    const existing = await env.DB!.prepare("SELECT id FROM privacy_requests WHERE id = ?").bind(id).first();
    if (!existing) return errorJson("Request not found.", 404);
    await env.DB!.batch([
      env.DB!.prepare("UPDATE privacy_requests SET status = ?, resolution_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(status, note, id),
      env.DB!.prepare("INSERT INTO audit_events (id, actor_id, action, target_type, target_id) VALUES (?, ?, 'privacy_request.updated', 'privacy_request', ?)").bind(crypto.randomUUID(), request.headers.get("oai-authenticated-user-id"), id),
    ]);
    return json({ message: "Privacy request updated." });
  } catch { return errorJson("The request could not be updated.", 503); }
}
