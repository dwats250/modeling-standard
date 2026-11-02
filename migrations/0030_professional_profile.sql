CREATE TABLE "comp_card_draft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"slot_hero" text NOT NULL,
	"slot_full_body" text NOT NULL,
	"slot_profile_view" text NOT NULL,
	"slot_lifestyle" text NOT NULL,
	"slot_beauty" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comp_card_draft_one_per_profile" UNIQUE("profile_id"),
	CONSTRAINT "comp_card_draft_tagline_length" CHECK (char_length("comp_card_draft"."tagline") <= 80),
	CONSTRAINT "comp_card_draft_slot_key_shape" CHECK ("comp_card_draft"."slot_hero" ~ '^[a-z0-9-]{1,40}$' and "comp_card_draft"."slot_full_body" ~ '^[a-z0-9-]{1,40}$' and "comp_card_draft"."slot_profile_view" ~ '^[a-z0-9-]{1,40}$' and "comp_card_draft"."slot_lifestyle" ~ '^[a-z0-9-]{1,40}$' and "comp_card_draft"."slot_beauty" ~ '^[a-z0-9-]{1,40}$'),
	CONSTRAINT "comp_card_draft_slots_distinct" CHECK ("comp_card_draft"."slot_hero" <> "comp_card_draft"."slot_full_body" and "comp_card_draft"."slot_hero" <> "comp_card_draft"."slot_profile_view" and "comp_card_draft"."slot_hero" <> "comp_card_draft"."slot_lifestyle" and "comp_card_draft"."slot_hero" <> "comp_card_draft"."slot_beauty" and "comp_card_draft"."slot_full_body" <> "comp_card_draft"."slot_profile_view" and "comp_card_draft"."slot_full_body" <> "comp_card_draft"."slot_lifestyle" and "comp_card_draft"."slot_full_body" <> "comp_card_draft"."slot_beauty" and "comp_card_draft"."slot_profile_view" <> "comp_card_draft"."slot_lifestyle" and "comp_card_draft"."slot_profile_view" <> "comp_card_draft"."slot_beauty" and "comp_card_draft"."slot_lifestyle" <> "comp_card_draft"."slot_beauty")
);
--> statement-breakpoint
CREATE TABLE "professional_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"profession" text DEFAULT '' NOT NULL,
	"biography" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "professional_profile_one_per_account" UNIQUE("account_id"),
	CONSTRAINT "professional_profile_display_name_length" CHECK (char_length("professional_profile"."display_name") between 1 and 80 and "professional_profile"."display_name" ~ '[^[:space:]]'),
	CONSTRAINT "professional_profile_profession_length" CHECK (char_length("professional_profile"."profession") <= 60),
	CONSTRAINT "professional_profile_biography_length" CHECK (char_length("professional_profile"."biography") <= 600)
);
--> statement-breakpoint
ALTER TABLE "comp_card_draft" ADD CONSTRAINT "comp_card_draft_profile_id_professional_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."professional_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_profile" ADD CONSTRAINT "professional_profile_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;