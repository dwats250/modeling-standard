-- S09 live brief: the phase, live-item, presence, roster and tick guards, and
-- the runtime role's S09 privileges. Hand-written and reviewed.
--
-- Current state only. No guard reads or writes history: every rule is
-- decided from the rows as they are now (HC1).
--
-- 1. live_brief_check_phase. A brief is inserted as a draft. The only phase
--    change is draft -> live, and it is refused unless every current item has
--    stored wording and every current project party has an explicit presence
--    fact. Explicit pending states do not block it.
-- 2. brief_item_guard_live. While draft, S08 behaviour is unchanged. While
--    live: no insert; content, position and identity are fixed; a pending
--    item may settle exactly once (pending to null, value from null to a
--    value); a settled item cannot change or reopen; a delete is refused
--    unless the item is a non-universal request (the decline mechanism; who
--    may decline is checked by the data function, since the database holds no
--    actor); a universal item is never deleted.
-- 3. brief_party_presence_guard. Presence cannot be inserted, changed or
--    deleted once the brief is live.
-- 4. project_party_guard_roster. No party is added to a project whose brief
--    is live: approvers are derived from the roster, so an addition would
--    silently change who must green-light what. The roster-addition workflow
--    is a later decision.
-- 5. brief_tick_check. A tick is admitted only on a live brief, on an item
--    with stored wording and nothing pending, from a party who is one of its
--    derived approvers: universal -> the parties on site; shared project-wide
--    -> every party of the project; pair-scoped shared and money -> the pair.
--
-- Concurrency. Each guard locks the brief row FOR SHARE before reading its
-- phase, so it serializes against a phase change (which locks the row for
-- update) and then reads current state. The tick guard also locks its item
-- FOR SHARE, so a settlement or decline in flight is waited for and the
-- item re-read. A row the guard cannot see is refused (fail closed), except
-- an unknown brief on insert, which the foreign key refuses; a brief that
-- exists but is not yet visible is necessarily a draft.
--
-- Every function runs as the invoking role, pins search_path with pg_temp
-- last, schema-qualifies its tables, and is not executable by PUBLIC. Errors
-- are check_violation with a named constraint.

CREATE FUNCTION live_brief_check_phase() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
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
    RETURN NEW;
  END IF;
  IF NOT (OLD.phase = 'draft' AND NEW.phase = 'live') THEN
    RAISE EXCEPTION 'the only phase change is draft to live'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'live_brief_phase_transition';
  END IF;
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
END
$$;
--> statement-breakpoint
CREATE TRIGGER live_brief_check_phase
  BEFORE INSERT OR UPDATE ON public.live_brief
  FOR EACH ROW EXECUTE FUNCTION live_brief_check_phase();
--> statement-breakpoint
CREATE FUNCTION brief_item_guard_live() RETURNS trigger
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
CREATE TRIGGER brief_item_guard_live
  BEFORE INSERT OR UPDATE OR DELETE ON public.brief_item
  FOR EACH ROW EXECUTE FUNCTION brief_item_guard_live();
--> statement-breakpoint
CREATE FUNCTION brief_party_presence_guard() RETURNS trigger
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
    RAISE EXCEPTION 'the presence fact''s brief is not visible'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'brief_party_presence_live_fixed';
  END IF;
  IF current_phase <> 'draft' THEN
    RAISE EXCEPTION 'presence is fixed once the brief is shared'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'brief_party_presence_live_fixed';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER brief_party_presence_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.brief_party_presence
  FOR EACH ROW EXECUTE FUNCTION brief_party_presence_guard();
--> statement-breakpoint
CREATE FUNCTION project_party_guard_roster() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  current_phase text;
BEGIN
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
CREATE TRIGGER project_party_guard_roster
  BEFORE INSERT ON public.project_party
  FOR EACH ROW EXECUTE FUNCTION project_party_guard_roster();
--> statement-breakpoint
CREATE FUNCTION brief_tick_check() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  item_brief_id uuid;
  item_layer text;
  item_pair_id uuid;
  item_content text;
  item_pending text;
  current_phase text;
  approver boolean;
BEGIN
  SELECT i.brief_id, i.layer, i.pairwise_agreement_id, i.content, i.pending
    INTO item_brief_id, item_layer, item_pair_id, item_content, item_pending
    FROM public.brief_item i
    WHERE i.id = NEW.brief_item_id AND i.project_id = NEW.project_id
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'the ticked item is not in this project'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'brief_tick_requires_live';
  END IF;
  SELECT b.phase INTO current_phase FROM public.live_brief b WHERE b.id = item_brief_id FOR SHARE;
  IF current_phase IS DISTINCT FROM 'live' THEN
    RAISE EXCEPTION 'only a shared brief is ticked'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'brief_tick_requires_live';
  END IF;
  IF item_content IS NULL OR item_pending IS NOT NULL THEN
    RAISE EXCEPTION 'only a settled item with stored wording is ticked'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'brief_tick_requires_settled';
  END IF;
  IF item_layer = 'universal' THEN
    approver := EXISTS (
      SELECT 1 FROM public.brief_party_presence x
      WHERE x.brief_id = item_brief_id AND x.party_id = NEW.party_id AND x.on_site
    );
  ELSIF item_pair_id IS NOT NULL THEN
    approver := EXISTS (
      SELECT 1 FROM public.pairwise_agreement a
      WHERE a.project_id = NEW.project_id AND a.id = item_pair_id
        AND NEW.party_id IN (a.party_one_id, a.party_two_id)
    );
  ELSE
    approver := EXISTS (
      SELECT 1 FROM public.project_party p WHERE p.project_id = NEW.project_id AND p.id = NEW.party_id
    );
  END IF;
  IF NOT approver THEN
    RAISE EXCEPTION 'only a party who must green-light this item may tick it'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'brief_tick_requires_approver';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER brief_tick_check
  BEFORE INSERT OR UPDATE ON public.brief_tick
  FOR EACH ROW EXECUTE FUNCTION brief_tick_check();
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION live_brief_check_phase() FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION brief_item_guard_live() FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION brief_party_presence_guard() FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION project_party_guard_roster() FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION brief_tick_check() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "brief_party_presence" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "brief_tick" FROM PUBLIC;
--> statement-breakpoint
GRANT UPDATE ("phase") ON TABLE "live_brief" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "brief_party_presence" TO app_runtime;
--> statement-breakpoint
GRANT UPDATE ("on_site") ON TABLE "brief_party_presence" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON TABLE "brief_tick" TO app_runtime;
