CREATE TABLE "event_attendees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"original_user_id" uuid NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"offered_at" timestamp with time zone,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"total_spots" integer NOT NULL,
	"slot_cost" numeric(10, 2) NOT NULL,
	"location" text DEFAULT '',
	"description" text DEFAULT '',
	"event_type" text DEFAULT 'regular' NOT NULL,
	"assignment_mode" text DEFAULT 'admin_assign' NOT NULL,
	"signup_opens_at" timestamp with time zone,
	"round_robin_offset" integer,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"group_role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"invited_by" uuid,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '',
	"visibility" text DEFAULT 'private' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"invite_code" text NOT NULL,
	"timezone" text DEFAULT 'Europe/Prague' NOT NULL,
	"default_event_spots" integer DEFAULT 10 NOT NULL,
	"default_slot_cost" numeric(10, 2) DEFAULT '0' NOT NULL,
	"round_robin_slide" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"recorded_by" uuid NOT NULL,
	"description" text DEFAULT '',
	"payment_date" date DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "round_robin_rosters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sort_key" double precision NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spot_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"attendee_id" uuid,
	"group_id" uuid NOT NULL,
	"type" text NOT NULL,
	"from_user_id" uuid,
	"to_user_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"global_role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_original_user_id_users_id_fk" FOREIGN KEY ("original_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_waitlist" ADD CONSTRAINT "event_waitlist_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_waitlist" ADD CONSTRAINT "event_waitlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_robin_rosters" ADD CONSTRAINT "round_robin_rosters_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_robin_rosters" ADD CONSTRAINT "round_robin_rosters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_transactions" ADD CONSTRAINT "spot_transactions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_transactions" ADD CONSTRAINT "spot_transactions_attendee_id_event_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."event_attendees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_transactions" ADD CONSTRAINT "spot_transactions_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_transactions" ADD CONSTRAINT "spot_transactions_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_transactions" ADD CONSTRAINT "spot_transactions_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_attendees_event_user_unique" ON "event_attendees" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_attendees_event" ON "event_attendees" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_attendees_user" ON "event_attendees" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_waitlist_event_user_unique" ON "event_waitlist" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_waitlist_event_joined" ON "event_waitlist" USING btree ("event_id","joined_at");--> statement-breakpoint
CREATE INDEX "idx_events_group_start" ON "events" USING btree ("group_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "group_members_group_user_unique" ON "group_members" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_payments_group_user" ON "payments" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rr_roster_group_user_unique" ON "round_robin_rosters" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_rr_roster_group" ON "round_robin_rosters" USING btree ("group_id","sort_key");--> statement-breakpoint
CREATE INDEX "idx_transactions_group" ON "spot_transactions" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_event" ON "spot_transactions" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_user_to" ON "spot_transactions" USING btree ("to_user_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_user_from" ON "spot_transactions" USING btree ("from_user_id");--> statement-breakpoint
CREATE VIEW "public"."player_credit_balances" AS (
  SELECT
    gm.group_id,
    gm.user_id,
    u.email,
    u.display_name,
    COALESCE(p.total_paid, 0)    AS total_paid,
    COALESCE(t_spent.total_spent, 0)  AS total_spent,
    COALESCE(t_earned.total_earned, 0) AS total_earned,
    COALESCE(p.total_paid, 0)
      - COALESCE(t_spent.total_spent, 0)
      + COALESCE(t_earned.total_earned, 0) AS balance
  FROM group_members gm
  JOIN users u ON u.id = gm.user_id
  LEFT JOIN (
    SELECT group_id, user_id, SUM(amount) AS total_paid
    FROM payments GROUP BY group_id, user_id
  ) p ON p.group_id = gm.group_id AND p.user_id = gm.user_id
  LEFT JOIN (
    SELECT group_id, to_user_id AS user_id, SUM(amount) AS total_spent
    FROM spot_transactions
    GROUP BY group_id, to_user_id
  ) t_spent ON t_spent.group_id = gm.group_id AND t_spent.user_id = gm.user_id
  LEFT JOIN (
    SELECT group_id, from_user_id AS user_id, SUM(amount) AS total_earned
    FROM spot_transactions
    WHERE from_user_id IS NOT NULL
    GROUP BY group_id, from_user_id
  ) t_earned ON t_earned.group_id = gm.group_id AND t_earned.user_id = gm.user_id
  WHERE gm.status = 'active'
);