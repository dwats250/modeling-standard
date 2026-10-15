CREATE TABLE "direct_invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"credential_digest" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "direct_invitation_digest_unique" UNIQUE("credential_digest"),
	CONSTRAINT "direct_invitation_digest_sha256_length" CHECK (octet_length("direct_invitation"."credential_digest") = 32)
);
--> statement-breakpoint
ALTER TABLE "direct_invitation" ADD CONSTRAINT "direct_invitation_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_invitation" ADD CONSTRAINT "direct_invitation_party_in_project_fk" FOREIGN KEY ("project_id","party_id") REFERENCES "public"."project_party"("project_id","id") ON DELETE no action ON UPDATE no action;