-- S11 final contract: the signing -> final transition, the contract
-- guards, the final-phase rigidity guards and the runtime role's S11
-- privileges. Hand-written and reviewed.
--
-- 1. live_brief_check_phase (replaced; 0025 otherwise unchanged). A new
--    transition, signing -> final, admitted only in READ COMMITTED and only
--    when the brief's contract exists with the fingerprint the brief was
--    frozen with, holds exactly the project's parties and one signature by
--    each over that fingerprint, and is a verbatim copy of the brief's items
--    as they are now (every stored column equal; the canonical order as
--    1..n; each item's derived approvers, sorted). The fingerprint is
--    cleared (live_brief_fingerprint_iff_signing). 'final' is terminal: no
--    transition leaves it.
-- 2. brief_item_guard_live (replaced). While final, an item may only be
--    deleted (finalization deletes the brief's items: HC1). Ticks: S09's
--    brief_tick_check admits a tick only on a live brief, and S10's
--    brief_tick_guard_delete refuses a removal only while signing, so
--    finalization may delete them. Presence and roster stay fixed
--    (brief_party_presence_guard, project_party_guard_roster: not draft).
-- 3. pairwise_agreement_guard_signing (replaced). No pair is added once the
--    brief is final, either.
-- 4. contract_check_insert (new). A contract is written only for a brief
--    that is signing, with its fingerprint, in READ COMMITTED; the brief row
--    is locked FOR SHARE, so a withdrawal and a contract write serialize.
-- 5. contract_require_final (new, a deferred constraint trigger). At commit
--    a contract's brief must be final: a contract cannot be left behind by
--    a transaction that did not finalize (and so cannot block a later
--    finalization through the one-per-brief key).
-- 6. contract_part_check (new). A contract party, item or signature is
--    written only while its contract's brief is signing with the contract's
--    fingerprint. Because a committed contract always has a final brief,
--    nothing can be added to a committed contract. A party's account must
--    be the party's binding (D12) and its on-site fact the brief's. A
--    signature must bind the contract's fingerprint and is written in chain
--    order (sequence = 1 + the number of the contract's parties with a
--    lower id, each after the one before); the database sets signed_at to
--    the transaction time truncated to milliseconds, and computes prev_hash
--    (the fingerprint for sequence 1, else the previous record_hash) and
--    record_hash, overwriting anything supplied.
-- 7. Privileges. Runtime: SELECT, INSERT on the four contract tables;
--    nothing else. No foreign key cascades.
--
-- So no table holds one signature without the other, and nothing in the
-- contract changes once written.
--
-- Signature record v1 (record_hash): SHA-256, lowercase hex, of the UTF-8
-- text of this JSON array, with no whitespace:
--   ["modeling-standard/contract-signature", 1, contractId, sequence,
--    partyId, accountId, fingerprint, signedAtMs, ip|null, userAgent|null,
--    prevHash]
-- Ids are lowercase UUID text; signedAtMs is the integer Unix time in
-- milliseconds; ip is host(ip), a single host address; strings are
-- JSON-escaped by to_json, which matches JavaScript's JSON.stringify for
-- text PostgreSQL can store. The application recomputes it
-- (src/contracts/contract.ts, verifyContractChain).
--
-- Every function runs as the invoking role, pins search_path with pg_temp
-- last, schema-qualifies its tables, and is not executable by PUBLIC (CREATE
-- OR REPLACE keeps the existing revocations). Errors are check_violation
-- with a named constraint.

CREATE OR REPLACE FUNCTION live_brief_check_phase() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  canonical text;
  final_contract uuid;
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

  IF OLD.phase = 'signing' AND NEW.phase = 'final' THEN
    -- The checks read the contract tables and the brief's rows; like the
    -- other cross-table transitions they accept only READ COMMITTED.
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'a brief is finalized only in a READ COMMITTED transaction'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'live_brief_final_read_committed_only';
    END IF;
    SELECT c.id INTO final_contract FROM public.contract c
      WHERE c.brief_id = NEW.id AND c.project_id = NEW.project_id AND c.fingerprint = OLD.fingerprint;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'a brief is finalized only by its contract, with the fingerprint it was frozen with'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'live_brief_final_requires_contract';
    END IF;
    -- Exactly the project's parties, each with exactly one signature over
    -- the fingerprint. (Binding, presence and the chain are checked as each
    -- row is written.)
    IF (SELECT count(*) FROM public.contract_party cp WHERE cp.contract_id = final_contract)
         <> (SELECT count(*) FROM public.project_party p WHERE p.project_id = NEW.project_id)
       OR EXISTS (
         SELECT 1 FROM public.project_party p
         WHERE p.project_id = NEW.project_id
           AND NOT EXISTS (SELECT 1 FROM public.contract_party cp WHERE cp.contract_id = final_contract AND cp.party_id = p.id)
       )
       OR (SELECT count(*) FROM public.contract_signature s WHERE s.contract_id = final_contract AND s.fingerprint = OLD.fingerprint) <> 2
       OR EXISTS (
         SELECT 1 FROM public.contract_party cp
         WHERE cp.contract_id = final_contract
           AND NOT EXISTS (SELECT 1 FROM public.contract_signature s WHERE s.contract_id = final_contract AND s.party_id = cp.party_id)
       ) THEN
      RAISE EXCEPTION 'a contract needs both parties and both signatures'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'live_brief_final_requires_signatures';
    END IF;
    -- The copy is verbatim: one contract item per brief item, equal in
    -- every stored column, in the brief's canonical order (position, then
    -- id) as 1..n, with the item's derived approvers (as brief_tick_check
    -- derives them), sorted.
    IF (SELECT count(*) FROM public.contract_item ci WHERE ci.contract_id = final_contract)
         <> (SELECT count(*) FROM public.brief_item i WHERE i.brief_id = NEW.id)
       OR EXISTS (
         SELECT 1
         FROM (
           SELECT i.*, row_number() OVER (ORDER BY i.position, i.id::text COLLATE "C") AS ordinal
           FROM public.brief_item i WHERE i.brief_id = NEW.id
         ) b
         WHERE NOT EXISTS (
           SELECT 1 FROM public.contract_item ci
           WHERE ci.contract_id = final_contract
             AND ci.item_id = b.id
             AND ci.position = b.ordinal
             AND ci.layer = b.layer
             AND ci.pairwise_agreement_id IS NOT DISTINCT FROM b.pairwise_agreement_id
             AND ci.subject_party_id IS NOT DISTINCT FROM b.subject_party_id
             AND ci.shape IS NOT DISTINCT FROM b.shape
             AND ci.item_key IS NOT DISTINCT FROM b.item_key
             AND ci.content IS NOT DISTINCT FROM b.content
             AND ci.value IS NOT DISTINCT FROM b.value
             AND ci.approver_party_ids = ARRAY(
               SELECT p.id FROM public.project_party p
               WHERE p.project_id = b.project_id
                 AND CASE
                   WHEN b.layer = 'universal' THEN EXISTS (
                     SELECT 1 FROM public.brief_party_presence x
                     WHERE x.brief_id = b.brief_id AND x.party_id = p.id AND x.on_site
                   )
                   WHEN b.pairwise_agreement_id IS NOT NULL THEN EXISTS (
                     SELECT 1 FROM public.pairwise_agreement a
                     WHERE a.project_id = b.project_id AND a.id = b.pairwise_agreement_id
                       AND p.id IN (a.party_one_id, a.party_two_id)
                   )
                   ELSE true
                 END
               ORDER BY p.id::text COLLATE "C"
             )
         )
       ) THEN
      RAISE EXCEPTION 'the contract must be a verbatim copy of the frozen brief'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'live_brief_final_copy_mismatch';
    END IF;
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

  IF current_phase = 'final' THEN
    -- Finalization deletes the brief's items once the contract holds them
    -- (HC1); nothing else changes an item of a final brief.
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'a final brief is fixed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'brief_item_final_fixed';
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
CREATE OR REPLACE FUNCTION pairwise_agreement_guard_signing() RETURNS trigger
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
  IF FOUND AND current_phase = 'final' THEN
    RAISE EXCEPTION 'no pair is added to a project whose brief is final'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'pairwise_agreement_final_fixed';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE FUNCTION contract_check_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  brief record;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'a contract is written only in a READ COMMITTED transaction'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'contract_read_committed_only';
  END IF;
  SELECT b.phase, b.fingerprint INTO brief FROM public.live_brief b
    WHERE b.id = NEW.brief_id AND b.project_id = NEW.project_id
    FOR SHARE;
  IF NOT FOUND OR brief.phase IS DISTINCT FROM 'signing' OR brief.fingerprint IS DISTINCT FROM NEW.fingerprint THEN
    RAISE EXCEPTION 'a contract is written only for a brief being signed, with its fingerprint'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'contract_requires_signing_brief';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER contract_check_insert
  BEFORE INSERT ON public.contract
  FOR EACH ROW EXECUTE FUNCTION contract_check_insert();
