ALTER TABLE "project_party" ADD CONSTRAINT "project_party_project_id_id_unique" UNIQUE("project_id","id");--> statement-breakpoint
CREATE TABLE "pairwise_agreement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"party_one_id" uuid NOT NULL,
	"party_two_id" uuid NOT NULL,
	CONSTRAINT "pairwise_agreement_distinct_parties" CHECK ("pairwise_agreement"."party_one_id" <> "pairwise_agreement"."party_two_id"),
	CONSTRAINT "pairwise_agreement_canonical_order" CHECK ("pairwise_agreement"."party_one_id" < "pairwise_agreement"."party_two_id")
);
--> statement-breakpoint
ALTER TABLE "pairwise_agreement" ADD CONSTRAINT "pairwise_agreement_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairwise_agreement" ADD CONSTRAINT "pairwise_agreement_party_one_in_project_fk" FOREIGN KEY ("project_id","party_one_id") REFERENCES "public"."project_party"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairwise_agreement" ADD CONSTRAINT "pairwise_agreement_party_two_in_project_fk" FOREIGN KEY ("project_id","party_two_id") REFERENCES "public"."project_party"("project_id","id") ON DELETE no action ON UPDATE no action;