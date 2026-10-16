-- S09: the live brief's phase, the on-site presence fact and current ticks.
-- Generated, then hand-ordered (as in 0005, 0009, 0011 and 0019): the phase
-- column arrives with its default, so every existing S08 brief is a draft;
-- each referenced unique exists before the foreign key that needs it. The
-- phase, live-item, presence, roster and tick guards and the grants are
-- hand-written in 0022.
ALTER TABLE "live_brief" ADD COLUMN "phase" text DEFAULT 'draft' NOT NULL;
--> statement-breakpoint
ALTER TABLE "live_brief" ADD CONSTRAINT "live_brief_phase_known" CHECK ("live_brief"."phase" in ('draft', 'live'));
--> statement-breakpoint
ALTER TABLE "brief_item" ADD CONSTRAINT "brief_item_id_project_unique" UNIQUE("id","project_id");
--> statement-breakpoint
CREATE TABLE "brief_party_presence" (
	"brief_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"on_site" boolean NOT NULL,
	CONSTRAINT "brief_party_presence_pk" PRIMARY KEY("brief_id","party_id")
);
--> statement-breakpoint
ALTER TABLE "brief_party_presence" ADD CONSTRAINT "brief_party_presence_in_brief_fk" FOREIGN KEY ("brief_id","project_id") REFERENCES "public"."live_brief"("id","project_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "brief_party_presence" ADD CONSTRAINT "brief_party_presence_party_in_project_fk" FOREIGN KEY ("project_id","party_id") REFERENCES "public"."project_party"("project_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "brief_tick" (
	"brief_item_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	CONSTRAINT "brief_tick_pk" PRIMARY KEY("brief_item_id","party_id")
);
--> statement-breakpoint
ALTER TABLE "brief_tick" ADD CONSTRAINT "brief_tick_item_fk" FOREIGN KEY ("brief_item_id","project_id") REFERENCES "public"."brief_item"("id","project_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "brief_tick" ADD CONSTRAINT "brief_tick_party_in_project_fk" FOREIGN KEY ("project_id","party_id") REFERENCES "public"."project_party"("project_id","id") ON DELETE no action ON UPDATE no action;
