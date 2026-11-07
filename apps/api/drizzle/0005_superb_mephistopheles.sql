CREATE TABLE "campaign_maps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text DEFAULT 'Map' NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"attribution" text,
	"image" "bytea" NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_maps_mime_check" CHECK ("campaign_maps"."mime_type" in ('image/png', 'image/jpeg'))
);
--> statement-breakpoint
CREATE TABLE "map_markers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"map_id" uuid NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"label" text NOT NULL,
	"location_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "map_markers_range_check" CHECK ("map_markers"."x" >= 0 and "map_markers"."x" <= 1 and "map_markers"."y" >= 0 and "map_markers"."y" <= 1)
);
--> statement-breakpoint
ALTER TABLE "campaign_maps" ADD CONSTRAINT "campaign_maps_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_markers" ADD CONSTRAINT "map_markers_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_markers" ADD CONSTRAINT "map_markers_map_id_campaign_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."campaign_maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_markers" ADD CONSTRAINT "map_markers_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_maps_campaign_id_key" ON "campaign_maps" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "map_markers_map_id_idx" ON "map_markers" USING btree ("map_id");