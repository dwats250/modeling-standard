-- B4 portfolio stale-save protection: the draft's save revision.
-- Generated. The revision is set by a trigger (migrations/0037), never by a caller.
ALTER TABLE "portfolio_draft" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "portfolio_draft" ADD CONSTRAINT "portfolio_draft_revision_positive" CHECK ("portfolio_draft"."revision" >= 1);