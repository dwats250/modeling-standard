-- B3 portfolio captions: caption guard and runtime privileges.
-- Hand-written and reviewed.
--
-- That there are exactly as many captions as items, and the array's shape,
-- are declarative (migrations/0034). This migration:
--
-- 1. Extends the B2 item guard (migrations/0033) so that every caption is a
--    present string of at most 120 characters; otherwise the write fails
--    with check_violation. Blank ('') is the absent caption.
-- 2. Lets the runtime role UPDATE captions, beside items. Still no DELETE,
--    and no UPDATE of id, owner or time columns.
--
-- Same function name, so the existing trigger keeps firing; the function
-- still runs as the invoking role, pins search_path with pg_temp last, and
-- is not executable by PUBLIC.

CREATE OR REPLACE FUNCTION portfolio_draft_check_items() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  item text;
  caption text;
BEGIN
  FOREACH item IN ARRAY NEW.items LOOP
    IF item IS NULL OR item !~ '^[a-z0-9-]{1,40}$' THEN
      RAISE EXCEPTION 'portfolio item is not a fixture key'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'portfolio_draft_item_shape';
    END IF;
  END LOOP;
  IF (SELECT count(DISTINCT k) FROM unnest(NEW.items) AS k) <> cardinality(NEW.items) THEN
    RAISE EXCEPTION 'portfolio items repeat'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'portfolio_draft_items_distinct';
  END IF;
  FOREACH caption IN ARRAY NEW.captions LOOP
    IF caption IS NULL OR char_length(caption) > 120 THEN
      RAISE EXCEPTION 'portfolio caption is missing or too long'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'portfolio_draft_caption_length';
    END IF;
  END LOOP;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION portfolio_draft_check_items() FROM PUBLIC;
--> statement-breakpoint
GRANT UPDATE (captions) ON TABLE "portfolio_draft" TO app_runtime;
