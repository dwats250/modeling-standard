-- Provisions a DEDICATED PostgreSQL server for reviewer mode. Run once, as its
-- superuser, on an empty server that holds nothing else. Never on staging's or
-- a development server: the REVOKEs below would change who can connect there.
--
--   psql -v ON_ERROR_STOP=1 -v migrator_password="$M" -v runtime_password="$R" -f provision-cluster.sql
--
-- app_runtime             the group role migrations grant to.
-- ms_reviewer_migrator    owns the databases; used only by reviewer bootstrap.
-- ms_reviewer_runtime     the only credential the serving process holds.
--
-- The serving boundary (src/demo/reviewer-database.ts) refuses a role that can
-- connect to any database but modeling_standard_demo, so PUBLIC loses CONNECT
-- on the rest. Migration 0002 grants CONNECT on modeling_standard_demo to
-- app_runtime when bootstrap creates it. It does that on every migrated
-- database, so app_runtime on a shared server reaches all of them: one more
-- reason this server holds nothing else.

CREATE ROLE app_runtime NOLOGIN;
CREATE ROLE ms_reviewer_migrator LOGIN PASSWORD :'migrator_password' CREATEDB;
CREATE ROLE ms_reviewer_runtime LOGIN PASSWORD :'runtime_password' IN ROLE app_runtime;
CREATE DATABASE ms_reviewer_admin OWNER ms_reviewer_migrator;
REVOKE CONNECT ON DATABASE ms_reviewer_admin FROM PUBLIC;
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;
