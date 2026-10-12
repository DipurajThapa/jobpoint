import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

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
  message: text("message").notNull().default(""),
  resumeKey: text("resume_key"),
  resumeName: text("resume_name"),
  resumeType: text("resume_type"),
  resumeSize: integer("resume_size"),
  consent: integer("consent", { mode: "boolean" }).notNull(),
  status: text("status", { enum: ["new", "reviewing", "contacted", "closed"] }).notNull().default("new"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("applications_job_created_idx").on(table.jobId, table.createdAt), index("applications_status_idx").on(table.status)]);

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
  status: text("status", { enum: ["new", "contacted", "in_progress", "closed"] }).notNull().default("new"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("enquiries_status_created_idx").on(table.status, table.createdAt)]);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: integer("window_start").notNull(),
  hits: integer("hits").notNull().default(0),
});
