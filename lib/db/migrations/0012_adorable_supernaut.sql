ALTER TABLE "users" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "removed_by" uuid;
