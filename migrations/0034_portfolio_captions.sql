-- B3 portfolio captions: one caption per item, at the item's position.
-- Generated, then one hand-written backfill (blank captions for the items
-- of every existing draft) so the aligned CHECK holds for them.
ALTER TABLE "portfolio_draft" ADD COLUMN "captions" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
UPDATE "portfolio_draft" SET "captions" = array_fill(''::text, ARRAY[cardinality("items")]) WHERE cardinality("items") > 0;--> statement-breakpoint
ALTER TABLE "portfolio_draft" ADD CONSTRAINT "portfolio_draft_captions_aligned" CHECK (cardinality("portfolio_draft"."captions") = cardinality("portfolio_draft"."items") and (cardinality("portfolio_draft"."captions") = 0 or (array_ndims("portfolio_draft"."captions") = 1 and array_lower("portfolio_draft"."captions", 1) = 1)));