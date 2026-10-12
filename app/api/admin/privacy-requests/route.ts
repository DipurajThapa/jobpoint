import { env } from "cloudflare:workers";
import { isOwnerRequest } from "@/lib/admin";
import { errorJson, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!await isOwnerRequest(request)) return errorJson("Sign-in required.", 401);
  try {
    const [requests, activity] = await Promise.all([
      env.DB!.prepare("SELECT id, request_type AS requestType, requester_name AS requesterName, email, details, status, resolution_note AS resolutionNote, created_at AS createdAt FROM privacy_requests ORDER BY created_at DESC LIMIT 100").all(),
      env.DB!.prepare("SELECT action, target_type AS targetType, target_id AS targetId, created_at AS createdAt FROM audit_events ORDER BY created_at DESC LIMIT 50").all(),
    ]);
    return json({ requests: requests.results, activity: activity.results });
  } catch { return errorJson("Privacy records are temporarily unavailable.", 503); }
}
