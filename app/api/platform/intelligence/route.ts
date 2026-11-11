import { db, apiError, apiJson, authorizeApi, audit } from "@/lib/platform/auth";
import { readLimitedJson } from "@/lib/intake-security";
import { AUDIENCES, OPPORTUNITY_STATES, PRIORITIES, RELIABILITY, SOURCE_CATEGORIES, externalUrl, oneOf, verifiedEvidence, words } from "@/lib/intelligence";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await authorizeApi(request, { admin: true });
  if (actor instanceof Response) return actor;
  const [sources, opportunities, articles, engagement] = await Promise.all([
    db().prepare(`SELECT id,name,url,category,coverage,feed_url AS feedUrl,reliability,review_notes AS reviewNotes,last_checked_at AS lastCheckedAt,updated_at AS updatedAt FROM intelligence_sources ORDER BY updated_at DESC LIMIT 300`).all(),
    db().prepare(`SELECT id,title,summary,audience,category,priority,status,primary_url AS primaryUrl,corroboration_url AS corroborationUrl,evidence_notes AS evidenceNotes,source_id AS sourceId,blog_slug AS blogSlug,updated_at AS updatedAt,reviewed_by AS reviewedBy FROM intelligence_opportunities ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,updated_at DESC LIMIT 400`).all(),
    db().prepare(`SELECT slug,json_extract(draft_json,'$.title') AS title,published_at AS publishedAt,updated_at AS updatedAt,CASE WHEN published_json IS NULL THEN 0 ELSE 1 END AS published FROM blog_posts ORDER BY updated_at DESC LIMIT 200`).all(),
    db().prepare(`SELECT slug,event,SUM(count) AS count FROM blog_engagement_daily WHERE day >= date('now','-29 days') GROUP BY slug,event ORDER BY slug,event`).all(),
  ]);
  return apiJson({ sources: sources.results, opportunities: opportunities.results, articles: articles.results, engagement: engagement.results, metricWindow: "Last 30 calendar days; tracked events, not unique people" });
}

export async function POST(request: Request) {
  const actor = await authorizeApi(request, { admin: true, mutate: true });
  if (actor instanceof Response) return actor;
  try {
    const input = await readLimitedJson(request, 20_000) as Record<string, unknown>;
    const action = words(input.action, 50);
    const now = new Date().toISOString();
    const id = words(input.id, 100);
    if (action === "source.create" || action === "source.update") {
      const name = words(input.name, 160), url = externalUrl(input.url), feedUrl = input.feedUrl ? externalUrl(input.feedUrl) : "";
      if (!name || !url || (input.feedUrl && !feedUrl)) return apiError("Enter a name and valid HTTPS website/feed URLs.", 400);
      const category = oneOf(input.category, SOURCE_CATEGORIES, "Government");
      const coverage = words(input.coverage, 100) || "India";
      const reliability = oneOf(input.reliability, RELIABILITY, "unreviewed");
      const notes = words(input.reviewNotes, 1200);
      if (reliability === "trusted" && notes.length < 30) return apiError("Explain the manual source review before marking a source trusted.", 400);
      if (action === "source.update") {
        if (!id) return apiError("Choose a source to update.", 400);
        const result = await db().prepare(`UPDATE intelligence_sources SET name=?,url=?,category=?,coverage=?,feed_url=?,reliability=?,review_notes=?,last_checked_at=CASE WHEN ?='unreviewed' THEN last_checked_at ELSE ? END,updated_at=? WHERE id=?`).bind(name,url,category,coverage,feedUrl || null,reliability,notes,reliability,now,now,id).run();
        if (!result.meta.changes) return apiError("Source not found.", 404);
      } else await db().prepare(`INSERT INTO intelligence_sources (id,name,url,category,coverage,feed_url,reliability,review_notes,last_checked_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),name,url,category,coverage,feedUrl || null,reliability,notes,reliability === "unreviewed" ? null : now,now,now).run();
      await audit(`platform:${actor.id}`, action, "intelligence_source", id || url);
      return apiJson({ ok: true });
    }
    if (action === "opportunity.create" || action === "opportunity.update") {
      const title = words(input.title, 200), summary = words(input.summary, 1800), evidenceNotes = words(input.evidenceNotes, 2400);
      const primaryUrl = input.primaryUrl ? externalUrl(input.primaryUrl) : "";
      const corroborationUrl = input.corroborationUrl ? externalUrl(input.corroborationUrl) : "";
      if (!title || (input.primaryUrl && !primaryUrl) || (input.corroborationUrl && !corroborationUrl)) return apiError("Add a title and valid HTTPS evidence links.", 400);
      const audience = oneOf(input.audience, AUDIENCES, "Both"), priority = oneOf(input.priority, PRIORITIES, "medium"), status = oneOf(input.status, OPPORTUNITY_STATES, "idea");
      if (["verified","drafting","review","approved"].includes(status) && !verifiedEvidence(primaryUrl,corroborationUrl,evidenceNotes)) return apiError("This stage needs two different-source HTTPS links and at least 30 characters of review notes. Independent verification still requires human judgement.", 400);
      const category = words(input.category, 100) || "Employment news";
      const sourceId = words(input.sourceId, 100) || null;
      const blogSlug = words(input.blogSlug, 100) || null;
      if (sourceId && !await db().prepare("SELECT id FROM intelligence_sources WHERE id=?").bind(sourceId).first()) return apiError("The selected source no longer exists.", 400);
      if (blogSlug && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(blogSlug) || !await db().prepare("SELECT slug FROM blog_posts WHERE slug=?").bind(blogSlug).first())) return apiError("Use the slug of an existing Blog CMS article.", 400);
      if (action === "opportunity.update") {
        if (!id) return apiError("Choose an opportunity to update.", 400);
        const result = await db().prepare(`UPDATE intelligence_opportunities SET title=?,summary=?,audience=?,category=?,priority=?,status=?,primary_url=?,corroboration_url=?,evidence_notes=?,source_id=?,blog_slug=?,updated_at=?,reviewed_by=? WHERE id=?`).bind(title,summary,audience,category,priority,status,primaryUrl,corroborationUrl,evidenceNotes,sourceId,blogSlug,now,status === "idea" || status === "researching" ? null : `platform:${actor.id}`,id).run();
        if (!result.meta.changes) return apiError("Opportunity not found.", 404);
      } else await db().prepare(`INSERT INTO intelligence_opportunities (id,title,summary,audience,category,priority,status,primary_url,corroboration_url,evidence_notes,source_id,blog_slug,created_at,updated_at,reviewed_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),title,summary,audience,category,priority,status,primaryUrl,corroborationUrl,evidenceNotes,sourceId,blogSlug,now,now,status === "idea" || status === "researching" ? null : `platform:${actor.id}`).run();
      await audit(`platform:${actor.id}`,action,"intelligence_opportunity",id || title);
      return apiJson({ ok: true });
    }
    return apiError("Unknown intelligence action.", 400);
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) return apiError("That website is already registered.", 409);
    console.error("intelligence save failed", error);
    return apiError("Could not save the record. Check the fields and try again.", 400);
  }
}
