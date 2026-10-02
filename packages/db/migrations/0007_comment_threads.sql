ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;