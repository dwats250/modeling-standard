-- B1 professional profile and comp-card draft: database time and runtime
-- privileges. Hand-written and reviewed.
--
-- Lengths, slot-key shape, distinct slots and one row per owner are
-- declarative (migrations/0030). This migration adds:
--
-- 1. Database time. created_at and updated_at are set from clock_timestamp()
--    when a row is written, and updated_at again on every update; a caller
--    cannot supply or backdate either, and created_at never changes.
-- 2. Privileges for the runtime role:
--    professional_profile: SELECT, INSERT, UPDATE (display_name, profession, biography).
--    comp_card_draft: SELECT, INSERT, UPDATE (tagline and the five slots).
--    No DELETE, and no UPDATE of id, owner or time columns. No cascades.
--
-- Trigger functions run as the invoking role, pin search_path with pg_temp
-- last, and are not executable by PUBLIC (trigger firing does not check
-- EXECUTE).

CREATE FUNCTION toolkit_row_stamp() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := clock_timestamp();
  ELSE
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER professional_profile_stamp
  BEFORE INSERT OR UPDATE ON public.professional_profile
  FOR EACH ROW EXECUTE FUNCTION toolkit_row_stamp();
--> statement-breakpoint
CREATE TRIGGER comp_card_draft_stamp
  BEFORE INSERT OR UPDATE ON public.comp_card_draft
  FOR EACH ROW EXECUTE FUNCTION toolkit_row_stamp();
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION toolkit_row_stamp() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "professional_profile" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "comp_card_draft" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "professional_profile" TO app_runtime;
--> statement-breakpoint
GRANT UPDATE (display_name, profession, biography) ON TABLE "professional_profile" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "comp_card_draft" TO app_runtime;
--> statement-breakpoint
GRANT UPDATE (tagline, slot_hero, slot_full_body, slot_profile_view, slot_lifestyle, slot_beauty) ON TABLE "comp_card_draft" TO app_runtime;
