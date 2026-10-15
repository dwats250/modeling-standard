-- S06 accounts and party bindings: database time and runtime privileges.
-- Hand-written and reviewed.
--
-- The identity and containment rules are declarative (migrations/0015): one
-- account per (login_provider, provider_subject), one binding per party, and
-- the bound party must belong to the named project. This migration adds:
--
-- 1. Database time. account.created_at and party_account_binding.bound_at are
--    set from clock_timestamp() when the row is written; a caller cannot
--    supply or backdate them.
-- 2. Append-only for the runtime role: SELECT and INSERT only. Bindings are
--    evidence; nothing removes or rewrites one, and no foreign key cascades.
--
-- Trigger functions run as the invoking role, pin search_path with pg_temp
-- last, and are not executable by PUBLIC (trigger firing does not check
-- EXECUTE).

CREATE FUNCTION account_stamp() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER account_stamp
  BEFORE INSERT ON public.account
  FOR EACH ROW EXECUTE FUNCTION account_stamp();
--> statement-breakpoint
CREATE FUNCTION party_account_binding_stamp() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  NEW.bound_at := clock_timestamp();
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER party_account_binding_stamp
  BEFORE INSERT ON public.party_account_binding
  FOR EACH ROW EXECUTE FUNCTION party_account_binding_stamp();
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION account_stamp(), party_account_binding_stamp() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "account" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "party_account_binding" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "account" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "party_account_binding" TO app_runtime;
