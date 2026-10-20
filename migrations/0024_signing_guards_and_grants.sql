-- S10 signing phase: the transition and fingerprint guard, the signing
-- rigidity guards, and the runtime role's S10 privilege. Hand-written and
-- reviewed.
--
-- Current state only. No guard reads or writes history, and nothing records
-- that a brief was ever frozen or withdrawn (HC1).
--
-- 1. live_brief_check_phase (replaced). Transitions: draft -> live (S09,
--    unchanged); live -> signing, refused unless the project has exactly two
--    parties and one pair and the brief is ready to sign (nothing pending,
--    every item with stored wording ticked by each of its derived
--    approvers); signing -> live (the withdrawal). Every other transition is
--    refused. (Two parties and one pair is this slice's conservative
--    engineering boundary, not a product ruling.) The fingerprint may change
--    only with the phase: it is set by
--    live -> signing and cleared by signing -> live (with the
--    live_brief_fingerprint_iff_signing check from 0023), and can never be
--    replaced in place. On live -> signing the database recomputes the
--    fingerprint (format v1, below) from the rows as they are now and
--    refuses any other value, so a stale or invented digest cannot enter
--    signing. The application computes the same digest
--    (src/briefs/live.ts, briefFingerprint); tests hold the two equal.
-- 2. brief_item_guard_live (replaced). Unchanged for draft and live; while
--    signing, every insert, update and delete is refused.
-- 3. brief_tick_guard_delete (new). No tick is removed while signing: a
--    withdrawal first returns the brief to live, then removes the tick, in
--    one transaction. Ticks cannot be added while signing either (S09's
--    brief_tick_check admits a tick only on a live brief).
-- 4. pairwise_agreement_guard_signing (new). No pair is added to a project
--    whose brief is signing: the pair topology is part of what is signed.
--    Presence is already fixed once the brief is shared
--    (brief_party_presence_guard).
-- 5. project_party_guard_roster (replaced). As in 0022, no party is added to
--    a project whose brief is shared; now race-free (below).
--
-- Roster and pair races. A party or pair insert begun before the project's
-- brief is visible to it would otherwise slip past both guards (they can
-- only lock a brief row they see), and a share or freeze counting parties
-- in its own snapshot would miss the uncommitted row. So the roster and pair
-- guards and the draft -> live and live -> signing transitions also take a
-- per-project advisory lock ('project-roster:' || project id) and then
-- re-read: whichever comes second sees the other. The guards first wait out
-- a transition in flight on the brief row, so the two lock orders cannot
-- deadlock. Like the transitions, the guards accept only READ COMMITTED.
--
-- Concurrency. As in 0022, every guard locks the brief row FOR SHARE before
-- reading its phase, and a phase change locks it for update, so a guarded
-- write and a transition serialize and each then reads current state. The
-- live -> signing checks read other tables, so like the affirmation guards
-- in 0013 they accept only READ COMMITTED, where each statement sees the
-- latest committed state; snapshot isolation could miss a tick removed
-- since the transaction began.
--
-- Fingerprint v1: SHA-256, lowercase hex, of the UTF-8 text of this JSON
-- array, with no whitespace:
--   ["modeling-standard/brief-fingerprint", 1, briefId, projectId,
--    [[partyId, onSite|null], ...]                  by partyId,
--    [[pairId, [partyId, partyId]], ...]            by pairId; party ids sorted,
--    [[itemId, layer, pairId|null, subjectId|null, shape|null, itemKey|null,
--      content|null, value|null, [approverId, ...]], ...]
--                                                   by position, then itemId]
-- Ids are lowercase UUID text; every sort is by code point (COLLATE "C");
-- strings are JSON-escaped by to_json, which matches JavaScript's
-- JSON.stringify for text PostgreSQL can store. Positions order the items
-- but are not bound (a gap would encode a declined request), and ticks are
-- not bound (at freeze they equal the approvers; how affirmation is
-- evidenced is S11's open question).
--
-- Every function runs as the invoking role, pins search_path with pg_temp
-- last, schema-qualifies its tables, and is not executable by PUBLIC (CREATE
-- OR REPLACE keeps the existing revocations). Errors are check_violation
-- with a named constraint.

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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION brief_item_guard_live() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  current_phase text;
BEGIN
  SELECT b.phase INTO current_phase FROM public.live_brief b
    WHERE b.id = (CASE WHEN TG_OP = 'INSERT' THEN NEW.brief_id ELSE OLD.brief_id END)
    FOR SHARE;
  IF NOT FOUND THEN
    IF TG_OP = 'INSERT' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'the item''s brief is not visible'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'brief_item_live_rigid';
  END IF;
  IF current_phase = 'draft' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF current_phase = 'signing' THEN
    RAISE EXCEPTION 'a brief being signed is fixed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'brief_item_signing_fixed';
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'nothing is added to a shared brief'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'brief_item_live_no_insert';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.layer = 'universal' THEN
      RAISE EXCEPTION 'universal safety material cannot be removed from a shared brief'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'brief_item_live_universal_kept';
    END IF;
    IF OLD.shape IS DISTINCT FROM 'request' THEN
      RAISE EXCEPTION 'only a declined request leaves a shared brief'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'brief_item_live_no_delete';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.brief_id IS DISTINCT FROM OLD.brief_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.layer IS DISTINCT FROM OLD.layer
     OR NEW.pairwise_agreement_id IS DISTINCT FROM OLD.pairwise_agreement_id
     OR NEW.subject_party_id IS DISTINCT FROM OLD.subject_party_id
     OR NEW.shape IS DISTINCT FROM OLD.shape
     OR NEW.item_key IS DISTINCT FROM OLD.item_key
     OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.position IS DISTINCT FROM OLD.position THEN
    RAISE EXCEPTION 'a shared item''s wording, position and identity are fixed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'brief_item_live_rigid';
  END IF;
  IF NEW.value IS DISTINCT FROM OLD.value OR NEW.pending IS DISTINCT FROM OLD.pending THEN
    IF NOT (OLD.pending IS NOT NULL AND OLD.value IS NULL AND NEW.pending IS NULL AND NEW.value IS NOT NULL) THEN
      RAISE EXCEPTION 'a shared item''s value only settles once, from pending'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'brief_item_live_rigid';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE FUNCTION brief_tick_guard_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  current_phase text;
BEGIN
  SELECT b.phase INTO current_phase
    FROM public.brief_item i
    JOIN public.live_brief b ON b.id = i.brief_id
    WHERE i.id = OLD.brief_item_id
    FOR SHARE OF b;
  -- Not found only while its item is being deleted (the foreign key's
  -- cascade), which brief_item_guard_live has already admitted.
  IF FOUND AND current_phase = 'signing' THEN
    RAISE EXCEPTION 'no tick is removed while the brief is being signed; withdraw first'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'brief_tick_signing_fixed';
  END IF;
  RETURN OLD;
END
$$;
--> statement-breakpoint
CREATE TRIGGER brief_tick_guard_delete
  BEFORE DELETE ON public.brief_tick
  FOR EACH ROW EXECUTE FUNCTION brief_tick_guard_delete();
--> statement-breakpoint
CREATE FUNCTION pairwise_agreement_guard_signing() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  current_phase text;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'pairs are added only in READ COMMITTED transactions'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'pairwise_agreement_read_committed_only';
  END IF;
  -- Wait out a transition in flight, take the project's roster lock, re-read.
  PERFORM 1 FROM public.live_brief b WHERE b.project_id = NEW.project_id FOR SHARE;
  PERFORM pg_advisory_xact_lock(hashtextextended('project-roster:' || NEW.project_id::text, 0));
  SELECT b.phase INTO current_phase FROM public.live_brief b
    WHERE b.project_id = NEW.project_id
    FOR SHARE;
  IF FOUND AND current_phase = 'signing' THEN
    RAISE EXCEPTION 'no pair is added to a project whose brief is being signed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'pairwise_agreement_signing_fixed';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER pairwise_agreement_guard_signing
  BEFORE INSERT ON public.pairwise_agreement
  FOR EACH ROW EXECUTE FUNCTION pairwise_agreement_guard_signing();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION project_party_guard_roster() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  current_phase text;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'parties are added only in READ COMMITTED transactions'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'project_party_read_committed_only';
  END IF;
  -- Wait out a transition in flight, take the project's roster lock, re-read.
  PERFORM 1 FROM public.live_brief b WHERE b.project_id = NEW.project_id FOR SHARE;
  PERFORM pg_advisory_xact_lock(hashtextextended('project-roster:' || NEW.project_id::text, 0));
  SELECT b.phase INTO current_phase FROM public.live_brief b
    WHERE b.project_id = NEW.project_id
    FOR SHARE;
  IF FOUND AND current_phase <> 'draft' THEN
    RAISE EXCEPTION 'no party is added to a project whose brief is shared'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'project_party_roster_closed';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION brief_tick_guard_delete() FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION pairwise_agreement_guard_signing() FROM PUBLIC;
--> statement-breakpoint
GRANT UPDATE ("fingerprint") ON TABLE "live_brief" TO app_runtime;
