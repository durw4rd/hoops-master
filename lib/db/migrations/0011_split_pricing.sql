ALTER TABLE "groups" ADD COLUMN "default_pricing_mode" text DEFAULT 'per_spot' NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "default_total_cost" numeric(10, 1) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "pricing_mode" text DEFAULT 'per_spot' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "total_cost" numeric(10, 1) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "pricing_finalized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "finalized_per_share" numeric(10, 1);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "remainder_policy" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "effective_total_cost" numeric(10, 1);
