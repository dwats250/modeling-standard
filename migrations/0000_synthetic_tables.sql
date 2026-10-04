CREATE TABLE "synthetic_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payload" "bytea" NOT NULL,
	"sha256" "bytea" NOT NULL,
	CONSTRAINT "synthetic_evidence_sha256_matches_payload" CHECK ("synthetic_evidence"."sha256" = sha256("synthetic_evidence"."payload"))
);
--> statement-breakpoint
CREATE TABLE "synthetic_resource" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_principal_id" text NOT NULL,
	"label" text NOT NULL
);
