-- S11: the final contract tables and the terminal 'final' phase.
-- Generated, then reviewed (the order is drizzle-kit's: the phase check is
-- dropped before the foreign keys and re-added last, admitting 'final'). The
-- tables arrive empty and every existing brief keeps its phase. Guards, the
-- signing -> final transition and grants are hand-written in 0029.
CREATE TABLE "contract" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"brief_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	CONSTRAINT "contract_one_per_brief" UNIQUE("brief_id"),
	CONSTRAINT "contract_one_per_project" UNIQUE("project_id"),
	CONSTRAINT "contract_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "contract_fingerprint_format" CHECK ("contract"."fingerprint" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "contract_item" (
	"contract_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"layer" text NOT NULL,
	"pairwise_agreement_id" uuid,
	"subject_party_id" uuid,
	"shape" text,
	"item_key" text,
	"content" text NOT NULL,
	"value" text,
	"approver_party_ids" uuid[] NOT NULL,
	CONSTRAINT "contract_item_pk" PRIMARY KEY("contract_id","item_id"),
	CONSTRAINT "contract_item_one_per_position" UNIQUE("contract_id","position"),
	CONSTRAINT "contract_item_position_positive" CHECK ("contract_item"."position" >= 1),
	CONSTRAINT "contract_item_layer_known" CHECK ("contract_item"."layer" in ('universal', 'shared', 'money'))
);
--> statement-breakpoint
CREATE TABLE "contract_party" (
	"contract_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"on_site" boolean NOT NULL,
	CONSTRAINT "contract_party_pk" PRIMARY KEY("contract_id","party_id"),
	CONSTRAINT "contract_party_account_unique" UNIQUE("contract_id","party_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "contract_signature" (
	"contract_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"party_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" "inet",
	"user_agent" text,
	"prev_hash" text NOT NULL,
	"record_hash" text NOT NULL,
	CONSTRAINT "contract_signature_pk" PRIMARY KEY("contract_id","sequence"),
	CONSTRAINT "contract_signature_one_per_party" UNIQUE("contract_id","party_id"),
	CONSTRAINT "contract_signature_sequence_known" CHECK ("contract_signature"."sequence" in (1, 2)),
	CONSTRAINT "contract_signature_hashes_format" CHECK ("contract_signature"."fingerprint" ~ '^[0-9a-f]{64}$' AND "contract_signature"."prev_hash" ~ '^[0-9a-f]{64}$' AND "contract_signature"."record_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "contract_signature_ip_is_host" CHECK ("contract_signature"."ip" IS NULL OR masklen("contract_signature"."ip") = CASE WHEN family("contract_signature"."ip") = 4 THEN 32 ELSE 128 END),
	CONSTRAINT "contract_signature_user_agent_bounded" CHECK ("contract_signature"."user_agent" IS NULL OR char_length("contract_signature"."user_agent") BETWEEN 1 AND 512)
);
--> statement-breakpoint
ALTER TABLE "live_brief" DROP CONSTRAINT "live_brief_phase_known";--> statement-breakpoint
ALTER TABLE "contract" ADD CONSTRAINT "contract_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract" ADD CONSTRAINT "contract_brief_in_project_fk" FOREIGN KEY ("brief_id","project_id") REFERENCES "public"."live_brief"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_item" ADD CONSTRAINT "contract_item_in_contract_fk" FOREIGN KEY ("contract_id","project_id") REFERENCES "public"."contract"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_item" ADD CONSTRAINT "contract_item_pair_in_project_fk" FOREIGN KEY ("project_id","pairwise_agreement_id") REFERENCES "public"."pairwise_agreement"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_item" ADD CONSTRAINT "contract_item_subject_in_project_fk" FOREIGN KEY ("project_id","subject_party_id") REFERENCES "public"."project_party"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_party" ADD CONSTRAINT "contract_party_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_party" ADD CONSTRAINT "contract_party_in_contract_fk" FOREIGN KEY ("contract_id","project_id") REFERENCES "public"."contract"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_party" ADD CONSTRAINT "contract_party_party_in_project_fk" FOREIGN KEY ("project_id","party_id") REFERENCES "public"."project_party"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_signature" ADD CONSTRAINT "contract_signature_in_contract_fk" FOREIGN KEY ("contract_id","project_id") REFERENCES "public"."contract"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_signature" ADD CONSTRAINT "contract_signature_by_contract_party_fk" FOREIGN KEY ("contract_id","party_id","account_id") REFERENCES "public"."contract_party"("contract_id","party_id","account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_brief" ADD CONSTRAINT "live_brief_phase_known" CHECK ("live_brief"."phase" in ('draft', 'live', 'signing', 'final'));