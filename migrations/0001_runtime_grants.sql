-- Runtime privileges for the Stage 0 synthetic tables. Hand-written and reviewed.
--
-- `app_runtime` is a NOLOGIN group role. The login role the application uses
-- (local and CI: `ms_runtime`) is a member of it; see db/provision.sql.
-- Granting to the group keeps deployment-specific login names out of migrations.
--
-- Least privilege: each table receives only what Stage 0 code needs.

REVOKE ALL ON TABLE "synthetic_resource" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "synthetic_evidence" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "synthetic_resource" TO app_runtime;
--> statement-breakpoint
-- Evidence probe: the runtime role may write and read evidence, and may never
-- UPDATE, DELETE or TRUNCATE it. This is the mechanism the probe tests.
GRANT SELECT, INSERT ON TABLE "synthetic_evidence" TO app_runtime;
