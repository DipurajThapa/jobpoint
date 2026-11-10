-- Merge 5: one orders table. Fast Track orders become "orders" with a kind, so
-- any later paid service is a new kind, not a new table. The unused services
-- catalogue and the payment stub are renamed, not dropped (see 0017).
ALTER TABLE fast_track_orders RENAME TO orders;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN kind TEXT NOT NULL DEFAULT 'fast_track';
--> statement-breakpoint
CREATE INDEX orders_candidate_idx ON orders(candidate_id, kind, status);
--> statement-breakpoint
ALTER TABLE service_enrolments RENAME TO retired_service_enrolments;
--> statement-breakpoint
ALTER TABLE service_orders RENAME TO retired_service_orders;
--> statement-breakpoint
ALTER TABLE services RENAME TO retired_services;
--> statement-breakpoint
ALTER TABLE payment_intents RENAME TO retired_payment_intents;
