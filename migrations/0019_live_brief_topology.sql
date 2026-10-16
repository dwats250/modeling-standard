-- S08: retire S03–S05, one pair-scope row per pair, draft live brief.
-- Generated, then hand-ordered (as in 0005, 0009 and 0011): the duplicate-pair
-- precheck runs before the uniqueness key, the S03–S05 tables are dropped in
-- dependency order without CASCADE (so anything unexpected that depends on
-- them stops the migration), and each referenced unique exists before the
-- foreign key that needs it. Drizzle's no-op RLS statements are omitted.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.pairwise_agreement
    GROUP BY project_id, party_one_id, party_two_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate pairwise agreements exist; S08 requires one per pair per project — reset the development database'
      USING ERRCODE = 'unique_violation';
  END IF;
END
$$;
--> statement-breakpoint
DROP TABLE "universal_affirmation";
--> statement-breakpoint
DROP TABLE "agreement_affirmation";
--> statement-breakpoint
DROP TABLE "universal_version_term";
--> statement-breakpoint
DROP TABLE "agreement_version_term";
--> statement-breakpoint
DROP TABLE "universal_version";
--> statement-breakpoint
DROP TABLE "agreement_version";
--> statement-breakpoint
DROP TABLE "universal_term";
--> statement-breakpoint
DROP TABLE "agreement_term";
--> statement-breakpoint
ALTER TABLE "pairwise_agreement" DROP CONSTRAINT "pairwise_agreement_id_parties_unique";
--> statement-breakpoint
ALTER TABLE "pairwise_agreement" ADD CONSTRAINT "pairwise_agreement_one_per_pair" UNIQUE("project_id","party_one_id","party_two_id");
--> statement-breakpoint
ALTER TABLE "pairwise_agreement" ADD CONSTRAINT "pairwise_agreement_project_id_id_unique" UNIQUE("project_id","id");
--> statement-breakpoint
CREATE TABLE "live_brief" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "live_brief_one_per_project" UNIQUE("project_id"),
	CONSTRAINT "live_brief_id_project_unique" UNIQUE("id","project_id")
);
--> statement-breakpoint
CREATE TABLE "brief_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brief_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"layer" text NOT NULL,
	"pairwise_agreement_id" uuid,
	"subject_party_id" uuid,
	"shape" text,
	"item_key" text,
	"content" text,
	"value" text,
	"pending" text,
	"position" integer NOT NULL,
	CONSTRAINT "brief_item_layer_known" CHECK ("brief_item"."layer" in ('universal', 'shared', 'money')),
	CONSTRAINT "brief_item_shape_known" CHECK ("brief_item"."shape" in ('declaration', 'request', 'open_parameter')),
	CONSTRAINT "brief_item_item_key_known" CHECK ("brief_item"."item_key" in ('fee', 'no_means_no', 'coverage_level', 'physical_contact', 'stop_rule')),
	CONSTRAINT "brief_item_pending_known" CHECK ("brief_item"."pending" in ('decide_together', 'subject')),
	CONSTRAINT "brief_item_content_nonblank" CHECK ("brief_item"."content" ~ '[^[:space:]]'),
	CONSTRAINT "brief_item_value_nonblank" CHECK ("brief_item"."value" ~ '[^[:space:]]'),
	CONSTRAINT "brief_item_money_is_pair_scoped" CHECK ("brief_item"."layer" <> 'money' OR "brief_item"."pairwise_agreement_id" IS NOT NULL),
	CONSTRAINT "brief_item_money_is_fee" CHECK ("brief_item"."layer" <> 'money' OR "brief_item"."item_key" IS NOT DISTINCT FROM 'fee'),
	CONSTRAINT "brief_item_fee_is_money" CHECK ("brief_item"."item_key" IS DISTINCT FROM 'fee' OR "brief_item"."layer" = 'money'),
	CONSTRAINT "brief_item_universal_is_project_wide" CHECK ("brief_item"."layer" <> 'universal' OR "brief_item"."pairwise_agreement_id" IS NULL),
	CONSTRAINT "brief_item_no_means_no_is_universal" CHECK ("brief_item"."item_key" IS DISTINCT FROM 'no_means_no' OR "brief_item"."layer" = 'universal'),
	CONSTRAINT "brief_item_shape_iff_subject" CHECK (("brief_item"."subject_party_id" IS NULL) = ("brief_item"."shape" IS NULL)),
	CONSTRAINT "brief_item_drafter_item_has_wording" CHECK ("brief_item"."item_key" IS NOT NULL OR "brief_item"."content" IS NOT NULL),
	CONSTRAINT "brief_item_decide_together_has_no_value" CHECK ("brief_item"."pending" IS DISTINCT FROM 'decide_together' OR "brief_item"."value" IS NULL),
	CONSTRAINT "brief_item_subject_pending_is_open_parameter" CHECK ("brief_item"."pending" IS DISTINCT FROM 'subject' OR "brief_item"."shape" IS NOT DISTINCT FROM 'open_parameter'),
	CONSTRAINT "brief_item_open_parameter_state" CHECK ("brief_item"."shape" IS DISTINCT FROM 'open_parameter' OR ("brief_item"."pending" IS NOT DISTINCT FROM 'subject' AND "brief_item"."value" IS NULL) OR ("brief_item"."pending" IS NULL AND "brief_item"."value" IS NOT NULL)),
	CONSTRAINT "brief_item_position_positive" CHECK ("brief_item"."position" >= 1)
);
--> statement-breakpoint
ALTER TABLE "live_brief" ADD CONSTRAINT "live_brief_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "brief_item" ADD CONSTRAINT "brief_item_in_brief_fk" FOREIGN KEY ("brief_id","project_id") REFERENCES "public"."live_brief"("id","project_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "brief_item" ADD CONSTRAINT "brief_item_pair_in_project_fk" FOREIGN KEY ("project_id","pairwise_agreement_id") REFERENCES "public"."pairwise_agreement"("project_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "brief_item" ADD CONSTRAINT "brief_item_subject_in_project_fk" FOREIGN KEY ("project_id","subject_party_id") REFERENCES "public"."project_party"("project_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "brief_item_one_fee_per_pair" ON "brief_item" USING btree ("pairwise_agreement_id") WHERE "brief_item"."item_key" = 'fee';
