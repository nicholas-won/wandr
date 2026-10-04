CREATE TYPE "public"."expense_category" AS ENUM('lodging', 'food_drink', 'transport', 'activities', 'shopping', 'other');--> statement-breakpoint
CREATE TYPE "public"."extraction_state" AS ENUM('processing', 'resolved', 'needs_review', 'not_a_place', 'failed');--> statement-breakpoint
CREATE TYPE "public"."idea_category" AS ENUM('city', 'stay', 'transit', 'food', 'drink', 'nightlife', 'activity', 'sight', 'shopping', 'other');--> statement-breakpoint
CREATE TYPE "public"."idea_status" AS ENUM('idea', 'shortlisted', 'planned', 'done', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'organizer', 'member');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('invited', 'pending', 'active', 'not_attending', 'removed');--> statement-breakpoint
CREATE TYPE "public"."poll_kind" AS ENUM('ideas', 'custom');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('tiktok', 'instagram', 'youtube', 'google_maps', 'url', 'screenshot', 'text', 'sms');--> statement-breakpoint
CREATE TYPE "public"."split_method" AS ENUM('even', 'itemized', 'just_me');--> statement-breakpoint
CREATE TYPE "public"."stage_kind" AS ENUM('where', 'when', 'stay', 'getting_around', 'do');--> statement-breakpoint
CREATE TYPE "public"."stage_status" AS ENUM('collecting', 'voting', 'set', 'not_needed');--> statement-breakpoint
CREATE TYPE "public"."trip_size" AS ENUM('solo', 'duo', 'group');--> statement-breakpoint
CREATE TYPE "public"."vote_value" AS ENUM('must', 'down', 'pass');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid,
	"actor_member_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_answers" (
	"member_id" uuid PRIMARY KEY NOT NULL,
	"trip_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"min_minor" bigint NOT NULL,
	"max_minor" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"idea_id" uuid,
	"expense_id" uuid,
	"parent_id" uuid,
	"member_id" uuid NOT NULL,
	"body" text NOT NULL,
	"hidden_from" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid,
	"member_id" uuid,
	"name" text NOT NULL,
	"props" jsonb,
	"trip_size" "trip_size",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"delta_minor" bigint NOT NULL,
	"reason" text NOT NULL,
	"created_by_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_item_claims" (
	"item_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "expense_item_claims_item_id_member_id_pk" PRIMARY KEY("item_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "expense_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" uuid NOT NULL,
	"label" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"absorbed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_shares" (
	"expense_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"share_minor" bigint NOT NULL,
	CONSTRAINT "expense_shares_expense_id_member_id_pk" PRIMARY KEY("expense_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"stop_id" uuid,
	"idea_id" uuid,
	"merchant" text NOT NULL,
	"spent_on" date,
	"currency" text NOT NULL,
	"total_minor" bigint NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"tip_minor" bigint DEFAULT 0 NOT NULL,
	"category" "expense_category" DEFAULT 'other' NOT NULL,
	"split_method" "split_method" DEFAULT 'even' NOT NULL,
	"paid_by_member_id" uuid NOT NULL,
	"uploaded_by_member_id" uuid NOT NULL,
	"receipt_path" text,
	"refund_of_expense_id" uuid,
	"locked_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"hidden_from" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction_cache" (
	"normalized_url" text PRIMARY KEY NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idea_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idea_id" uuid NOT NULL,
	"kind" "source_kind" NOT NULL,
	"url" text,
	"normalized_url" text,
	"caption" text,
	"thumbnail_url" text,
	"creator_handle" text,
	"storage_path" text,
	"shared_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"stop_id" uuid,
	"stage" "stage_kind" DEFAULT 'do' NOT NULL,
	"status" "idea_status" DEFAULT 'idea' NOT NULL,
	"extraction" "extraction_state" DEFAULT 'processing' NOT NULL,
	"title" text NOT NULL,
	"category" "idea_category" DEFAULT 'other' NOT NULL,
	"summary" text,
	"place_id" text,
	"place_cache" jsonb,
	"place_cached_at" timestamp with time zone,
	"lat" double precision,
	"lng" double precision,
	"city_hint" text,
	"price_level" smallint,
	"confidence" double precision,
	"permanently_closed" boolean DEFAULT false NOT NULL,
	"candidates" jsonb,
	"created_by_member_id" uuid,
	"hidden_from" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_contacts" (
	"member_id" uuid PRIMARY KEY NOT NULL,
	"phone" text,
	"email" text
);
--> statement-breakpoint
CREATE TABLE "member_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"bound_device_hash" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"user_id" uuid,
	"display_name" text NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"status" "member_status" DEFAULT 'invited' NOT NULL,
	"is_guest_of_honor" boolean DEFAULT false NOT NULL,
	"managed_by_member_id" uuid,
	"joined_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"notices_seen" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"destination" text NOT NULL,
	"ip" text,
	"trip_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid,
	"member_id" uuid,
	"channel" text NOT NULL,
	"kind" text NOT NULL,
	"to_address" text NOT NULL,
	"body" text NOT NULL,
	"time_sensitive" boolean DEFAULT false NOT NULL,
	"provider_id" text,
	"cost_micros" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"from_member_id" uuid NOT NULL,
	"to_member_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"recorded_by_member_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"stop_id" uuid NOT NULL,
	"idea_id" uuid,
	"day_index" integer NOT NULL,
	"start_minute" integer,
	"duration_minutes" integer DEFAULT 90 NOT NULL,
	"travel_mode" text,
	"travel_minutes" integer,
	"locked" boolean DEFAULT false NOT NULL,
	"attendee_member_ids" uuid[],
	"reason" text,
	"hidden_from" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"idea_id" uuid,
	"label" text NOT NULL,
	"image_url" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_votes" (
	"poll_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"cast_in_size" "trip_size" NOT NULL,
	"change_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "poll_votes_poll_id_member_id_pk" PRIMARY KEY("poll_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "polls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"stop_id" uuid,
	"stage" "stage_kind",
	"kind" "poll_kind" NOT NULL,
	"question" text NOT NULL,
	"closes_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"winning_option_id" uuid,
	"created_by_member_id" uuid,
	"shared_at" timestamp with time zone,
	"hidden_from" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_open_questions" (
	"phone" text PRIMARY KEY NOT NULL,
	"member_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_undo" (
	"phone" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stop_attendance" (
	"stop_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"attending" boolean DEFAULT true NOT NULL,
	CONSTRAINT "stop_attendance_stop_id_member_id_pk" PRIMARY KEY("stop_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"start_date" date,
	"end_date" date,
	"nights" smallint,
	"timezone" text,
	"lat" double precision,
	"lng" double precision,
	"lodging_idea_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_stages" (
	"trip_id" uuid NOT NULL,
	"stage" "stage_kind" NOT NULL,
	"status" "stage_status" DEFAULT 'collecting' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_stages_trip_id_stage_pk" PRIMARY KEY("trip_id","stage")
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"outsider_name" text,
	"cover_image_url" text,
	"created_by" uuid,
	"group_link_hash" text,
	"invite_list_only" boolean DEFAULT false NOT NULL,
	"budget_check_in" boolean DEFAULT false NOT NULL,
	"bach_mode" boolean DEFAULT false NOT NULL,
	"pace" text DEFAULT 'balanced' NOT NULL,
	"size" "trip_size" DEFAULT 'solo' NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text,
	"email" text,
	"display_name" text NOT NULL,
	"sms_opted_out" boolean DEFAULT false NOT NULL,
	"last_sign_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"idea_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"value" "vote_value" NOT NULL,
	"cast_in_size" "trip_size" NOT NULL,
	"open_to" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"change_count" integer DEFAULT 0 NOT NULL,
	"not_my_pick" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "votes_idea_id_member_id_pk" PRIMARY KEY("idea_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_answers" ADD CONSTRAINT "budget_answers_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_answers" ADD CONSTRAINT "budget_answers_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_adjustments" ADD CONSTRAINT "expense_adjustments_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_adjustments" ADD CONSTRAINT "expense_adjustments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_adjustments" ADD CONSTRAINT "expense_adjustments_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_adjustments" ADD CONSTRAINT "expense_adjustments_created_by_member_id_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_item_claims" ADD CONSTRAINT "expense_item_claims_item_id_expense_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."expense_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_item_claims" ADD CONSTRAINT "expense_item_claims_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_by_member_id_members_id_fk" FOREIGN KEY ("paid_by_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_uploaded_by_member_id_members_id_fk" FOREIGN KEY ("uploaded_by_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_sources" ADD CONSTRAINT "idea_sources_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_sources" ADD CONSTRAINT "idea_sources_shared_by_member_id_members_id_fk" FOREIGN KEY ("shared_by_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_created_by_member_id_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_contacts" ADD CONSTRAINT "member_contacts_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_links" ADD CONSTRAINT "member_links_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_from_member_id_members_id_fk" FOREIGN KEY ("from_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_to_member_id_members_id_fk" FOREIGN KEY ("to_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_member_id_members_id_fk" FOREIGN KEY ("recorded_by_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_option_id_poll_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."poll_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_created_by_member_id_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_open_questions" ADD CONSTRAINT "sms_open_questions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_attendance" ADD CONSTRAINT "stop_attendance_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_attendance" ADD CONSTRAINT "stop_attendance_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stops" ADD CONSTRAINT "stops_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stages" ADD CONSTRAINT "trip_stages_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_trip_idx" ON "audit_log" USING btree ("trip_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_idea_idx" ON "comments" USING btree ("idea_id");--> statement-breakpoint
CREATE INDEX "events_name_idx" ON "events" USING btree ("name","created_at");--> statement-breakpoint
CREATE INDEX "expenses_trip_idx" ON "expenses" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "idea_sources_idea_idx" ON "idea_sources" USING btree ("idea_id");--> statement-breakpoint
CREATE INDEX "ideas_trip_idx" ON "ideas" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "ideas_stop_idx" ON "ideas" USING btree ("stop_id");--> statement-breakpoint
CREATE INDEX "ideas_place_idx" ON "ideas" USING btree ("trip_id","place_id");--> statement-breakpoint
CREATE INDEX "member_links_member_idx" ON "member_links" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "members_trip_idx" ON "members" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "members_user_idx" ON "members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "members_trip_user_uq" ON "members" USING btree ("trip_id","user_id");--> statement-breakpoint
CREATE INDEX "otp_dest_idx" ON "otp_requests" USING btree ("destination","created_at");--> statement-breakpoint
CREATE INDEX "otp_ip_idx" ON "otp_requests" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "outbound_member_idx" ON "outbound_messages" USING btree ("to_address","created_at");--> statement-breakpoint
CREATE INDEX "payments_trip_idx" ON "payments" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "plan_items_stop_idx" ON "plan_items" USING btree ("stop_id");--> statement-breakpoint
CREATE INDEX "stops_trip_idx" ON "stops" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "votes_trip_idx" ON "votes" USING btree ("trip_id");