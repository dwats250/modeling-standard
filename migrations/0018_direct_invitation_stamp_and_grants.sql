-- S07 direct invitations: database time and runtime privileges. Hand-written
-- and reviewed.
--
-- Containment and digest uniqueness are declarative (migrations/0017). This
-- migration adds:
--
-- 1. Database time. direct_invitation.created_at is set from
--    clock_timestamp() when the row is written; a caller cannot supply or
--    backdate it.
-- 2. Append-only for the runtime role: SELECT and INSERT only. No foreign key
--    cascades.
--
-- The trigger function runs as the invoking role, pins search_path with
-- pg_temp last, and is not executable by PUBLIC (trigger firing does not
-- check EXECUTE).

CREATE FUNCTION direct_invitation_stamp() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER direct_invitation_stamp
  BEFORE INSERT ON public.direct_invitation
  FOR EACH ROW EXECUTE FUNCTION direct_invitation_stamp();
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION direct_invitation_stamp() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "direct_invitation" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "direct_invitation" TO app_runtime;
