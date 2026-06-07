-- Migration 0006: Collapse rider rows into a plusOne boolean attribute.
--
-- Previous model: two rows per player when they had a +1 (primary + rider row
-- linked via parent_attendee_id). New model: one row per player with
-- plus_one=true counting as 2 occupancy slots.
--
-- Steps:
--   1. Add plus_one column (default false).
--   2. Mark parent rows whose rider row exists.
--   3. Re-link rider spot_transactions to the parent attendee row.
--   4. Delete rider rows (and their now-orphaned transactions).
--   5. Drop the FK constraint and parent_attendee_id column.
--   6. Drop partial unique index, create simple unique index.

-- 1. Add plus_one column
ALTER TABLE "event_attendees" ADD COLUMN "plus_one" boolean NOT NULL DEFAULT false;--> statement-breakpoint

-- 2. Promote parent rows that have a rider row
UPDATE "event_attendees" AS parent
SET "plus_one" = true
WHERE EXISTS (
  SELECT 1 FROM "event_attendees" AS rider
  WHERE rider."parent_attendee_id" = parent."id"
);--> statement-breakpoint

-- 3. Re-link rider transactions to the parent attendee row so balance history is preserved
UPDATE "spot_transactions" AS st
SET "attendee_id" = rider."parent_attendee_id"
FROM "event_attendees" AS rider
WHERE st."attendee_id" = rider."id"
  AND rider."parent_attendee_id" IS NOT NULL;--> statement-breakpoint

-- 4. Delete rider rows (parent_attendee_id IS NOT NULL)
DELETE FROM "event_attendees" WHERE "parent_attendee_id" IS NOT NULL;--> statement-breakpoint

-- 5a. Drop FK constraint on parent_attendee_id
ALTER TABLE "event_attendees" DROP CONSTRAINT IF EXISTS "event_attendees_parent_attendee_id_event_attendees_id_fk";--> statement-breakpoint

-- 5b. Drop parent_attendee_id column
ALTER TABLE "event_attendees" DROP COLUMN IF EXISTS "parent_attendee_id";--> statement-breakpoint

-- 6a. Drop the partial unique index from migration 0004
DROP INDEX IF EXISTS "event_attendees_primary_spot_unique";--> statement-breakpoint

-- 6b. Create simple unique index (one row per user per event)
CREATE UNIQUE INDEX "event_attendees_event_user_unique" ON "event_attendees" USING btree ("event_id","user_id");
