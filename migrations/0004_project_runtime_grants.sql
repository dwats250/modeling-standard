-- Runtime privileges for the S01 project and party tables. Hand-written and reviewed.
--
-- Least privilege: S01 creates and reads projects, and records project-local
-- parties. Nothing in S01 updates or removes either, so the runtime group
-- receives SELECT and INSERT only (SELECT is also what INSERT ... RETURNING
-- needs). The foreign key from project_party to project is checked by
-- PostgreSQL with the table owner's rights, so no REFERENCES grant is needed.

REVOKE ALL ON TABLE "project" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "project_party" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "project" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "project_party" TO app_runtime;
