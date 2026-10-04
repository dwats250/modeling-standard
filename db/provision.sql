-- Local development and CI database provisioning. Run once, as a PostgreSQL
-- superuser, against a fresh server. NOT a migration and NOT for production:
-- production roles and passwords are provisioned by whoever operates the
-- database, which Stage 0 deliberately does not choose.
--
-- Two credentials, two purposes:
--   ms_migrator  owns the database and its schema objects; runs migrations.
--                CREATEDB is a local/CI convenience so the test suite can
--                create disposable databases; production would not grant it.
--   ms_runtime   the application's credential. Holds no ownership and only the
--                privileges migrations grant to its group role, app_runtime.

CREATE ROLE app_runtime NOLOGIN;
CREATE ROLE ms_migrator LOGIN PASSWORD 'ms_migrator_local_only' CREATEDB;
CREATE ROLE ms_runtime LOGIN PASSWORD 'ms_runtime_local_only' IN ROLE app_runtime;
CREATE DATABASE modeling_standard OWNER ms_migrator;
