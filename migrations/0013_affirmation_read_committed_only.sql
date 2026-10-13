-- S05 review fix: affirmation stamp triggers refuse snapshot isolation.
-- Hand-written and reviewed.
--
-- Under REPEATABLE READ or SERIALIZABLE, the single-version check in
-- migrations/0012 reads the transaction's snapshot and can miss a later
-- version committed after the transaction began, so version 1 could be
-- affirmed after version 2 exists. 0012 documented READ COMMITTED as a caller
-- rule; this makes the database enforce it. The functions are otherwise
-- unchanged, keep their pinned search_path, and keep EXECUTE revoked from
-- PUBLIC (CREATE OR REPLACE preserves privileges).

CREATE OR REPLACE FUNCTION agreement_affirmation_stamp() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  version_sequence integer;
  version_presented_at timestamptz;
BEGIN
  -- Snapshot isolation would let the later-version check below read a
  -- snapshot older than a version committed since the transaction began, so
  -- an earlier version could be affirmed after a later one exists. Only READ
  -- COMMITTED, where each statement here sees the latest committed state
  -- after the advisory lock, is accepted.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'affirmations are accepted only in READ COMMITTED transactions'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'agreement_affirmation_read_committed_only';
  END IF;
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
CREATE OR REPLACE FUNCTION universal_affirmation_stamp() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  version_sequence integer;
  version_presented_at timestamptz;
BEGIN
  -- Snapshot isolation would let the later-version check below read a
  -- snapshot older than a version committed since the transaction began, so
  -- an earlier version could be affirmed after a later one exists. Only READ
  -- COMMITTED, where each statement here sees the latest committed state
  -- after the advisory lock, is accepted.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'affirmations are accepted only in READ COMMITTED transactions'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'universal_affirmation_read_committed_only';
  END IF;
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
