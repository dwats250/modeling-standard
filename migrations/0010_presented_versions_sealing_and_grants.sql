-- S04 presented versions: sealing, copy fidelity, numbering, database time and
-- runtime privileges. Hand-written and reviewed.
--
-- A presented version is evidence of exactly which terms, in which order and
-- with which wording, were frozen for presentation (DOCTRINE:46: clause text is
-- frozen as presented). The database, not application code, guarantees:
--
-- 1. Sealed on creation. Deferred constraint triggers check, at commit, that a
--    version holds exactly term_count terms in positions 1..term_count
--    (positions are unique and >= 1, so this means exactly 1..term_count). The
--    count includes committed rows and the checking transaction's own rows, so
--    a term added to an existing version by any later transaction fails, under
--    any isolation level, and a version cannot commit short of its terms.
-- 2. Faithful copy. A presented term must copy the text of a source term of
--    the same container that the inserting transaction can see. A source it
--    cannot see is rejected outright rather than left to the deferred
--    foreign-key check, so a concurrently committed term cannot be copied
--    with different text.
-- 3. Numbering. A version's sequence must be its container's next number,
--    checked under a per-container advisory lock: no gaps, no back-filling.
-- 4. Database time. presented_at is set from clock_timestamp() when the row is
--    written; a caller cannot supply it.
-- 5. No change afterwards. The runtime role gets SELECT and INSERT only.
--
-- Trigger functions run as the invoking role, which can read every table they
-- read. Each pins search_path with pg_temp last and schema-qualifies every
-- table, so temporary objects cannot shadow them.

CREATE FUNCTION agreement_version_check_sealed() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  version_id uuid;
  expected integer;
  actual integer;
  outside integer;
BEGIN
  version_id := CASE TG_TABLE_NAME
    WHEN 'agreement_version' THEN NEW.id
    ELSE (to_jsonb(NEW) ->> 'agreement_version_id')::uuid
  END;
  SELECT v.term_count INTO expected FROM public.agreement_version v WHERE v.id = version_id;
  SELECT count(*), count(*) FILTER (WHERE t.position > expected)
    INTO actual, outside
    FROM public.agreement_version_term t WHERE t.agreement_version_id = version_id;
  IF actual <> expected OR outside > 0 THEN
    RAISE EXCEPTION 'a presented agreement version must hold exactly term_count terms in positions 1 to term_count'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'agreement_version_sealed';
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER agreement_version_sealed
  AFTER INSERT ON public.agreement_version DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION agreement_version_check_sealed();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER agreement_version_term_sealed
  AFTER INSERT ON public.agreement_version_term DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION agreement_version_check_sealed();
--> statement-breakpoint
CREATE FUNCTION agreement_version_term_check_copy() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  source_content text;
BEGIN
  SELECT s.content INTO source_content FROM public.agreement_term s
    WHERE s.pairwise_agreement_id = NEW.pairwise_agreement_id AND s.id = NEW.agreement_term_id;
  IF NOT FOUND OR source_content IS DISTINCT FROM NEW.content THEN
    RAISE EXCEPTION 'a presented term must copy the exact text of a visible term of the same agreement'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'agreement_version_term_faithful_copy';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER agreement_version_term_faithful_copy
  BEFORE INSERT ON public.agreement_version_term
  FOR EACH ROW EXECUTE FUNCTION agreement_version_term_check_copy();
--> statement-breakpoint
CREATE FUNCTION agreement_version_stamp() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  next_sequence integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('version-container:' || NEW.pairwise_agreement_id::text, 0));
  SELECT coalesce(max(v.sequence), 0) + 1 INTO next_sequence
    FROM public.agreement_version v WHERE v.pairwise_agreement_id = NEW.pairwise_agreement_id;
  IF NEW.sequence IS DISTINCT FROM next_sequence THEN
    RAISE EXCEPTION 'a presented version must take its container''s next sequence number'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'agreement_version_sequence_next';
  END IF;
  NEW.presented_at := clock_timestamp();
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER agreement_version_stamp
  BEFORE INSERT ON public.agreement_version
  FOR EACH ROW EXECUTE FUNCTION agreement_version_stamp();
--> statement-breakpoint
CREATE FUNCTION universal_version_check_sealed() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  version_id uuid;
  expected integer;
  actual integer;
  outside integer;
BEGIN
  version_id := CASE TG_TABLE_NAME
    WHEN 'universal_version' THEN NEW.id
    ELSE (to_jsonb(NEW) ->> 'universal_version_id')::uuid
  END;
  SELECT v.term_count INTO expected FROM public.universal_version v WHERE v.id = version_id;
  SELECT count(*), count(*) FILTER (WHERE t.position > expected)
    INTO actual, outside
    FROM public.universal_version_term t WHERE t.universal_version_id = version_id;
  IF actual <> expected OR outside > 0 THEN
    RAISE EXCEPTION 'a presented universal version must hold exactly term_count terms in positions 1 to term_count'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'universal_version_sealed';
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER universal_version_sealed
  AFTER INSERT ON public.universal_version DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION universal_version_check_sealed();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER universal_version_term_sealed
  AFTER INSERT ON public.universal_version_term DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION universal_version_check_sealed();
--> statement-breakpoint
CREATE FUNCTION universal_version_term_check_copy() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  source_content text;
BEGIN
  SELECT s.content INTO source_content FROM public.universal_term s
    WHERE s.project_id = NEW.project_id AND s.id = NEW.universal_term_id;
  IF NOT FOUND OR source_content IS DISTINCT FROM NEW.content THEN
    RAISE EXCEPTION 'a presented term must copy the exact text of a visible term of the same project'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'universal_version_term_faithful_copy';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER universal_version_term_faithful_copy
  BEFORE INSERT ON public.universal_version_term
  FOR EACH ROW EXECUTE FUNCTION universal_version_term_check_copy();
--> statement-breakpoint
CREATE FUNCTION universal_version_stamp() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  next_sequence integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('version-container:' || NEW.project_id::text, 0));
  SELECT coalesce(max(v.sequence), 0) + 1 INTO next_sequence
    FROM public.universal_version v WHERE v.project_id = NEW.project_id;
  IF NEW.sequence IS DISTINCT FROM next_sequence THEN
    RAISE EXCEPTION 'a presented version must take its container''s next sequence number'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'universal_version_sequence_next';
  END IF;
  NEW.presented_at := clock_timestamp();
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER universal_version_stamp
  BEFORE INSERT ON public.universal_version
  FOR EACH ROW EXECUTE FUNCTION universal_version_stamp();
--> statement-breakpoint
-- The trigger functions exist only for the triggers above.
REVOKE EXECUTE ON FUNCTION
  agreement_version_check_sealed(),
  agreement_version_term_check_copy(),
  agreement_version_stamp(),
  universal_version_check_sealed(),
  universal_version_term_check_copy(),
  universal_version_stamp()
FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "agreement_version" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "agreement_version_term" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "universal_version" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "universal_version_term" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "agreement_version" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "agreement_version_term" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "universal_version" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "universal_version_term" TO app_runtime;
