ALTER TABLE "agreement_term" ADD CONSTRAINT "agreement_term_pairwise_agreement_id_id_unique" UNIQUE("pairwise_agreement_id","id");--> statement-breakpoint
ALTER TABLE "universal_term" ADD CONSTRAINT "universal_term_project_id_id_unique" UNIQUE("project_id","id");--> statement-breakpoint
CREATE TABLE "agreement_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pairwise_agreement_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"term_count" integer NOT NULL,
	"presented_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agreement_version_pairwise_agreement_id_sequence_unique" UNIQUE("pairwise_agreement_id","sequence"),
	CONSTRAINT "agreement_version_pairwise_agreement_id_id_unique" UNIQUE("pairwise_agreement_id","id"),
	CONSTRAINT "agreement_version_sequence_positive" CHECK ("agreement_version"."sequence" >= 1),
	CONSTRAINT "agreement_version_term_count_positive" CHECK ("agreement_version"."term_count" >= 1)
);
--> statement-breakpoint
CREATE TABLE "agreement_version_term" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pairwise_agreement_id" uuid NOT NULL,
	"agreement_version_id" uuid NOT NULL,
	"agreement_term_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"content" text NOT NULL,
	CONSTRAINT "agreement_version_term_version_position_unique" UNIQUE("agreement_version_id","position"),
	CONSTRAINT "agreement_version_term_version_source_unique" UNIQUE("agreement_version_id","agreement_term_id"),
	CONSTRAINT "agreement_version_term_position_positive" CHECK ("agreement_version_term"."position" >= 1)
);
--> statement-breakpoint
CREATE TABLE "universal_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"term_count" integer NOT NULL,
	"presented_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "universal_version_project_id_sequence_unique" UNIQUE("project_id","sequence"),
	CONSTRAINT "universal_version_project_id_id_unique" UNIQUE("project_id","id"),
	CONSTRAINT "universal_version_sequence_positive" CHECK ("universal_version"."sequence" >= 1),
	CONSTRAINT "universal_version_term_count_positive" CHECK ("universal_version"."term_count" >= 1)
);
--> statement-breakpoint
CREATE TABLE "universal_version_term" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"universal_version_id" uuid NOT NULL,
	"universal_term_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"content" text NOT NULL,
	CONSTRAINT "universal_version_term_version_position_unique" UNIQUE("universal_version_id","position"),
	CONSTRAINT "universal_version_term_version_source_unique" UNIQUE("universal_version_id","universal_term_id"),
	CONSTRAINT "universal_version_term_position_positive" CHECK ("universal_version_term"."position" >= 1)
);
--> statement-breakpoint
ALTER TABLE "agreement_version" ADD CONSTRAINT "agreement_version_pairwise_agreement_id_pairwise_agreement_id_fk" FOREIGN KEY ("pairwise_agreement_id") REFERENCES "public"."pairwise_agreement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_version_term" ADD CONSTRAINT "agreement_version_term_version_in_agreement_fk" FOREIGN KEY ("pairwise_agreement_id","agreement_version_id") REFERENCES "public"."agreement_version"("pairwise_agreement_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_version_term" ADD CONSTRAINT "agreement_version_term_source_in_agreement_fk" FOREIGN KEY ("pairwise_agreement_id","agreement_term_id") REFERENCES "public"."agreement_term"("pairwise_agreement_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universal_version" ADD CONSTRAINT "universal_version_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universal_version_term" ADD CONSTRAINT "universal_version_term_version_in_project_fk" FOREIGN KEY ("project_id","universal_version_id") REFERENCES "public"."universal_version"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universal_version_term" ADD CONSTRAINT "universal_version_term_source_in_project_fk" FOREIGN KEY ("project_id","universal_term_id") REFERENCES "public"."universal_term"("project_id","id") ON DELETE no action ON UPDATE no action;