--> statement-breakpoint
CREATE FUNCTION contract_require_final() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.live_brief b WHERE b.id = NEW.brief_id AND b.phase = 'final') THEN
    RAISE EXCEPTION 'a contract is committed only with its brief final'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'contract_requires_final_brief';
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER contract_require_final
  AFTER INSERT ON public.contract
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION contract_require_final();
--> statement-breakpoint
CREATE FUNCTION contract_part_check() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  contract_brief uuid;
  contract_fingerprint text;
  brief_phase text;
  brief_fingerprint text;
  previous_hash text;
  canonical text;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'a contract is written only in a READ COMMITTED transaction'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'contract_read_committed_only';
  END IF;
  SELECT c.brief_id, c.fingerprint INTO contract_brief, contract_fingerprint FROM public.contract c
    WHERE c.id = NEW.contract_id AND c.project_id = NEW.project_id;
  IF contract_brief IS NOT NULL THEN
    SELECT b.phase, b.fingerprint INTO brief_phase, brief_fingerprint FROM public.live_brief b WHERE b.id = contract_brief FOR SHARE;
  END IF;
  IF contract_brief IS NULL OR brief_phase IS DISTINCT FROM 'signing' OR brief_fingerprint IS DISTINCT FROM contract_fingerprint THEN
    RAISE EXCEPTION 'nothing is added to a contract once it is written'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'contract_part_requires_signing_brief';
  END IF;

  IF TG_TABLE_NAME = 'contract_party' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.party_account_binding x
      WHERE x.project_id = NEW.project_id AND x.party_id = NEW.party_id AND x.account_id = NEW.account_id
    ) THEN
      RAISE EXCEPTION 'a contract party''s account must be the one bound to that party'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'contract_party_requires_binding';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.brief_party_presence x
      WHERE x.brief_id = contract_brief AND x.party_id = NEW.party_id AND x.on_site = NEW.on_site
    ) THEN
      RAISE EXCEPTION 'a contract party''s on-site fact must be the brief''s'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'contract_party_presence_mismatch';
    END IF;
  ELSIF TG_TABLE_NAME = 'contract_signature' THEN
    IF NEW.fingerprint IS DISTINCT FROM contract_fingerprint THEN
      RAISE EXCEPTION 'a signature binds the contract''s fingerprint'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'contract_signature_fingerprint_mismatch';
    END IF;
    -- Serialize the contract's signature writes, then check the chain order.
    PERFORM pg_advisory_xact_lock(hashtextextended('contract-signature:' || NEW.contract_id::text, 0));
    IF NEW.sequence IS DISTINCT FROM 1 + (
         SELECT count(*) FROM public.contract_party cp
         WHERE cp.contract_id = NEW.contract_id AND cp.party_id::text COLLATE "C" < NEW.party_id::text COLLATE "C"
       )
       OR NEW.sequence IS DISTINCT FROM 1 + (SELECT count(*) FROM public.contract_signature s WHERE s.contract_id = NEW.contract_id) THEN
      RAISE EXCEPTION 'signatures are written in chain order, by party id'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'contract_signature_chain_order';
    END IF;
    NEW.signed_at := date_trunc('milliseconds', transaction_timestamp());
    IF NEW.sequence = 1 THEN
      NEW.prev_hash := contract_fingerprint;
    ELSE
      SELECT s.record_hash INTO previous_hash FROM public.contract_signature s
        WHERE s.contract_id = NEW.contract_id AND s.sequence = NEW.sequence - 1;
      NEW.prev_hash := previous_hash;
    END IF;
    canonical := '[' || to_json('modeling-standard/contract-signature'::text)::text || ',1,'
      || to_json(NEW.contract_id::text)::text || ','
      || NEW.sequence::text || ','
      || to_json(NEW.party_id::text)::text || ','
      || to_json(NEW.account_id::text)::text || ','
      || to_json(NEW.fingerprint)::text || ','
      || (extract(epoch FROM NEW.signed_at) * 1000)::bigint::text || ','
      || coalesce(to_json(host(NEW.ip))::text, 'null') || ','
      || coalesce(to_json(NEW.user_agent)::text, 'null') || ','
      || to_json(NEW.prev_hash)::text || ']';
    NEW.record_hash := encode(sha256(convert_to(canonical, 'UTF8')), 'hex');
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER contract_party_check
  BEFORE INSERT ON public.contract_party
  FOR EACH ROW EXECUTE FUNCTION contract_part_check();
--> statement-breakpoint
CREATE TRIGGER contract_item_check
  BEFORE INSERT ON public.contract_item
  FOR EACH ROW EXECUTE FUNCTION contract_part_check();
--> statement-breakpoint
CREATE TRIGGER contract_signature_check
  BEFORE INSERT ON public.contract_signature
  FOR EACH ROW EXECUTE FUNCTION contract_part_check();
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION contract_check_insert() FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION contract_require_final() FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION contract_part_check() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "contract" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "contract_party" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "contract_item" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "contract_signature" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "contract" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "contract_party" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "contract_item" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "contract_signature" TO app_runtime;
