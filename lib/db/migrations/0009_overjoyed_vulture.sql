ALTER TABLE "events" ADD COLUMN "banner_url" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "banner_orientation" text DEFAULT 'landscape';--> statement-breakpoint
UPDATE "events" SET "event_type" = 'special' WHERE "event_type" = 'tournament';