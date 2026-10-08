-- S05 per-term affirmation evidence: single-version rule, presentation-
-- transaction rule, database time and runtime privileges. Hand-written and
-- reviewed.
--
-- Membership, same-version and same-container rules are declarative (foreign
-- keys and a check in migrations/0011). This migration adds what a constraint
-- cannot express:
--
-- 1. Single version only. An affirmation is accepted only against version 1
--    of a container, and only while no later version exists. Whether an
--    earlier version stays open once a later one exists is open (D02 d, g, h),
--    and a later version may escalate a boundary, which ruling 6 governs and
--    which is not specified. This stops short of both questions. It does not
--    detect escalation in general (for example a second agreement between the
--    same two parties). Drop-and-resend therefore leaves the resent version
--    unaffirmable until those rules exist.
-- 2. Not in the presenting transaction. Signing timing is open (D04), so a
--    version cannot be affirmed in the transaction that presented it.
-- 3. Database time. affirmed_at is set from clock_timestamp() when the row is
--    written; a caller cannot supply it.
-- 4. Append-only for the runtime role: SELECT and INSERT only.
--
-- Trigger functions run as the invoking role, pin search_path with pg_temp
-- last and schema-qualify every table. Under REPEATABLE READ or SERIALIZABLE
-- the later-version check reads the transaction's snapshot and may miss a
-- version committed after it began; callers use READ COMMITTED.

CREATE FUNCTION agreement_affirmation_stamp() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  version_sequence integer;
  version_presented_at timestamptz;
BEGIN
  -- Same key as the version-numbering trigger (migrations/0010): a
  -- presentation to this container and an affirmation in it serialize.
  PERFORM pg_advisory_xact_lock(hashtextextended('version-container:' || NEW.pairwise_agreement_id::text, 0));
  SELECT v.sequence, v.presented_at INTO version_sequence, version_presented_at
    FROM public.agreement_version v
    WHERE v.pairwise_agreement_id = NEW.pairwise_agreement_id AND v.id = NEW.agreement_version_id;
  -- A version this transaction cannot see is rejected here rather than left
  -- to the foreign key, which is checked after this trigger and could find a
  -- version committed in between.
  IF NOT FOUND OR version_sequence <> 1 OR EXISTS (
    SELECT 1 FROM public.agreement_version later
    WHERE later.pairwise_agreement_id = NEW.pairwise_agreement_id AND later.sequence > 1
  ) THEN
    RAISE EXCEPTION 'affirmation is accepted only while the container has a single presented version'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'agreement_affirmation_single_version_only';
  END IF;
  -- Signing timing is open (D04): a version cannot be affirmed in the
  -- transaction that presents it. A version presented by another transaction
  -- after this one began is also refused (fail closed; retrying succeeds).
  IF version_presented_at >= now() THEN
    RAISE EXCEPTION 'a version cannot be affirmed in the transaction that presented it'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'agreement_affirmation_after_presentation';
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
  version_presented_at timestamptz;
BEGIN
  -- Same key as the version-numbering trigger (migrations/0010): a
  -- presentation to this container and an affirmation in it serialize.
  PERFORM pg_advisory_xact_lock(hashtextextended('version-container:' || NEW.project_id::text, 0));
  SELECT v.sequence, v.presented_at INTO version_sequence, version_presented_at
    FROM public.universal_version v
    WHERE v.project_id = NEW.project_id AND v.id = NEW.universal_version_id;
  -- A version this transaction cannot see is rejected here rather than left
  -- to the foreign key, which is checked after this trigger and could find a
  -- version committed in between.
  IF NOT FOUND OR version_sequence <> 1 OR EXISTS (
    SELECT 1 FROM public.universal_version later
    WHERE later.project_id = NEW.project_id AND later.sequence > 1
  ) THEN
    RAISE EXCEPTION 'affirmation is accepted only while the container has a single presented version'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'universal_affirmation_single_version_only';
  END IF;
  -- Signing timing is open (D04): a version cannot be affirmed in the
  -- transaction that presents it. A version presented by another transaction
  -- after this one began is also refused (fail closed; retrying succeeds).
  IF version_presented_at >= now() THEN
    RAISE EXCEPTION 'a version cannot be affirmed in the transaction that presented it'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'universal_affirmation_after_presentation';
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
