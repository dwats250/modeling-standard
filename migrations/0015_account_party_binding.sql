CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"login_provider" text NOT NULL,
	"provider_subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_login_unique" UNIQUE("login_provider","provider_subject"),
	CONSTRAINT "account_login_provider_known" CHECK ("account"."login_provider" in ('google', 'apple')),
	CONSTRAINT "account_provider_subject_nonblank" CHECK ("account"."provider_subject" ~ '[^[:space:]]')
);
--> statement-breakpoint
CREATE TABLE "party_account_binding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"bound_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "party_account_binding_one_per_party" UNIQUE("party_id")
);
--> statement-breakpoint
ALTER TABLE "party_account_binding" ADD CONSTRAINT "party_account_binding_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_account_binding" ADD CONSTRAINT "party_account_binding_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_account_binding" ADD CONSTRAINT "party_account_binding_party_in_project_fk" FOREIGN KEY ("project_id","party_id") REFERENCES "public"."project_party"("project_id","id") ON DELETE no action ON UPDATE no action;