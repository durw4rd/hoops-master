CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"email_type" text NOT NULL,
	"spot_kind" text DEFAULT 'primary' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "spot_transactions" DROP CONSTRAINT "spot_transactions_attendee_id_event_attendees_id_fk";
--> statement-breakpoint
ALTER TABLE "event_attendees" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "event_attendees" ALTER COLUMN "original_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_game_reminders" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_bench_promotions" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_email_outbox_unsent" ON "email_outbox" USING btree ("created_at") WHERE "email_outbox"."sent_at" IS NULL;--> statement-breakpoint
ALTER TABLE "spot_transactions" ADD CONSTRAINT "spot_transactions_attendee_id_event_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."event_attendees"("id") ON DELETE set null ON UPDATE no action;