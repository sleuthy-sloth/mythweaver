CREATE TABLE "factions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "factions_name_check" CHECK (char_length("factions"."name") between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"roll_id" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_title_check" CHECK (char_length("journal_entries"."title") between 1 and 160)
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"description" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_name_check" CHECK (char_length("locations"."name") between 1 and 120),
	CONSTRAINT "locations_kind_check" CHECK ("locations"."kind" in ('settlement', 'site', 'wilds', 'other'))
);
--> statement-breakpoint
CREATE TABLE "npcs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"description" text,
	"faction_id" uuid,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "npcs_name_check" CHECK (char_length("npcs"."name") between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relationships_type_check" CHECK ("relationships"."source_type" in ('npc', 'faction', 'location', 'character')
        and "relationships"."target_type" in ('npc', 'faction', 'location', 'character'))
);
--> statement-breakpoint
ALTER TABLE "factions" ADD CONSTRAINT "factions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_roll_id_rolls_id_fk" FOREIGN KEY ("roll_id") REFERENCES "public"."rolls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npcs" ADD CONSTRAINT "npcs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npcs" ADD CONSTRAINT "npcs_faction_id_factions_id_fk" FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "factions_campaign_id_idx" ON "factions" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "journal_campaign_created_idx" ON "journal_entries" USING btree ("campaign_id","created_at");--> statement-breakpoint
CREATE INDEX "locations_campaign_id_idx" ON "locations" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "npcs_campaign_id_idx" ON "npcs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "npcs_faction_id_idx" ON "npcs" USING btree ("faction_id");--> statement-breakpoint
CREATE INDEX "relationships_campaign_id_idx" ON "relationships" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "relationships_source_idx" ON "relationships" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "relationships_target_idx" ON "relationships" USING btree ("target_type","target_id");