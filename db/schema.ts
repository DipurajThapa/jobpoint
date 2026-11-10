import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, index, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  company: text("company").notNull().default("Confidential client"),
  location: text("location").notNull(),
  employmentType: text("employment_type").notNull(),
  workMode: text("work_mode").notNull().default("On-site"),
  sector: text("sector").notNull().default("Other"),
  salaryRange: text("salary_range"),
  description: text("description").notNull(),
  requirements: text("requirements").notNull().default(""),
  status: text("status", { enum: ["draft", "published", "closed"] }).notNull().default("draft"),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("jobs_status_created_idx").on(table.status, table.createdAt), index("jobs_location_idx").on(table.location)]);

export const applications = sqliteTable("applications", {
  id: text("id").primaryKey(),
  jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  location: text("location").notNull(),
  experience: text("experience").notNull(),
  desiredRole: text("desired_role").notNull().default(""),
  skills: text("skills").notNull().default(""),
  education: text("education").notNull().default(""),
  availability: text("availability").notNull().default(""),
  message: text("message").notNull().default(""),
  resumeKey: text("resume_key"),
  resumeName: text("resume_name"),
  resumeType: text("resume_type"),
  resumeSize: integer("resume_size"),
  consent: integer("consent", { mode: "boolean" }).notNull(),
  shareConsent: integer("share_consent", { mode: "boolean" }).notNull().default(false),
  futureConsent: integer("future_consent", { mode: "boolean" }).notNull().default(false),
  privacyVersion: text("privacy_version").notNull().default("2026-10-13"),
  termsVersion: text("terms_version").notNull().default(""),
  consentAt: text("consent_at"),
  status: text("status", { enum: ["new", "screening", "qualified", "shortlisted", "submitted", "interview", "selected", "offer", "joined", "rejected", "withdrawn", "on_hold"] }).notNull().default("new"),
  recruiterNotes: text("recruiter_notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("applications_job_created_idx").on(table.jobId, table.createdAt), index("applications_status_idx").on(table.status), index("applications_email_idx").on(table.email), index("applications_location_idx").on(table.location)]);

export const employerEnquiries = sqliteTable("employer_enquiries", {
  id: text("id").primaryKey(),
  contactName: text("contact_name").notNull(),
  company: text("company").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  roleTitle: text("role_title").notNull(),
  location: text("location").notNull(),
  headcount: integer("headcount").notNull().default(1),
  details: text("details").notNull(),
  consent: integer("consent", { mode: "boolean" }).notNull(),
  privacyVersion: text("privacy_version").notNull().default("2026-10-13"),
  termsVersion: text("terms_version").notNull().default(""),
  consentAt: text("consent_at"),
  status: text("status", { enum: ["new", "contacted", "in_progress", "closed"] }).notNull().default("new"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("enquiries_status_created_idx").on(table.status, table.createdAt)]);

export const privacyRequests = sqliteTable("privacy_requests", {
  id: text("id").primaryKey(),
  requestType: text("request_type", { enum: ["access", "correction", "deletion", "withdrawal", "grievance"] }).notNull(),
  requesterName: text("requester_name").notNull(),
  email: text("email").notNull(),
  details: text("details").notNull().default(""),
  status: text("status", { enum: ["new", "verifying", "in_progress", "completed", "declined"] }).notNull().default("new"),
  resolutionNote: text("resolution_note").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("privacy_requests_status_idx").on(table.status, table.createdAt)]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  detail: text("detail").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("audit_events_created_idx").on(table.createdAt)]);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: integer("window_start").notNull(),
  hits: integer("hits").notNull().default(0),
});

// Working Platform: internal team accounts, per-tool permissions and sessions.
// Tokens and passwords are stored only as hashes.
export const platformUsers = sqliteTable("platform_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull().default(""),
  role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
  status: text("status", { enum: ["invited", "active", "disabled"] }).notNull().default("invited"),
  passwordHash: text("password_hash"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastSignInAt: text("last_sign_in_at"),
  createdBy: text("created_by"),
}, (table) => [uniqueIndex("platform_users_email_unique").on(table.email)]);

export const platformToolAccess = sqliteTable("platform_tool_access", {
  userId: text("user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  toolKey: text("tool_key").notNull(),
  level: text("level", { enum: ["view", "edit", "manage"] }).notNull(),
  grantedBy: text("granted_by").notNull(),
  grantedAt: text("granted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [primaryKey({ columns: [table.userId, table.toolKey] })]);

export const platformSessions = sqliteTable("platform_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  userAgent: text("user_agent").notNull().default(""),
}, (table) => [index("platform_sessions_user_idx").on(table.userId)]);

export const platformTokens = sqliteTable("platform_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  purpose: text("purpose", { enum: ["invite", "reset"] }).notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
}, (table) => [index("platform_tokens_user_idx").on(table.userId, table.purpose)]);

// Email Kit: one shared workspace. Each engine record is stored as JSON by
// (table, id); attachment bytes and daily recovery snapshots live in private R2.
export const emailKitRecords = sqliteTable("email_kit_records", {
  tbl: text("tbl").notNull(),
  id: text("id").notNull(),
  data: text("data").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedRev: integer("updated_rev").notNull().default(0),
  createdAt: text("created_at").notNull().default(""),
  createdBy: text("created_by").notNull().default(""),
}, (table) => [primaryKey({ columns: [table.tbl, table.id] })]);

export const emailKitState = sqliteTable("email_kit_state", {
  id: integer("id").primaryKey(),
  rev: integer("rev").notNull().default(0),
  lastTx: text("last_tx").notNull().default(""),
  updatedAt: text("updated_at"),
  updatedBy: text("updated_by"),
});

export const emailKitFiles = sqliteTable("email_kit_files", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default(""),
  size: integer("size").notNull(),
  r2Key: text("r2_key").notNull(),
  createdAt: text("created_at").notNull(),
  createdBy: text("created_by").notNull(),
});

export const emailKitSnapshots = sqliteTable("email_kit_snapshots", {
  id: text("id").primaryKey(),
  r2Key: text("r2_key").notNull(),
  bytes: integer("bytes").notNull(),
  createdAt: text("created_at").notNull(),
  createdBy: text("created_by").notNull(),
});
