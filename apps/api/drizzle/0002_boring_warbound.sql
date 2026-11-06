CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"edge" smallint DEFAULT 2 NOT NULL,
	"heart" smallint DEFAULT 1 NOT NULL,
	"iron" smallint DEFAULT 3 NOT NULL,
	"shadow" smallint DEFAULT 2 NOT NULL,
	"wits" smallint DEFAULT 1 NOT NULL,
	"health" smallint DEFAULT 5 NOT NULL,
	"spirit" smallint DEFAULT 5 NOT NULL,
	"supply" smallint DEFAULT 5 NOT NULL,
	"momentum" smallint DEFAULT 2 NOT NULL,
	"debilities" text[] DEFAULT '{}'::text[] NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "characters_name_check" CHECK (char_length("characters"."name") between 1 and 120),
	CONSTRAINT "characters_stats_check" CHECK ("characters"."edge" between 0 and 5 and "characters"."heart" between 0 and 5
        and "characters"."iron" between 0 and 5 and "characters"."shadow" between 0 and 5
        and "characters"."wits" between 0 and 5),
	CONSTRAINT "characters_meters_check" CHECK ("characters"."health" between 0 and 5 and "characters"."spirit" between 0 and 5
        and "characters"."supply" between 0 and 5),
	CONSTRAINT "characters_momentum_check" CHECK ("characters"."momentum" between -6 and 10)
);
--> statement-breakpoint
CREATE TABLE "rolls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"character_id" uuid,
	"move_id" text,
	"stat" text NOT NULL,
	"adds" integer DEFAULT 0 NOT NULL,
	"action_die" smallint NOT NULL,
	"challenge_1" smallint NOT NULL,
	"challenge_2" smallint NOT NULL,
	"action_score" integer NOT NULL,
	"outcome" text NOT NULL,
	"is_match" boolean DEFAULT false NOT NULL,
	"burned" boolean DEFAULT false NOT NULL,
	"momentum_before" smallint,
	"momentum_after" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rolls_outcome_check" CHECK ("rolls"."outcome" in ('strong_hit', 'weak_hit', 'miss')),
	CONSTRAINT "rolls_stat_check" CHECK ("rolls"."stat" in ('edge', 'heart', 'iron', 'shadow', 'wits'))
);
--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rolls" ADD CONSTRAINT "rolls_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rolls" ADD CONSTRAINT "rolls_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "characters_campaign_id_idx" ON "characters" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "rolls_campaign_created_idx" ON "rolls" USING btree ("campaign_id","created_at");