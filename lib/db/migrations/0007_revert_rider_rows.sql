-- Migration 0007: Revert to two-row rider model.
--
-- The plusOne attribute model (0006) couldn't support independent rider
-- lifecycle (offered/confirmed/on-bench). Restoring the separate rider row
-- approach where a rider row has parent_attendee_id pointing to the owner's
-- primary spot, enabling riders to be offered, claimed, and bench-managed
-- independently — exactly like primary spots.
--
-- Steps:
--   1. Add parent_attendee_id column + FK.
--   2. Insert rider rows for each attendee whose plus_one = true.
--   3. Drop plus_one column.
--   4. Drop simple unique index from 0006.
--   5. Create partial unique index (primary spots only).

-- 1. Add parent_attendee_id column
ALTER TABLE "event_attendees" ADD COLUMN "parent_attendee_id" uuid;--> statement-breakpoint

-- 2. Add FK constraint
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_parent_attendee_id_event_attendees_id_fk"
  FOREIGN KEY ("parent_attendee_id") REFERENCES "public"."event_attendees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- 3. Insert rider rows (one per plus_one=true attendee row)
INSERT INTO "event_attendees"
  (id, event_id, user_id, original_user_id, status, offered_at, assigned_by, assigned_at, updated_at, parent_attendee_id)
SELECT
  gen_random_uuid(),
  ea.event_id,
  ea.user_id,
  ea.user_id,
  ea.status,
  ea.offered_at,
  ea.assigned_by,
  ea.assigned_at,
  now(),
  ea.id
FROM "event_attendees" ea
WHERE ea.plus_one = true;--> statement-breakpoint

-- 4. Drop plus_one column
ALTER TABLE "event_attendees" DROP COLUMN IF EXISTS "plus_one";--> statement-breakpoint

-- 5. Drop the simple unique index created in 0006
DROP INDEX IF EXISTS "event_attendees_event_user_unique";--> statement-breakpoint

-- 6. Recreate the partial unique index (primary spots only)
CREATE UNIQUE INDEX "event_attendees_primary_spot_unique"
  ON "event_attendees" USING btree ("event_id","user_id")
  WHERE "event_attendees"."parent_attendee_id" IS NULL;
