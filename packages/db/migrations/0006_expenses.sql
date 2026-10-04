CREATE TABLE "expense_member_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"expense_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"decision" text NOT NULL,
	"replaced_member_id" uuid,
	"decided_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"uploaded_by_member_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"image_hash" text NOT NULL,
	"status" text DEFAULT 'reading' NOT NULL,
	"result" jsonb,
	"expense_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "receipt_hash" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "split_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "expense_member_decisions" ADD CONSTRAINT "expense_member_decisions_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_member_decisions" ADD CONSTRAINT "expense_member_decisions_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_member_decisions" ADD CONSTRAINT "expense_member_decisions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_member_decisions" ADD CONSTRAINT "expense_member_decisions_replaced_member_id_members_id_fk" FOREIGN KEY ("replaced_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_member_decisions" ADD CONSTRAINT "expense_member_decisions_decided_by_member_id_members_id_fk" FOREIGN KEY ("decided_by_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_uploads" ADD CONSTRAINT "receipt_uploads_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_uploads" ADD CONSTRAINT "receipt_uploads_uploaded_by_member_id_members_id_fk" FOREIGN KEY ("uploaded_by_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_uploads" ADD CONSTRAINT "receipt_uploads_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_member_decisions_trip_idx" ON "expense_member_decisions" USING btree ("trip_id","member_id");--> statement-breakpoint
CREATE INDEX "receipt_uploads_trip_idx" ON "receipt_uploads" USING btree ("trip_id");