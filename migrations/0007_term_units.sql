CREATE TABLE "agreement_term" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pairwise_agreement_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"content" text NOT NULL,
	CONSTRAINT "agreement_term_pairwise_agreement_id_position_unique" UNIQUE("pairwise_agreement_id","position"),
	CONSTRAINT "agreement_term_position_positive" CHECK ("agreement_term"."position" >= 1),
	CONSTRAINT "agreement_term_content_not_blank" CHECK ("agreement_term"."content" ~ '[^[:space:]]')
);
--> statement-breakpoint
CREATE TABLE "universal_term" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"content" text NOT NULL,
	CONSTRAINT "universal_term_project_id_position_unique" UNIQUE("project_id","position"),
	CONSTRAINT "universal_term_position_positive" CHECK ("universal_term"."position" >= 1),
	CONSTRAINT "universal_term_content_not_blank" CHECK ("universal_term"."content" ~ '[^[:space:]]')
);
--> statement-breakpoint
ALTER TABLE "agreement_term" ADD CONSTRAINT "agreement_term_pairwise_agreement_id_pairwise_agreement_id_fk" FOREIGN KEY ("pairwise_agreement_id") REFERENCES "public"."pairwise_agreement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universal_term" ADD CONSTRAINT "universal_term_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;