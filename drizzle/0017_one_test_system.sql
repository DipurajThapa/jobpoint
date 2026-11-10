-- Merge 4: one test system. The adaptive tests stay; the first test system is
-- no longer used by any screen or by matching. Its four tables are renamed, not
-- dropped, so anything recorded in them is kept until the data inventory
-- confirms they can go. Rows about a candidate are still erased with the candidate.
ALTER TABLE assessment_responses RENAME TO retired_assessment_responses;
--> statement-breakpoint
ALTER TABLE assessment_attempts RENAME TO retired_assessment_attempts;
--> statement-breakpoint
ALTER TABLE assessment_items RENAME TO retired_assessment_items;
--> statement-breakpoint
ALTER TABLE assessments RENAME TO retired_assessments;
