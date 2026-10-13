ALTER TABLE "agreement_version_term" ADD CONSTRAINT "agreement_version_term_version_id_unique" UNIQUE("agreement_version_id","id");--> statement-breakpoint
ALTER TABLE "pairwise_agreement" ADD CONSTRAINT "pairwise_agreement_id_parties_unique" UNIQUE("id","party_one_id","party_two_id");--> statement-breakpoint
ALTER TABLE "universal_version_term" ADD CONSTRAINT "universal_version_term_version_id_unique" UNIQUE("universal_version_id","id");--> statement-breakpoint
CREATE TABLE "agreement_affirmation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pairwise_agreement_id" uuid NOT NULL,
	"party_one_id" uuid NOT NULL,
	"party_two_id" uuid NOT NULL,
	"agreement_version_id" uuid NOT NULL,
	"agreement_version_term_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"affirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agreement_affirmation_term_party_unique" UNIQUE("agreement_version_term_id","party_id"),
	CONSTRAINT "agreement_affirmation_party_in_pair" CHECK ("agreement_affirmation"."party_id" = "agreement_affirmation"."party_one_id" or "agreement_affirmation"."party_id" = "agreement_affirmation"."party_two_id")
);
--> statement-breakpoint
CREATE TABLE "universal_affirmation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"universal_version_id" uuid NOT NULL,
	"universal_version_term_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"affirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "universal_affirmation_term_party_unique" UNIQUE("universal_version_term_id","party_id")
);
--> statement-breakpoint
ALTER TABLE "agreement_affirmation" ADD CONSTRAINT "agreement_affirmation_pair_fk" FOREIGN KEY ("pairwise_agreement_id","party_one_id","party_two_id") REFERENCES "public"."pairwise_agreement"("id","party_one_id","party_two_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_affirmation" ADD CONSTRAINT "agreement_affirmation_version_in_agreement_fk" FOREIGN KEY ("pairwise_agreement_id","agreement_version_id") REFERENCES "public"."agreement_version"("pairwise_agreement_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_affirmation" ADD CONSTRAINT "agreement_affirmation_term_in_version_fk" FOREIGN KEY ("agreement_version_id","agreement_version_term_id") REFERENCES "public"."agreement_version_term"("agreement_version_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universal_affirmation" ADD CONSTRAINT "universal_affirmation_party_in_project_fk" FOREIGN KEY ("project_id","party_id") REFERENCES "public"."project_party"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universal_affirmation" ADD CONSTRAINT "universal_affirmation_version_in_project_fk" FOREIGN KEY ("project_id","universal_version_id") REFERENCES "public"."universal_version"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universal_affirmation" ADD CONSTRAINT "universal_affirmation_term_in_version_fk" FOREIGN KEY ("universal_version_id","universal_version_term_id") REFERENCES "public"."universal_version_term"("universal_version_id","id") ON DELETE no action ON UPDATE no action;