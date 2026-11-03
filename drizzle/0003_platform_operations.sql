CREATE TABLE platform_teams (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE platform_team_members (team_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY(team_id, user_id), FOREIGN KEY(team_id) REFERENCES platform_teams(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES platform_users(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE TABLE platform_integrations (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('api','mcp')), endpoint TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0, encrypted_token TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE platform_integration_checks (id TEXT PRIMARY KEY, integration_id TEXT NOT NULL, status TEXT NOT NULL, http_status INTEGER, message TEXT NOT NULL DEFAULT '', checked_at TEXT NOT NULL, checked_by TEXT NOT NULL, FOREIGN KEY(integration_id) REFERENCES platform_integrations(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE INDEX platform_integration_checks_recent ON platform_integration_checks(integration_id, checked_at DESC);
--> statement-breakpoint
CREATE TABLE platform_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE platform_features (tool_key TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL);
