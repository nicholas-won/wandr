CREATE TABLE "notification_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"trip_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "share_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject_id" uuid,
	"digest_day" date,
	"snapshot" jsonb NOT NULL,
	"created_by_member_id" uuid,
	"shared_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "share_cards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_keys" ADD CONSTRAINT "notification_keys_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_cards" ADD CONSTRAINT "share_cards_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_cards" ADD CONSTRAINT "share_cards_created_by_member_id_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "share_cards_trip_idx" ON "share_cards" USING btree ("trip_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "share_cards_digest_uq" ON "share_cards" USING btree ("trip_id","digest_day") WHERE "share_cards"."kind" = 'digest';