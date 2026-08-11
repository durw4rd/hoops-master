CREATE TABLE "settlement_pairings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settlement_id" uuid NOT NULL,
	"debtor_user_id" uuid NOT NULL,
	"creditor_user_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"paid_at" timestamp with time zone,
	"marked_paid_by" uuid,
	"debtor_payment_id" uuid,
	"creditor_payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid
);
--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "event_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "settlement_pairings" ADD CONSTRAINT "settlement_pairings_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_pairings" ADD CONSTRAINT "settlement_pairings_debtor_user_id_users_id_fk" FOREIGN KEY ("debtor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_pairings" ADD CONSTRAINT "settlement_pairings_creditor_user_id_users_id_fk" FOREIGN KEY ("creditor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_pairings" ADD CONSTRAINT "settlement_pairings_marked_paid_by_users_id_fk" FOREIGN KEY ("marked_paid_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_pairings" ADD CONSTRAINT "settlement_pairings_debtor_payment_id_payments_id_fk" FOREIGN KEY ("debtor_payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_pairings" ADD CONSTRAINT "settlement_pairings_creditor_payment_id_payments_id_fk" FOREIGN KEY ("creditor_payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_settlement_pairings_settlement" ON "settlement_pairings" USING btree ("settlement_id");--> statement-breakpoint
CREATE INDEX "idx_settlement_pairings_debtor" ON "settlement_pairings" USING btree ("debtor_user_id");--> statement-breakpoint
CREATE INDEX "idx_settlement_pairings_creditor" ON "settlement_pairings" USING btree ("creditor_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settlements_group_open_unique" ON "settlements" USING btree ("group_id") WHERE "settlements"."status" = 'open';--> statement-breakpoint
CREATE INDEX "idx_settlements_group" ON "settlements" USING btree ("group_id","created_at");