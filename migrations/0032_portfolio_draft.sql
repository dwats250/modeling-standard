CREATE TABLE "portfolio_draft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"items" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portfolio_draft_one_per_profile" UNIQUE("profile_id"),
	CONSTRAINT "portfolio_draft_items_bounded" CHECK (cardinality("portfolio_draft"."items") = 0 or (cardinality("portfolio_draft"."items") <= 8 and array_ndims("portfolio_draft"."items") = 1 and array_lower("portfolio_draft"."items", 1) = 1))
);
--> statement-breakpoint
ALTER TABLE "portfolio_draft" ADD CONSTRAINT "portfolio_draft_profile_id_professional_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."professional_profile"("id") ON DELETE no action ON UPDATE no action;