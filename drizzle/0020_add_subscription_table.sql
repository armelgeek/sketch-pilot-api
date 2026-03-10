-- Migration: Add Stripe subscriptions table
CREATE TABLE IF NOT EXISTS "subscriptions" (
    "id" text PRIMARY KEY,
    "plan" text NOT NULL,
    "reference_id" text NOT NULL,
    "stripe_customer_id" text,
    "stripe_subscription_id" text,
    "status" text NOT NULL,
    "period_start" timestamp,
    "period_end" timestamp,
    "cancel_at_period_end" boolean,
    "cancel_at" timestamp,
    "canceled_at" timestamp,
    "ended_at" timestamp,
    "seats" integer,
    "trial_start" timestamp,
    "trial_end" timestamp,
    "billing_interval" text,
    "stripe_schedule_id" text,
    "created_at" timestamp NOT NULL,
    "updated_at" timestamp NOT NULL
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS "subscriptions_reference_id_idx" ON "subscriptions"("reference_id");
CREATE INDEX IF NOT EXISTS "subscriptions_stripe_customer_id_idx" ON "subscriptions"("stripe_customer_id");
CREATE INDEX IF NOT EXISTS "subscriptions_stripe_subscription_id_idx" ON "subscriptions"("stripe_subscription_id");
CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "subscriptions"("status");
