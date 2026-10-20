-- S10: the internal signing phase and its fingerprint.
-- Generated, then hand-ordered (as in 0005, 0009, 0011, 0019 and 0021): the
-- fingerprint column arrives null, so every existing brief keeps its phase
-- and satisfies the new check; the phase check is replaced to admit
-- 'signing'. The transition, immutability and signing guards and the grant
-- are hand-written in 0024.
ALTER TABLE "live_brief" ADD COLUMN "fingerprint" text;--> statement-breakpoint
ALTER TABLE "live_brief" DROP CONSTRAINT "live_brief_phase_known";--> statement-breakpoint
ALTER TABLE "live_brief" ADD CONSTRAINT "live_brief_phase_known" CHECK ("live_brief"."phase" in ('draft', 'live', 'signing'));--> statement-breakpoint
ALTER TABLE "live_brief" ADD CONSTRAINT "live_brief_fingerprint_iff_signing" CHECK (("live_brief"."phase" = 'signing') = ("live_brief"."fingerprint" IS NOT NULL) AND ("live_brief"."fingerprint" IS NULL OR "live_brief"."fingerprint" ~ '^[0-9a-f]{64}$'));
