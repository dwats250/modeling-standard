-- S05 per-term affirmation evidence: first-version rule, database time and
-- runtime privileges. Hand-written and reviewed.
--
-- Membership, same-version and same-container rules are declarative (foreign
-- keys and a check in migrations/0011). This migration adds what a constraint
-- cannot express:
--
-- 1. First version only. An affirmation is accepted only against its
--    container's first presented version (sequence 1). A later version may
--    escalate a boundary, and ruling 6 requires a neutral record and a
--    mandatory delay before acceptance, neither of which is specified yet. This
--    fails closed; the slice that implements ruling 6 replaces it. A version
--    the inserting transaction cannot see is rejected as well.
-- 2. Database time. affirmed_at is set from clock_timestamp() when the row is
--    written; a caller cannot supply it.
-- 3. Permanence. The runtime role gets SELECT and INSERT only.
--
-- Trigger functions run as the invoking role, pin search_path with pg_temp
-- last and schema-qualify every table.

CREATE FUNCTION agreement_affirmation_stamp() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  version_sequence integer;
BEGIN
  SELECT v.sequence INTO version_sequence FROM public.agreement_version v
    WHERE v.pairwise_agreement_id = NEW.pairwise_agreement_id AND v.id = NEW.agreement_version_id;
  -- A version this transaction cannot see is rejected too, rather than left
  -- to the foreign key: the foreign-key check runs later and could find a
  -- later version committed in between.
  IF NOT FOUND OR version_sequence <> 1 THEN
    RAISE EXCEPTION 'affirmation is accepted only against the first presented version until escalation rules exist'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'agreement_affirmation_first_version_only';
  END IF;
  NEW.affirmed_at := clock_timestamp();
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER agreement_affirmation_stamp
  BEFORE INSERT ON public.agreement_affirmation
  FOR EACH ROW EXECUTE FUNCTION agreement_affirmation_stamp();
--> statement-breakpoint
CREATE FUNCTION universal_affirmation_stamp() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  version_sequence integer;
BEGIN
  SELECT v.sequence INTO version_sequence FROM public.universal_version v
    WHERE v.project_id = NEW.project_id AND v.id = NEW.universal_version_id;
  IF NOT FOUND OR version_sequence <> 1 THEN
    RAISE EXCEPTION 'affirmation is accepted only against the first presented version until escalation rules exist'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'universal_affirmation_first_version_only';
  END IF;
  NEW.affirmed_at := clock_timestamp();
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER universal_affirmation_stamp
  BEFORE INSERT ON public.universal_affirmation
  FOR EACH ROW EXECUTE FUNCTION universal_affirmation_stamp();
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION agreement_affirmation_stamp(), universal_affirmation_stamp() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "agreement_affirmation" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "universal_affirmation" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "agreement_affirmation" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "universal_affirmation" TO app_runtime;
