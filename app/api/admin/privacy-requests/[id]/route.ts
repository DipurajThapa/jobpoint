import { env } from "cloudflare:workers";
import { isOwnerRequest } from "@/lib/admin";
import { clean, errorJson, json, sameOrigin } from "@/lib/http";
import { portalDb } from "@/lib/portal/session";
import { eraseByEmail } from "@/lib/portal/candidate";

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
    const existing = await env.DB!.prepare("SELECT id, request_type, email, erased_at FROM privacy_requests WHERE id = ?").bind(id).first<{ id: string; request_type: string; email: string; erased_at: string | null }>();
    if (!existing) return errorJson("Request not found.", 404);
    // Carry out a verified deletion request here, so "completed" means the data is gone in every record we hold.
    let erased = "";
    if (body.erase === true) {
      if (existing.request_type !== "deletion") return errorJson("Only a deletion request can erase data.");
      if (status !== "completed" || body.identityVerified !== true) return errorJson("Verify the requester and mark the request completed to erase their data.");
      if (existing.erased_at) return errorJson("The data for this request has already been erased.", 409);
      if (!env.BUCKET) return errorJson("File storage is unavailable; nothing has been erased.", 503);
      const actor = request.headers.get("oai-authenticated-user-id") ?? "owner";
      const out = await eraseByEmail(portalDb(), existing.email, actor);
      for (const key of out.r2Keys) await env.BUCKET.delete(key);
      erased = `${out.candidates} candidate record(s), ${out.applications} website application(s), ${out.r2Keys.length} stored file(s)`;
      await env.DB!.prepare("UPDATE privacy_requests SET erased_at = ?, erasure_summary = ? WHERE id = ?").bind(new Date().toISOString(), erased, id).run();
    }
    await env.DB!.batch([
      env.DB!.prepare("UPDATE privacy_requests SET status = ?, resolution_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(status, note, id),
      env.DB!.prepare("INSERT INTO audit_events (id, actor_id, action, target_type, target_id) VALUES (?, ?, 'privacy_request.updated', 'privacy_request', ?)").bind(crypto.randomUUID(), request.headers.get("oai-authenticated-user-id"), id),
    ]);
    return json({ message: erased ? `Privacy request completed. Erased: ${erased}.` : "Privacy request updated." });
  } catch { return errorJson("The request could not be updated.", 503); }
}
