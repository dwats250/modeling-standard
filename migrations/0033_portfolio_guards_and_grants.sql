-- B2 portfolio draft: item guard, database time and runtime privileges.
-- Hand-written and reviewed.
--
-- One draft per profile, the item count (at most 8) and a one-dimensional
-- list are declarative (migrations/0032). This migration adds:
--
-- 1. An item guard. Every item is a fixture-key-shaped string (no NULL) and
--    no key appears twice; otherwise the write fails with check_violation.
--    Which keys exist is the application's fixture catalogue.
-- 2. Database time, by the B1 stamp function (migrations/0031).
-- 3. Privileges for the runtime role: SELECT, INSERT, UPDATE (items). No
--    DELETE, and no UPDATE of id, owner or time columns.
--
-- The trigger function runs as the invoking role, pins search_path with
-- pg_temp last, and is not executable by PUBLIC (trigger firing does not
-- check EXECUTE).

CREATE FUNCTION portfolio_draft_check_items() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  item text;
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
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER portfolio_draft_check_items
  BEFORE INSERT OR UPDATE ON public.portfolio_draft
  FOR EACH ROW EXECUTE FUNCTION portfolio_draft_check_items();
--> statement-breakpoint
CREATE TRIGGER portfolio_draft_stamp
  BEFORE INSERT OR UPDATE ON public.portfolio_draft
  FOR EACH ROW EXECUTE FUNCTION toolkit_row_stamp();
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION portfolio_draft_check_items() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "portfolio_draft" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "portfolio_draft" TO app_runtime;
--> statement-breakpoint
GRANT UPDATE (items) ON TABLE "portfolio_draft" TO app_runtime;
