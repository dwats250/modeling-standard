-- B4 portfolio stale-save protection: the revision is the database's.
-- Hand-written and reviewed.
--
-- The column, its default and that it is at least 1 are declarative
-- (migrations/0036). This migration:
--
-- 1. Sets the revision from the database: 1 when a draft is inserted and
--    one more on every update, whatever a caller supplies. A save compares
--    the revision it was based on in the same statement that writes
--    (`src/toolkit/portfolio.ts`), so a stale save changes nothing.
-- 2. Grants nothing new: the runtime role still updates `items` and
--    `captions` only, so it cannot set the revision directly.
--
-- The trigger function runs as the invoking role, pins search_path with
-- pg_temp last, and is not executable by PUBLIC (trigger firing does not
-- check EXECUTE).

CREATE FUNCTION portfolio_draft_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.revision := 1;
  ELSE
    NEW.revision := OLD.revision + 1;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER portfolio_draft_revision
  BEFORE INSERT OR UPDATE ON public.portfolio_draft
  FOR EACH ROW EXECUTE FUNCTION portfolio_draft_revision();
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION portfolio_draft_revision() FROM PUBLIC;
