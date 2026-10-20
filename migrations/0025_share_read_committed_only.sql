-- S10 review fix: sharing refuses snapshot isolation. Hand-written and
-- reviewed.
--
-- 0024 made live -> signing accept only READ COMMITTED, but not draft ->
-- live. The per-project roster lock serializes a share with a party insert,
-- yet it cannot refresh a REPEATABLE READ or SERIALIZABLE transaction's
-- snapshot: with its snapshot taken before a third party was committed, a
-- share counted only the parties it could see and committed a live brief
-- with a party lacking a presence fact (reproduced under both levels). As in
-- 0013 and 0024's other cross-table guards, the database now enforces READ
-- COMMITTED for the share. live_brief_check_phase is otherwise unchanged; it
-- keeps its pinned search_path, and CREATE OR REPLACE keeps EXECUTE revoked
-- from PUBLIC.

CREATE OR REPLACE FUNCTION live_brief_check_phase() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  canonical text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.phase IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'a live brief begins as a draft'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'live_brief_phase_transition';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    RAISE EXCEPTION 'a live brief''s identity cannot change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'live_brief_phase_transition';
  END IF;
  IF NEW.phase IS NOT DISTINCT FROM OLD.phase THEN
    IF NEW.fingerprint IS DISTINCT FROM OLD.fingerprint THEN
      RAISE EXCEPTION 'the fingerprint changes only with the phase'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'live_brief_fingerprint_fixed';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.phase = 'draft' AND NEW.phase = 'live' THEN
    -- The share checks below read other tables (items, parties, presence).
    -- Under REPEATABLE READ or SERIALIZABLE they read the transaction's
    -- snapshot, which the roster lock cannot refresh: a party committed
    -- after the snapshot would be missed and the brief shared without that
    -- party's presence fact. Only READ COMMITTED is accepted, as for
    -- live -> signing.
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'a brief is shared only in a READ COMMITTED transaction'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'live_brief_share_read_committed_only';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('project-roster:' || NEW.project_id::text, 0));
    IF EXISTS (SELECT 1 FROM public.brief_item i WHERE i.brief_id = NEW.id AND i.content IS NULL) THEN
      RAISE EXCEPTION 'every item needs its exact wording stored before the brief is shared'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'live_brief_share_requires_wording';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.project_party p
      WHERE p.project_id = NEW.project_id
        AND NOT EXISTS (
          SELECT 1 FROM public.brief_party_presence x WHERE x.brief_id = NEW.id AND x.party_id = p.id
        )
    ) THEN
      RAISE EXCEPTION 'every party needs an explicit on-site fact before the brief is shared'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'live_brief_share_requires_presence';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.phase = 'live' AND NEW.phase = 'signing' THEN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'a brief enters signing only in a READ COMMITTED transaction'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'live_brief_signing_read_committed_only';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('project-roster:' || NEW.project_id::text, 0));
    IF (SELECT count(*) FROM public.project_party p WHERE p.project_id = NEW.project_id) <> 2
       OR (SELECT count(*) FROM public.pairwise_agreement a WHERE a.project_id = NEW.project_id) <> 1 THEN
      RAISE EXCEPTION 'only a brief between exactly two parties and one pair enters signing'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'live_brief_signing_requires_two_party';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.brief_item i
      WHERE i.brief_id = NEW.id AND (i.content IS NULL OR i.pending IS NOT NULL)
    ) OR EXISTS (
      -- An item and one of its derived approvers (as in brief_tick_check)
      -- without that approver's tick.
      SELECT 1
      FROM public.brief_item i
      JOIN public.project_party p ON p.project_id = i.project_id
      WHERE i.brief_id = NEW.id
        AND CASE
          WHEN i.layer = 'universal' THEN EXISTS (
            SELECT 1 FROM public.brief_party_presence x
            WHERE x.brief_id = i.brief_id AND x.party_id = p.id AND x.on_site
          )
          WHEN i.pairwise_agreement_id IS NOT NULL THEN EXISTS (
            SELECT 1 FROM public.pairwise_agreement a
            WHERE a.project_id = i.project_id AND a.id = i.pairwise_agreement_id
              AND p.id IN (a.party_one_id, a.party_two_id)
          )
          ELSE true
        END
        AND NOT EXISTS (
          SELECT 1 FROM public.brief_tick t WHERE t.brief_item_id = i.id AND t.party_id = p.id
        )
    ) THEN
      RAISE EXCEPTION 'only a brief that is ready to sign enters signing'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'live_brief_signing_requires_ready';
    END IF;
    canonical := '[' || to_json('modeling-standard/brief-fingerprint'::text)::text || ',1,'
      || to_json(NEW.id::text)::text || ',' || to_json(NEW.project_id::text)::text || ',['
      || coalesce((
        SELECT string_agg('[' || to_json(p.id::text)::text || ',' || coalesce(x.on_site::text, 'null') || ']', ','
                          ORDER BY p.id::text COLLATE "C")
        FROM public.project_party p
        LEFT JOIN public.brief_party_presence x ON x.brief_id = NEW.id AND x.party_id = p.id
        WHERE p.project_id = NEW.project_id
      ), '') || '],['
      || coalesce((
        SELECT string_agg('[' || to_json(a.id::text)::text || ',['
                            || to_json(least(a.party_one_id::text COLLATE "C", a.party_two_id::text COLLATE "C"))::text || ','
                            || to_json(greatest(a.party_one_id::text COLLATE "C", a.party_two_id::text COLLATE "C"))::text || ']]', ','
                          ORDER BY a.id::text COLLATE "C")
        FROM public.pairwise_agreement a
        WHERE a.project_id = NEW.project_id
      ), '') || '],['
      || coalesce((
        SELECT string_agg('[' || to_json(i.id::text)::text
                            || ',' || to_json(i.layer)::text
                            || ',' || coalesce(to_json(i.pairwise_agreement_id::text)::text, 'null')
                            || ',' || coalesce(to_json(i.subject_party_id::text)::text, 'null')
                            || ',' || coalesce(to_json(i.shape)::text, 'null')
                            || ',' || coalesce(to_json(i.item_key)::text, 'null')
                            || ',' || coalesce(to_json(i.content)::text, 'null')
                            || ',' || coalesce(to_json(i.value)::text, 'null')
                            || ',[' || coalesce((
                              SELECT string_agg(to_json(p.id::text)::text, ',' ORDER BY p.id::text COLLATE "C")
                              FROM public.project_party p
                              WHERE p.project_id = i.project_id
                                AND CASE
                                  WHEN i.layer = 'universal' THEN EXISTS (
                                    SELECT 1 FROM public.brief_party_presence x
                                    WHERE x.brief_id = i.brief_id AND x.party_id = p.id AND x.on_site
                                  )
                                  WHEN i.pairwise_agreement_id IS NOT NULL THEN EXISTS (
                                    SELECT 1 FROM public.pairwise_agreement a
                                    WHERE a.project_id = i.project_id AND a.id = i.pairwise_agreement_id
                                      AND p.id IN (a.party_one_id, a.party_two_id)
                                  )
                                  ELSE true
                                END
                            ), '') || ']]', ','
                          ORDER BY i.position, i.id::text COLLATE "C")
        FROM public.brief_item i
        WHERE i.brief_id = NEW.id
      ), '') || ']]';
    IF NEW.fingerprint IS DISTINCT FROM encode(sha256(convert_to(canonical, 'UTF8')), 'hex') THEN
      RAISE EXCEPTION 'the fingerprint does not match the brief as it is now'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'live_brief_signing_fingerprint_mismatch';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.phase = 'signing' AND NEW.phase = 'live' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'that phase change is not allowed'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'live_brief_phase_transition';
END
$$;
