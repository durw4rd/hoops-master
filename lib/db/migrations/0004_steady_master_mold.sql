DROP INDEX "event_attendees_event_user_unique";--> statement-breakpoint
ALTER TABLE "event_attendees" ADD COLUMN "parent_attendee_id" uuid;--> statement-breakpoint
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_parent_attendee_id_event_attendees_id_fk" FOREIGN KEY ("parent_attendee_id") REFERENCES "public"."event_attendees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_attendees_primary_spot_unique" ON "event_attendees" USING btree ("event_id","user_id") WHERE "event_attendees"."parent_attendee_id" IS NULL;