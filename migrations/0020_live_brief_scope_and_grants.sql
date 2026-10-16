-- S08 draft live brief: retire the S03–S05 trigger functions, add the
-- pair-subject scope check, and grant the runtime role its draft privileges.
-- Hand-written and reviewed.
--
-- 1. The S03–S05 tables were dropped in migrations/0019, which removed their
--    triggers; their functions are dropped here. Nothing else uses them.
-- 2. brief_item_check_scope: a pair-scoped subject must be one of that pair's
--    two parties. The pair is read by (project_id, id); a pair this
--    transaction cannot see is refused (fail closed) rather than left to the
--    foreign key, which is checked after this trigger.
-- 3. Grants. live_brief: SELECT, INSERT. brief_item: SELECT, INSERT, DELETE,
--    and UPDATE of content, value, pending and position only, so identity,
--    layer, scope, subject, shape and key can never be changed by the runtime
--    role. DELETE is deliberate: a draft is not evidence (HC1). There is no
--    phase here and no rule that begins at sharing (S09).
--
-- The trigger function runs as the invoking role, pins search_path with
-- pg_temp last, schema-qualifies its table, and is not executable by PUBLIC.

DROP FUNCTION agreement_affirmation_stamp();
--> statement-breakpoint
DROP FUNCTION universal_affirmation_stamp();
--> statement-breakpoint
DROP FUNCTION agreement_version_term_check_copy();
--> statement-breakpoint
DROP FUNCTION universal_version_term_check_copy();
--> statement-breakpoint
DROP FUNCTION agreement_version_check_sealed();
--> statement-breakpoint
DROP FUNCTION universal_version_check_sealed();
--> statement-breakpoint
DROP FUNCTION agreement_version_stamp();
--> statement-breakpoint
DROP FUNCTION universal_version_stamp();
--> statement-breakpoint
CREATE FUNCTION brief_item_check_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  one_id uuid;
  two_id uuid;
BEGIN
  IF NEW.pairwise_agreement_id IS NOT NULL AND NEW.subject_party_id IS NOT NULL THEN
    SELECT a.party_one_id, a.party_two_id INTO one_id, two_id
      FROM public.pairwise_agreement a
      WHERE a.project_id = NEW.project_id AND a.id = NEW.pairwise_agreement_id;
    IF NOT FOUND OR NEW.subject_party_id NOT IN (one_id, two_id) THEN
      RAISE EXCEPTION 'a pair-scoped subject must be one of the pair''s two parties'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'brief_item_subject_in_pair';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER brief_item_check_scope
  BEFORE INSERT OR UPDATE ON public.brief_item
  FOR EACH ROW EXECUTE FUNCTION brief_item_check_scope();
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION brief_item_check_scope() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "live_brief" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "brief_item" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "live_brief" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON TABLE "brief_item" TO app_runtime;
--> statement-breakpoint
GRANT UPDATE ("content", "value", "pending", "position") ON TABLE "brief_item" TO app_runtime;
