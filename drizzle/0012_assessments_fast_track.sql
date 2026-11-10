-- Question banks, adaptive tests, Fast Track and the offer-stage commitment.
CREATE TABLE question_banks (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('technical','aptitude','client')),
  title TEXT NOT NULL,
  skill_id TEXT NOT NULL DEFAULT '',
  company_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','retired')),
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE bank_questions (
  id TEXT PRIMARY KEY NOT NULL,
  bank_id TEXT NOT NULL,
  level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 10),
  topic TEXT NOT NULL DEFAULT '',
  stem TEXT NOT NULL,
  options TEXT NOT NULL,
  answer_index INTEGER NOT NULL,
  explanation TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (bank_id, stem),
  FOREIGN KEY(bank_id) REFERENCES question_banks(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX bank_questions_level ON bank_questions (bank_id, active, level);
--> statement-breakpoint
CREATE TABLE adaptive_tests (
  id TEXT PRIMARY KEY NOT NULL,
  bank_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  jd_id TEXT,
  invited_by TEXT,
  token_hash TEXT,
  status TEXT NOT NULL CHECK(status IN ('invited','in_progress','completed','expired')),
  level INTEGER NOT NULL DEFAULT 5,
  asked INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  current_question_id TEXT,
  current_order TEXT,
  started_at TEXT,
  deadline_at TEXT,
  completed_at TEXT,
  final_level INTEGER,
  band TEXT,
  weak_topics TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  FOREIGN KEY(candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX adaptive_tests_candidate ON adaptive_tests (candidate_id, bank_id, created_at);
--> statement-breakpoint
CREATE UNIQUE INDEX adaptive_tests_token ON adaptive_tests (token_hash) WHERE token_hash IS NOT NULL;
--> statement-breakpoint
CREATE TABLE adaptive_answers (
  test_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  choice INTEGER,
  correct INTEGER NOT NULL,
  answered_at TEXT NOT NULL,
  PRIMARY KEY (test_id, position),
  FOREIGN KEY(test_id) REFERENCES adaptive_tests(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE fast_track_orders (
  id TEXT PRIMARY KEY NOT NULL,
  candidate_id TEXT NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  amount_inr INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_payment' CHECK(status IN ('awaiting_payment','paid','cancelled')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  paid_at TEXT,
  confirmed_by TEXT,
  FOREIGN KEY(candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE portal_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL);
--> statement-breakpoint
ALTER TABLE candidates ADD COLUMN fast_track_at TEXT;
--> statement-breakpoint
-- The client opted for Jobboard300's aptitude and soft-skills test on this job.
ALTER TABLE jds ADD COLUMN aptitude_test INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
-- What a candidate agrees to when an offer is made (joining and staying 60 days).
CREATE TABLE candidate_commitments (
  id TEXT PRIMARY KEY NOT NULL,
  pipeline_id TEXT NOT NULL UNIQUE,
  candidate_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  version TEXT NOT NULL,
  body TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  accepted_at TEXT,
  ip_hash TEXT NOT NULL DEFAULT '',
  FOREIGN KEY(candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
);
--> statement-breakpoint
-- Which terms each website enquiry or application agreed to.
ALTER TABLE applications ADD COLUMN terms_version TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE employer_enquiries ADD COLUMN terms_version TEXT NOT NULL DEFAULT '';
