ALTER TABLE "users" RENAME COLUMN "has_used_trial" TO "has_trial_used";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "stripe_price_id" TO "plan_id";--> statement-breakpoint
ALTER TABLE "subscription_history" ADD COLUMN "adjustment_type" text;--> statement-breakpoint
ALTER TABLE "subscription_history" ADD COLUMN "stripe_invoice_url" text;--> statement-breakpoint
ALTER TABLE "subscription_history" ADD COLUMN "interval" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trial_canceled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "trial_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "is_enabled" boolean DEFAULT true NOT NULL,
  "duration_in_days" integer DEFAULT 7 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Insert default trial configuration
INSERT INTO "trial_config" (id, is_enabled, duration_in_days, created_at, updated_at)
VALUES (gen_random_uuid(), true, 14, NOW(), NOW());