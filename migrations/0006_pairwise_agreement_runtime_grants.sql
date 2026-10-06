-- Runtime privileges for the S02 pairwise agreement table. Hand-written and reviewed.
--
-- Least privilege: S02 records and reads agreement relationships. Nothing in
-- S02 updates or removes one, so the runtime group receives SELECT and INSERT
-- only (SELECT is also what INSERT ... RETURNING needs). The foreign keys to
-- project and project_party are checked by PostgreSQL with the table owner's
-- rights, so no REFERENCES grant is needed.

REVOKE ALL ON TABLE "pairwise_agreement" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "pairwise_agreement" TO app_runtime;
