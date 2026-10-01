CREATE TYPE "public"."ai_import_kind" AS ENUM('extraction', 'cache_hit', 'failed', 'text');--> statement-breakpoint
CREATE TYPE "public"."board_member_status" AS ENUM('active', 'removed');--> statement-breakpoint
CREATE TYPE "public"."board_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."user_plan" AS ENUM('free', 'premium');--> statement-breakpoint
ALTER TYPE "public"."extraction_state" ADD VALUE 'queued' BEFORE 'processing';--> statement-breakpoint
CREATE TABLE "ai_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"trip_id" uuid,
	"idea_id" uuid,
	"saved_idea_id" uuid,
	"kind" "ai_import_kind" NOT NULL,
	"counted" boolean DEFAULT false NOT NULL,
	"normalized_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_items" (
	"board_id" uuid NOT NULL,
	"saved_idea_id" uuid NOT NULL,
	"added_by_board_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_items_board_id_saved_idea_id_pk" PRIMARY KEY("board_id","saved_idea_id")
);
--> statement-breakpoint
CREATE TABLE "board_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_member_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"bound_device_hash" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "board_member_contacts" (
	"board_member_id" uuid PRIMARY KEY NOT NULL,
	"phone" text,
	"email" text
);
--> statement-breakpoint
CREATE TABLE "board_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"user_id" uuid,
	"display_name" text NOT NULL,
	"role" "board_role" DEFAULT 'member' NOT NULL,
	"status" "board_member_status" DEFAULT 'active' NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_idea_notes" (
	"saved_idea_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"note" text,
	"someday_priority" "vote_value",
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_idea_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"saved_idea_id" uuid NOT NULL,
	"kind" "source_kind" NOT NULL,
	"url" text,
	"normalized_url" text,
	"caption" text,
	"thumbnail_url" text,
	"creator_handle" text,
	"storage_path" text,
	"added_by_user_id" uuid,
	"added_by_board_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_idea_trip_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"saved_idea_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"idea_id" uuid NOT NULL,
	"sent_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"created_by_board_member_id" uuid,
	"extraction" "extraction_state" DEFAULT 'processing' NOT NULL,
	"title" text NOT NULL,
	"category" "idea_category" DEFAULT 'other' NOT NULL,
	"summary" text,
	"place_id" text,
	"place_cache" jsonb,
	"place_cached_at" timestamp with time zone,
	"lat" double precision,
	"lng" double precision,
	"price_level" smallint,
	"confidence" double precision,
	"permanently_closed" boolean DEFAULT false NOT NULL,
	"candidates" jsonb,
	"country" text,
	"region_or_city" text,
	"country_override" text,
	"region_or_city_override" text,
	"category_override" "idea_category",
	"queued_for_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "source_saved_idea_id" uuid;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "queued_for_member_id" uuid;--> statement-breakpoint
ALTER TABLE "plan_items" ADD COLUMN "track" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan" "user_plan" DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_imports" ADD CONSTRAINT "ai_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_imports" ADD CONSTRAINT "ai_imports_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_imports" ADD CONSTRAINT "ai_imports_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_imports" ADD CONSTRAINT "ai_imports_saved_idea_id_saved_ideas_id_fk" FOREIGN KEY ("saved_idea_id") REFERENCES "public"."saved_ideas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_items" ADD CONSTRAINT "board_items_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_items" ADD CONSTRAINT "board_items_saved_idea_id_saved_ideas_id_fk" FOREIGN KEY ("saved_idea_id") REFERENCES "public"."saved_ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_items" ADD CONSTRAINT "board_items_added_by_board_member_id_board_members_id_fk" FOREIGN KEY ("added_by_board_member_id") REFERENCES "public"."board_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_links" ADD CONSTRAINT "board_links_board_member_id_board_members_id_fk" FOREIGN KEY ("board_member_id") REFERENCES "public"."board_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_member_contacts" ADD CONSTRAINT "board_member_contacts_board_member_id_board_members_id_fk" FOREIGN KEY ("board_member_id") REFERENCES "public"."board_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_members" ADD CONSTRAINT "board_members_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_members" ADD CONSTRAINT "board_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_idea_notes" ADD CONSTRAINT "saved_idea_notes_saved_idea_id_saved_ideas_id_fk" FOREIGN KEY ("saved_idea_id") REFERENCES "public"."saved_ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_idea_notes" ADD CONSTRAINT "saved_idea_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_idea_sources" ADD CONSTRAINT "saved_idea_sources_saved_idea_id_saved_ideas_id_fk" FOREIGN KEY ("saved_idea_id") REFERENCES "public"."saved_ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_idea_sources" ADD CONSTRAINT "saved_idea_sources_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_idea_sources" ADD CONSTRAINT "saved_idea_sources_added_by_board_member_id_board_members_id_fk" FOREIGN KEY ("added_by_board_member_id") REFERENCES "public"."board_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_idea_trip_sends" ADD CONSTRAINT "saved_idea_trip_sends_saved_idea_id_saved_ideas_id_fk" FOREIGN KEY ("saved_idea_id") REFERENCES "public"."saved_ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_idea_trip_sends" ADD CONSTRAINT "saved_idea_trip_sends_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_idea_trip_sends" ADD CONSTRAINT "saved_idea_trip_sends_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_idea_trip_sends" ADD CONSTRAINT "saved_idea_trip_sends_sent_by_user_id_users_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_ideas" ADD CONSTRAINT "saved_ideas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_ideas" ADD CONSTRAINT "saved_ideas_created_by_board_member_id_board_members_id_fk" FOREIGN KEY ("created_by_board_member_id") REFERENCES "public"."board_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_ideas" ADD CONSTRAINT "saved_ideas_queued_for_user_id_users_id_fk" FOREIGN KEY ("queued_for_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_imports_user_idx" ON "ai_imports" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "board_items_idea_idx" ON "board_items" USING btree ("saved_idea_id");--> statement-breakpoint
CREATE INDEX "board_links_member_idx" ON "board_links" USING btree ("board_member_id");--> statement-breakpoint
CREATE INDEX "board_members_board_idx" ON "board_members" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "board_members_user_idx" ON "board_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "board_members_board_user_uq" ON "board_members" USING btree ("board_id","user_id");--> statement-breakpoint
CREATE INDEX "boards_owner_idx" ON "boards" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "saved_idea_sources_idea_idx" ON "saved_idea_sources" USING btree ("saved_idea_id");--> statement-breakpoint
CREATE INDEX "saved_idea_sends_idea_idx" ON "saved_idea_trip_sends" USING btree ("saved_idea_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_idea_sends_uq" ON "saved_idea_trip_sends" USING btree ("saved_idea_id","idea_id");--> statement-breakpoint
CREATE INDEX "saved_ideas_user_idx" ON "saved_ideas" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_ideas_user_place_uq" ON "saved_ideas" USING btree ("user_id","place_id") WHERE "saved_ideas"."place_id" is not null;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_source_saved_idea_id_saved_ideas_id_fk" FOREIGN KEY ("source_saved_idea_id") REFERENCES "public"."saved_ideas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_queued_for_member_id_members_id_fk" FOREIGN KEY ("queued_for_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;