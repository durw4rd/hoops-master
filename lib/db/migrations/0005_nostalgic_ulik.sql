DROP INDEX "event_waitlist_event_user_unique";--> statement-breakpoint
ALTER TABLE "event_waitlist" ADD COLUMN "for_rider" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "event_waitlist_event_user_type_unique" ON "event_waitlist" USING btree ("event_id","user_id","for_rider");