-- S12 sessions and sign-in attempts: database time, the end-once guard and
-- runtime privileges. Hand-written and reviewed.
--
-- Digest uniqueness and lengths, shapes and expiry-after-creation are
-- declarative (migrations/0026). This migration adds:
--
-- 1. Database time. account_session.created_at and sign_in_attempt.created_at
--    are set from clock_timestamp() when the row is written; a caller cannot
--    supply or backdate them.
-- 2. A session is ended at most once, at database time: ended_at goes from
--    null to clock_timestamp() and never changes again. No other column of a
--    session can change (privilege), and no session is deleted.
-- 3. Privileges for the runtime role:
--    account_session: SELECT, INSERT, UPDATE (ended_at).
--    sign_in_attempt: SELECT, INSERT, DELETE (consuming an attempt deletes it).
--    No foreign key cascades.
--
-- Trigger functions run as the invoking role, pin search_path with pg_temp
-- last, and are not executable by PUBLIC (trigger firing does not check
-- EXECUTE).

CREATE FUNCTION account_session_stamp() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  NEW.created_at := clock_timestamp();
  IF NEW.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'a session cannot be created ended'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'account_session_created_open';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER account_session_stamp
  BEFORE INSERT ON public.account_session
  FOR EACH ROW EXECUTE FUNCTION account_session_stamp();
--> statement-breakpoint
CREATE FUNCTION account_session_end_once() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF OLD.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'a session is ended once'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'account_session_ended_once';
  END IF;
  IF NEW.ended_at IS NULL THEN
    RAISE EXCEPTION 'a session can only be ended'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'account_session_ended_once';
  END IF;
  NEW.ended_at := clock_timestamp();
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER account_session_end_once
  BEFORE UPDATE ON public.account_session
  FOR EACH ROW EXECUTE FUNCTION account_session_end_once();
--> statement-breakpoint
CREATE FUNCTION sign_in_attempt_stamp() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER sign_in_attempt_stamp
  BEFORE INSERT ON public.sign_in_attempt
  FOR EACH ROW EXECUTE FUNCTION sign_in_attempt_stamp();
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION account_session_stamp() FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION account_session_end_once() FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION sign_in_attempt_stamp() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "account_session" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "sign_in_attempt" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "account_session" TO app_runtime;
--> statement-breakpoint
GRANT UPDATE (ended_at) ON TABLE "account_session" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON TABLE "sign_in_attempt" TO app_runtime;
