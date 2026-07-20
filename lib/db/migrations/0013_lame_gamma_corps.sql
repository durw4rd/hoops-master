CREATE TABLE "bench_promotion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"attendee_id" uuid NOT NULL,
	"target_user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"transaction_type" text DEFAULT 'waitlist_promote' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "event_attendees" ADD COLUMN "guest_display_name" text;--> statement-breakpoint
ALTER TABLE "bench_promotion_requests" ADD CONSTRAINT "bench_promotion_requests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bench_promotion_requests" ADD CONSTRAINT "bench_promotion_requests_attendee_id_event_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."event_attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bench_promotion_requests" ADD CONSTRAINT "bench_promotion_requests_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bench_promotion_attendee_pending_unique" ON "bench_promotion_requests" USING btree ("attendee_id") WHERE "bench_promotion_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_bench_promotion_event" ON "bench_promotion_requests" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_bench_promotion_target" ON "bench_promotion_requests" USING btree ("target_user_id","status");