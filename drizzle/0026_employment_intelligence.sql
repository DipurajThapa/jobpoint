-- Jobboard300 supervised intelligence: no automated publishing authority.
CREATE TABLE intelligence_sources (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  coverage TEXT NOT NULL DEFAULT 'India',
  feed_url TEXT,
  reliability TEXT NOT NULL DEFAULT 'unreviewed',
  review_notes TEXT NOT NULL DEFAULT '',
  last_checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX intelligence_sources_reliability_idx ON intelligence_sources(reliability);
--> statement-breakpoint
CREATE TABLE intelligence_opportunities (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT 'Both',
  category TEXT NOT NULL DEFAULT 'Employment news',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'idea',
  primary_url TEXT NOT NULL DEFAULT '',
  corroboration_url TEXT NOT NULL DEFAULT '',
  evidence_notes TEXT NOT NULL DEFAULT '',
  source_id TEXT REFERENCES intelligence_sources(id) ON DELETE SET NULL,
  blog_slug TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_by TEXT
);
--> statement-breakpoint
CREATE INDEX intelligence_opportunities_status_idx ON intelligence_opportunities(status, updated_at);
--> statement-breakpoint
CREATE TABLE blog_engagement_daily (
  day TEXT NOT NULL,
  slug TEXT NOT NULL,
  event TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day, slug, event)
);
--> statement-breakpoint
CREATE INDEX blog_engagement_daily_slug_idx ON blog_engagement_daily(slug, day);
--> statement-breakpoint
-- Starter URLs confirmed as official domains in Nov 2026. These are NOT yet
-- editorially reviewed or configured for RSS collection.
INSERT INTO intelligence_sources (id,name,url,category,coverage,reliability,review_notes,created_at,updated_at) VALUES
('seed-ncs','National Career Service','https://ncs.gov.in/','Government','India','unreviewed','Official-domain candidate. Review the exact coverage and collection method before use.',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('seed-upsc','Union Public Service Commission','https://www.upsc.gov.in/','Government','India','unreviewed','Official-domain candidate. Confirm current notices against the original documents.',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('seed-ssc','Staff Selection Commission','https://ssc.gov.in/','Government','India','unreviewed','Official-domain candidate. Check notification amendments and expiry dates.',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('seed-pib','Press Information Bureau','https://www.pib.gov.in/','Government','India','unreviewed','Official-domain candidate. A press release alone is not independent corroboration.',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
