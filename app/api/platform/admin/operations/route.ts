import { apiError, apiJson, auditStatement, authorizeApi, db, newId, nowIso } from "@/lib/platform/auth";
import { decryptToken, encryptToken, endpointProblem } from "@/lib/platform/integrations";
import { TOOLS } from "@/lib/platform/tools";

export const dynamic = "force-dynamic";
type Integration = { id: string; name: string; kind: "api" | "mcp"; endpoint: string; enabled: number; encrypted_token: string };

export async function GET(request: Request) {
  const admin = await authorizeApi(request, { admin: true });
  if (admin instanceof Response) return admin;
  const [counts, teams, memberships, integrations, checks, settings, features, activity, usage] = await Promise.all([
    db().prepare(`SELECT (SELECT count(*) FROM platform_users WHERE status='active') activeUsers,
      (SELECT count(*) FROM platform_sessions WHERE datetime(expires_at) > datetime('now')) sessions,
      (SELECT count(*) FROM email_kit_records WHERE tbl='convs') conversations,
      (SELECT count(*) FROM audit_events WHERE created_at >= datetime('now','-7 days')) events,
      (SELECT count(*) FROM platform_integrations WHERE enabled=1) integrations`).first(),
    db().prepare("SELECT id,name,description,created_at createdAt FROM platform_teams ORDER BY name").all(),
    db().prepare("SELECT m.team_id teamId,m.user_id userId,u.email FROM platform_team_members m JOIN platform_users u ON u.id=m.user_id ORDER BY u.email").all(),
    db().prepare("SELECT id,name,kind,endpoint,enabled,encrypted_token FROM platform_integrations ORDER BY name").all<Integration>(),
    db().prepare("SELECT c.integration_id integrationId,c.status,c.http_status httpStatus,c.message,c.checked_at checkedAt FROM platform_integration_checks c WHERE c.id IN (SELECT id FROM platform_integration_checks x WHERE x.integration_id=c.integration_id ORDER BY checked_at DESC LIMIT 1)").all(),
    db().prepare("SELECT key,value FROM platform_settings").all<{key:string;value:string}>(),
    db().prepare("SELECT tool_key toolKey,enabled FROM platform_features").all(),
    db().prepare("SELECT a.created_at createdAt,a.actor_id actorId,a.action,a.target_type targetType,a.target_id targetId FROM audit_events a ORDER BY a.created_at DESC LIMIT 100").all(),
    db().prepare("SELECT action,count(*) total FROM audit_events WHERE action LIKE 'email_kit.%' AND created_at >= datetime('now','-30 days') GROUP BY action ORDER BY total DESC LIMIT 20").all(),
  ]);
  return apiJson({ counts, teams:teams.results, memberships:memberships.results,
    integrations:(integrations.results || []).map(({encrypted_token,...row}) => ({...row,hasCredential:!!encrypted_token})),
    checks:checks.results, settings:Object.fromEntries((settings.results || []).map(r=>[r.key,r.value])), features:features.results,
    activity:activity.results, usage:usage.results, availableTools:TOOLS.map(t=>({key:t.key,name:t.name})) });
}

