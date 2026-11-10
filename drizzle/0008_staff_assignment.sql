-- Jobboard300 staff roles and assignment for the Recruiting tool.
-- A team manager is a member flagged on their team (a franchise is a team with
-- its own manager). Each client company belongs to at most one team; a job may
-- be assigned to one recruiter of that team.
ALTER TABLE platform_team_members ADD COLUMN is_manager INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE companies ADD COLUMN team_id TEXT;
--> statement-breakpoint
ALTER TABLE jds ADD COLUMN recruiter_id TEXT;
--> statement-breakpoint
CREATE INDEX companies_team_idx ON companies(team_id);
--> statement-breakpoint
CREATE INDEX jds_recruiter_idx ON jds(recruiter_id);
