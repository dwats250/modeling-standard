-- Runtime privileges for the S03 term tables. Hand-written and reviewed.
--
-- Least privilege: S03 adds terms and reads them. Nothing in S03 edits or
-- removes a term, so the runtime group receives SELECT and INSERT only (SELECT
-- is also what INSERT ... RETURNING needs). Foreign keys are checked with the
-- table owner's rights, so no REFERENCES grant is needed.

REVOKE ALL ON TABLE "universal_term" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "agreement_term" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "universal_term" TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "agreement_term" TO app_runtime;
