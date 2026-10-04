-- Database-level least privilege. Hand-written and reviewed.
--
-- By default PostgreSQL lets PUBLIC connect to any database and create
-- temporary tables in it. Remove both, then allow only the runtime group to
-- connect. The migration role owns the database and is unaffected.
-- The database name is resolved at run time so the same migration applies to
-- development, test and any later database.

DO $$
BEGIN
  EXECUTE format('REVOKE CONNECT, TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_runtime', current_database());
END
$$;
