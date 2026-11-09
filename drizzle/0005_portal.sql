-- Job portal Phase 1: candidates, companies, admin-approved matching, releases,
-- unlocks with account-level quota, assessments, and the future services catalogue.
CREATE TABLE portal_accounts (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('candidate','company_user')), email TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', password_hash TEXT, email_verified_at TEXT, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','suspended','deleted')), last_sign_in_at TEXT, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX portal_accounts_email_unique ON portal_accounts(email);
--> statement-breakpoint
CREATE TABLE portal_sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, expires_at TEXT NOT NULL, user_agent TEXT NOT NULL DEFAULT '', FOREIGN KEY(account_id) REFERENCES portal_accounts(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE INDEX portal_sessions_account_idx ON portal_sessions(account_id);
--> statement-breakpoint
CREATE TABLE portal_tokens (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset','invite')), created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT, FOREIGN KEY(account_id) REFERENCES portal_accounts(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE TABLE candidates (id TEXT PRIMARY KEY, account_id TEXT, display_name TEXT NOT NULL DEFAULT '', current_city TEXT NOT NULL DEFAULT '', preferred_cities TEXT NOT NULL DEFAULT '[]', willing_to_relocate INTEGER NOT NULL DEFAULT 0, open_to_work INTEGER NOT NULL DEFAULT 1, hidden_company_ids TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','review','withdrawn','merged','deleted')), merged_into TEXT, dedupe_email_hash TEXT NOT NULL DEFAULT '', dedupe_phone_hash TEXT NOT NULL DEFAULT '', last_active_at TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(account_id) REFERENCES portal_accounts(id) ON DELETE SET NULL);
--> statement-breakpoint
CREATE INDEX candidates_dedupe_email_idx ON candidates(dedupe_email_hash);
--> statement-breakpoint
CREATE INDEX candidates_dedupe_phone_idx ON candidates(dedupe_phone_hash);
--> statement-breakpoint
CREATE TABLE candidate_consents (id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, purpose TEXT NOT NULL CHECK(purpose IN ('profile_processing','share_with_companies','service_offers')), action TEXT NOT NULL CHECK(action IN ('granted','withdrawn')), notice_version TEXT NOT NULL, notice_hash TEXT NOT NULL, channel TEXT NOT NULL DEFAULT 'web', ip_hash TEXT NOT NULL DEFAULT '', at TEXT NOT NULL, FOREIGN KEY(candidate_id) REFERENCES candidates(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE INDEX candidate_consents_lookup_idx ON candidate_consents(candidate_id, purpose, at DESC);
--> statement-breakpoint
CREATE TABLE cvs (id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, r2_key TEXT NOT NULL, file_name TEXT NOT NULL, file_type TEXT NOT NULL CHECK(file_type IN ('pdf','docx')), size INTEGER NOT NULL, sha256 TEXT NOT NULL, text_fingerprint TEXT NOT NULL DEFAULT '', parse_status TEXT NOT NULL CHECK(parse_status IN ('parsed','needs_review','failed')), parse_confidence REAL NOT NULL DEFAULT 0, is_primary INTEGER NOT NULL DEFAULT 1, superseded_at TEXT, created_at TEXT NOT NULL, FOREIGN KEY(candidate_id) REFERENCES candidates(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE INDEX cvs_candidate_idx ON cvs(candidate_id, is_primary);
--> statement-breakpoint
CREATE INDEX cvs_sha_idx ON cvs(sha256);
--> statement-breakpoint
CREATE TABLE cv_profiles (cv_id TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('parser','candidate','admin')), corrected_fields TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, PRIMARY KEY(cv_id, version), FOREIGN KEY(cv_id) REFERENCES cvs(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE TABLE duplicate_flags (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('account','cv')), a_id TEXT NOT NULL, b_id TEXT NOT NULL, signal TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','merged','dismissed')), resolved_by TEXT, created_at TEXT NOT NULL, UNIQUE(kind, a_id, b_id, signal));
--> statement-breakpoint
CREATE TABLE companies (id TEXT PRIMARY KEY, legal_name TEXT NOT NULL, display_name TEXT NOT NULL, gstin TEXT NOT NULL DEFAULT '', website TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'applied' CHECK(status IN ('applied','active','suspended','closed')), notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE company_users (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, account_id TEXT NOT NULL UNIQUE, role TEXT NOT NULL CHECK(role IN ('owner','recruiter')), created_at TEXT NOT NULL, FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE, FOREIGN KEY(account_id) REFERENCES portal_accounts(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE TABLE company_parameters (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, version INTEGER NOT NULL, params TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('requested','approved','rejected','superseded')), requested_by TEXT NOT NULL, decided_by TEXT, decided_at TEXT, decision_note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, UNIQUE(company_id, version), FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE UNIQUE INDEX company_parameters_one_approved ON company_parameters(company_id) WHERE status = 'approved';
--> statement-breakpoint
CREATE TABLE jds (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, title TEXT NOT NULL, raw_text TEXT NOT NULL, r2_key TEXT, requirements TEXT NOT NULL, corrected_fields TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','live','paused','closed','rejected')), params_version INTEGER, decided_by TEXT, decided_at TEXT, decision_note TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE INDEX jds_company_idx ON jds(company_id, status);
--> statement-breakpoint
CREATE INDEX jds_status_idx ON jds(status);
--> statement-breakpoint
CREATE TABLE matches (jd_id TEXT NOT NULL, candidate_id TEXT NOT NULL, cv_id TEXT NOT NULL, profile_version INTEGER NOT NULL, score REAL NOT NULL, lower_bound REAL NOT NULL, hard_pass INTEGER NOT NULL, failed_filters TEXT NOT NULL DEFAULT '[]', explanation TEXT NOT NULL, engine_version TEXT NOT NULL, scored_at TEXT NOT NULL, PRIMARY KEY(jd_id, candidate_id), FOREIGN KEY(jd_id) REFERENCES jds(id) ON DELETE CASCADE, FOREIGN KEY(candidate_id) REFERENCES candidates(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE INDEX matches_rank_idx ON matches(jd_id, hard_pass, lower_bound DESC);
--> statement-breakpoint
CREATE INDEX matches_candidate_idx ON matches(candidate_id, hard_pass, score DESC);
--> statement-breakpoint
CREATE TABLE score_queue (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('candidate','jd')), ref_id TEXT NOT NULL, reason TEXT NOT NULL, enqueued_at TEXT NOT NULL, UNIQUE(kind, ref_id));
--> statement-breakpoint
CREATE TABLE releases (id TEXT PRIMARY KEY, jd_id TEXT NOT NULL, company_id TEXT NOT NULL, candidate_id TEXT NOT NULL, candidate_ref TEXT NOT NULL, score REAL NOT NULL, params_version INTEGER NOT NULL, released_at TEXT NOT NULL, revoked_at TEXT, revoke_reason TEXT, FOREIGN KEY(jd_id) REFERENCES jds(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE UNIQUE INDEX releases_active_unique ON releases(jd_id, candidate_id) WHERE revoked_at IS NULL;
--> statement-breakpoint
CREATE INDEX releases_company_idx ON releases(company_id, released_at DESC);
--> statement-breakpoint
CREATE INDEX releases_ref_idx ON releases(company_id, candidate_ref);
--> statement-breakpoint
CREATE TABLE plans (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, unlock_quota INTEGER NOT NULL, validity_days INTEGER NOT NULL, price_inr INTEGER, is_free INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE payment_intents (id TEXT PRIMARY KEY, payer_kind TEXT NOT NULL CHECK(payer_kind IN ('company','candidate')), payer_id TEXT NOT NULL, purpose TEXT NOT NULL CHECK(purpose IN ('plan','service_order')), ref_id TEXT NOT NULL, amount_inr INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'stub' CHECK(status IN ('stub','created','paid','failed','refunded')), provider TEXT, provider_ref TEXT, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE company_subscriptions (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, plan_id TEXT NOT NULL, quota_total INTEGER NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, assigned_by TEXT NOT NULL, payment_intent_id TEXT, created_at TEXT NOT NULL, FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE, FOREIGN KEY(plan_id) REFERENCES plans(id));
--> statement-breakpoint
CREATE INDEX company_subscriptions_company_idx ON company_subscriptions(company_id, ends_at);
--> statement-breakpoint
CREATE TABLE unlocks (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, candidate_id TEXT NOT NULL, candidate_ref TEXT NOT NULL, first_jd_id TEXT NOT NULL, unlocked_by TEXT NOT NULL, subscription_id TEXT NOT NULL, trace_id TEXT NOT NULL, unlocked_at TEXT NOT NULL, access_revoked_at TEXT, access_revoke_reason TEXT, UNIQUE(company_id, candidate_id), FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE TABLE quota_ledger (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, subscription_id TEXT NOT NULL, delta INTEGER NOT NULL, reason TEXT NOT NULL CHECK(reason IN ('grant','unlock','adjustment')), unlock_id TEXT UNIQUE, note TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(subscription_id) REFERENCES company_subscriptions(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE INDEX quota_ledger_subscription_idx ON quota_ledger(subscription_id);
--> statement-breakpoint
CREATE TABLE portal_applications (id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, jd_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('applied','released','not_released','viewed','shortlisted','interview','offer','hired','rejected','withdrawn')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(candidate_id, jd_id), FOREIGN KEY(candidate_id) REFERENCES candidates(id) ON DELETE CASCADE, FOREIGN KEY(jd_id) REFERENCES jds(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE TABLE portal_application_events (id TEXT PRIMARY KEY, application_id TEXT NOT NULL, status TEXT NOT NULL, actor TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', at TEXT NOT NULL, FOREIGN KEY(application_id) REFERENCES portal_applications(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE TABLE assessments (id TEXT PRIMARY KEY, owner_kind TEXT NOT NULL CHECK(owner_kind IN ('platform','company')), company_id TEXT, jd_id TEXT, skill_id TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', items_per_form INTEGER NOT NULL, time_limit_sec INTEGER NOT NULL, retake_cooldown_days INTEGER NOT NULL DEFAULT 30, validity_days INTEGER NOT NULL DEFAULT 365, reliability REAL, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','approved','retired','rejected')), version INTEGER NOT NULL DEFAULT 1, decided_by TEXT, decided_at TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE assessment_items (id TEXT PRIMARY KEY, assessment_id TEXT NOT NULL, stem TEXT NOT NULL, options TEXT NOT NULL, answer_index INTEGER NOT NULL, difficulty REAL, discrimination REAL, exposure_count INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, FOREIGN KEY(assessment_id) REFERENCES assessments(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE TABLE assessment_attempts (id TEXT PRIMARY KEY, assessment_id TEXT NOT NULL, candidate_id TEXT NOT NULL, jd_id TEXT, form TEXT NOT NULL, started_at TEXT NOT NULL, deadline_at TEXT NOT NULL, submitted_at TEXT, status TEXT NOT NULL CHECK(status IN ('in_progress','submitted','expired','voided')), raw_correct INTEGER, items INTEGER NOT NULL, score REAL, sem REAL, integrity TEXT NOT NULL DEFAULT '{}', integrity_status TEXT NOT NULL DEFAULT 'ok' CHECK(integrity_status IN ('ok','review','voided')), FOREIGN KEY(assessment_id) REFERENCES assessments(id) ON DELETE CASCADE, FOREIGN KEY(candidate_id) REFERENCES candidates(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE INDEX assessment_attempts_candidate_idx ON assessment_attempts(candidate_id, assessment_id, started_at DESC);
--> statement-breakpoint
CREATE TABLE assessment_responses (attempt_id TEXT NOT NULL, item_id TEXT NOT NULL, position INTEGER NOT NULL, choice INTEGER, correct INTEGER, response_ms INTEGER, PRIMARY KEY(attempt_id, item_id), FOREIGN KEY(attempt_id) REFERENCES assessment_attempts(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE TABLE services (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, category TEXT NOT NULL CHECK(category IN ('cv_writing','linkedin_optimisation','spoken_english','technical_training')), name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', price_inr INTEGER, delivery_mode TEXT NOT NULL DEFAULT 'online' CHECK(delivery_mode IN ('online','offline','hybrid')), duration_days INTEGER, active INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE service_orders (id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, service_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','awaiting_payment','paid','in_progress','delivered','cancelled','refunded')), amount_inr INTEGER, payment_intent_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(candidate_id) REFERENCES candidates(id) ON DELETE CASCADE, FOREIGN KEY(service_id) REFERENCES services(id));
--> statement-breakpoint
CREATE TABLE service_enrolments (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, candidate_id TEXT NOT NULL, batch_code TEXT NOT NULL DEFAULT '', starts_on TEXT, ends_on TEXT, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','completed','dropped')), progress TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, FOREIGN KEY(order_id) REFERENCES service_orders(id) ON DELETE CASCADE, FOREIGN KEY(candidate_id) REFERENCES candidates(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE TABLE access_log (id TEXT PRIMARY KEY, actor_kind TEXT NOT NULL, actor_id TEXT NOT NULL, company_id TEXT, action TEXT NOT NULL, jd_id TEXT, candidate_ref TEXT, ip_hash TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '', at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX access_log_company_idx ON access_log(company_id, at DESC);
--> statement-breakpoint
CREATE INDEX access_log_actor_idx ON access_log(actor_id, action, at DESC);
--> statement-breakpoint
CREATE TABLE abuse_flags (id TEXT PRIMARY KEY, subject_kind TEXT NOT NULL CHECK(subject_kind IN ('company_user','candidate')), subject_id TEXT NOT NULL, company_id TEXT, rule TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','actioned','dismissed')), created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX abuse_flags_status_idx ON abuse_flags(status, created_at DESC);