export async function POST(request: Request) {
  const admin = await authorizeApi(request, { admin:true, mutate:true });
  if (admin instanceof Response) return admin;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return apiError("The request was not readable."); }
  const action = String(body.action || "");
  const id = String(body.id || "");
  const now = nowIso();
  const actor = `platform:${admin.id}`;
  if (action === "team.create") {
    const name = String(body.name || "").trim().slice(0,100), description = String(body.description || "").trim().slice(0,300);
    if (!name) return apiError("Enter a team name.");
    const teamId = newId("team");
    try { await db().batch([db().prepare("INSERT INTO platform_teams (id,name,description,created_at,updated_at) VALUES (?,?,?,?,?)").bind(teamId,name,description,now,now),auditStatement(actor,action,"team",teamId)]); }
    catch { return apiError("A team with that name may already exist.",409); }
    return apiJson({ok:true,id:teamId},201);
  }
  if (action === "team.assign") {
    const userId = String(body.userId || "");
    const [team,user] = await Promise.all([db().prepare("SELECT id FROM platform_teams WHERE id=?").bind(id).first(),db().prepare("SELECT id FROM platform_users WHERE id=?").bind(userId).first()]);
    if (!team || !user) return apiError("Select an existing team and user.",404);
    await db().batch([db().prepare("INSERT OR IGNORE INTO platform_team_members(team_id,user_id) VALUES (?,?)").bind(id,userId),auditStatement(actor,action,"team",id,`user:${userId}`)]);
    return apiJson({ok:true});
  }
  if (action === "team.unassign" || action === "team.delete") {
    if (!await db().prepare("SELECT id FROM platform_teams WHERE id=?").bind(id).first()) return apiError("Team not found.",404);
    await db().batch([action === "team.delete" ? db().prepare("DELETE FROM platform_teams WHERE id=?").bind(id) : db().prepare("DELETE FROM platform_team_members WHERE team_id=? AND user_id=?").bind(id,String(body.userId || "")),auditStatement(actor,action,"team",id)]);
    return apiJson({ok:true});
  }
  if (action === "setting.invites") {
    const value = body.value === true ? "true" : "false";
    await db().batch([db().prepare("INSERT INTO platform_settings(key,value,updated_at,updated_by) VALUES ('invites_enabled',?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by").bind(value,now,admin.id),auditStatement(actor,action,"setting","invites_enabled",value)]);
    return apiJson({ok:true});
  }
  if (action === "feature.toggle") {
    if (!TOOLS.some(t=>t.key===id)) return apiError("Unknown tool.");
    const enabled = body.enabled === true ? 1 : 0;
    await db().batch([db().prepare("INSERT INTO platform_features(tool_key,enabled,updated_at,updated_by) VALUES (?,?,?,?) ON CONFLICT(tool_key) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at,updated_by=excluded.updated_by").bind(id,enabled,now,admin.id),auditStatement(actor,action,"tool",id,enabled ? "enabled" : "disabled")]);
    return apiJson({ok:true});
  }
  if (action === "integration.save") {
    const name = String(body.name || "").trim().slice(0,100), kind = body.kind;
    const endpoint = String(body.endpoint || "").trim(), token = String(body.token || "");
    if (!name || !["api","mcp"].includes(String(kind))) return apiError("Enter a name and connection type.");
    const problem = endpointProblem(endpoint);
    if (problem) return apiError(problem);
    if (token.length > 4000) return apiError("The credential is too long.");
    const old = id ? await db().prepare("SELECT id,endpoint FROM platform_integrations WHERE id=?").bind(id).first<{id:string;endpoint:string}>() : null;
    if (id && !old) return apiError("Connection not found.",404);
    let encrypted = "";
    try { if (token) encrypted = await encryptToken(token); } catch { return apiError("Secure credential storage is unavailable. Configure the server encryption key before adding a credential.",503); }
    const key = old ? id : newId("conn");
    if (old) {
      await db().batch([db().prepare("UPDATE platform_integrations SET name=?,kind=?,endpoint=?,encrypted_token=CASE WHEN ?='' AND ?=? THEN encrypted_token ELSE ? END,enabled=0,updated_at=? WHERE id=?").bind(name,kind,endpoint,encrypted,old.endpoint,endpoint,encrypted,now,key),auditStatement(actor,action,"integration",key)]);
    } else {
      await db().batch([db().prepare("INSERT INTO platform_integrations(id,name,kind,endpoint,encrypted_token,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").bind(key,name,kind,endpoint,encrypted,now,now),auditStatement(actor,action,"integration",key)]);
    }
    return apiJson({ok:true,id:key});
  }
  if (action.startsWith("integration.")) {
    const row = await db().prepare("SELECT * FROM platform_integrations WHERE id=?").bind(id).first<Integration>();
    if (!row) return apiError("Connection not found.",404);
    if (action === "integration.delete") {
      await db().batch([db().prepare("DELETE FROM platform_integrations WHERE id=?").bind(id),auditStatement(actor,action,"integration",id)]);
      return apiJson({ok:true});
    }
    if (action === "integration.toggle") {
      const enabled = body.enabled === true;
      if (enabled && !await db().prepare("SELECT c.id FROM platform_integration_checks c JOIN platform_integrations i ON i.id=c.integration_id WHERE c.integration_id=? AND c.status='healthy' AND datetime(c.checked_at)>datetime('now','-1 day') AND c.checked_at>i.updated_at ORDER BY c.checked_at DESC LIMIT 1").bind(id).first()) return apiError("Test this connection successfully after its latest change before enabling it.");
      await db().batch([db().prepare("UPDATE platform_integrations SET enabled=?,updated_at=? WHERE id=?").bind(enabled ? 1 : 0,now,id),auditStatement(actor,action,"integration",id,enabled ? "enabled" : "disabled")]);
      return apiJson({ok:true});
    }
    if (action === "integration.test") {
      if (endpointProblem(row.endpoint)) return apiError("The connection URL is no longer allowed.");
      let status = "unhealthy", httpStatus:number|null = null, message = "Connection failed", tools:string[] = [];
      try {
        const token = await decryptToken(row.encrypted_token);
        const headers:Record<string,string> = {accept:"application/json",...(token ? {authorization:`Bearer ${token}`} : {})};
        const response = await fetch(row.endpoint, {method:row.kind === "mcp" ? "POST" : "GET",redirect:"error",signal:AbortSignal.timeout(5000),headers:row.kind === "mcp" ? {...headers,"content-type":"application/json"} : headers,
          ...(row.kind === "mcp" ? {body:JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2025-03-26",capabilities:{},clientInfo:{name:"Jobboard300 Working Platform",version:"1.0"}}})} : {})});
        httpStatus = response.status;
        if (response.ok && row.kind === "mcp") {
          const payload = await response.json() as {result?:{capabilities?:{tools?:unknown}}};
          if (!payload.result?.capabilities) throw new Error("MCP initialize returned no capabilities.");
          tools = payload.result.capabilities.tools ? ["Tool discovery supported"] : [];
        }
        status = response.ok ? "healthy" : "unhealthy";
        message = response.ok ? (row.kind === "mcp" ? "MCP handshake succeeded" : "HTTP health check succeeded") : `HTTP ${response.status}`;
      } catch { message = "Connection failed or timed out. Check the endpoint and credential."; }
      await db().batch([db().prepare("INSERT INTO platform_integration_checks(id,integration_id,status,http_status,message,checked_at,checked_by) VALUES (?,?,?,?,?,?,?)").bind(newId("check"),id,status,httpStatus,message,now,admin.id),auditStatement(actor,action,"integration",id,status)]);
      return apiJson({ok:status === "healthy",status,httpStatus,message,tools});
    }
  }
  return apiError("Unknown administration action.");
}
