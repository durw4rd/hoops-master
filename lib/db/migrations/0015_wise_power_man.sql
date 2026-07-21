ALTER TABLE "event_attendees" ADD COLUMN "no_show_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_attendees" ADD COLUMN "no_show_by" uuid;--> statement-breakpoint
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_no_show_by_users_id_fk" FOREIGN KEY ("no_show_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;