import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { applications } from "@/db/schema";
import { isOwnerRequest } from "@/lib/admin";
import { errorJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await isOwnerRequest(request)) return errorJson("Sign-in required.", 401);
  const { id } = await context.params;
  const [record] = await getDb().select().from(applications).where(eq(applications.id, id)).limit(1);
  if (!record?.resumeKey || !env.BUCKET) return errorJson("Resume not found.", 404);
  const object = await env.BUCKET.get(record.resumeKey);
  if (!object) return errorJson("Resume not found.", 404);
  await env.DB!.prepare("INSERT INTO audit_events (id, actor_id, action, target_type, target_id) VALUES (?, ?, 'cv.downloaded', 'application', ?)")
    .bind(crypto.randomUUID(), request.headers.get("oai-authenticated-user-id"), id).run();
  const safeName = (record.resumeName ?? "resume").replace(/["\r\n]/g, "_");
  return new Response(object.body, { headers: { "content-type": "application/octet-stream", "content-length": String(object.size), "content-disposition": `attachment; filename="${safeName}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "sandbox" } });
}
