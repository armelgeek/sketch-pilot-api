ALTER TABLE "activity_logs" ADD COLUMN "activity_type" text;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD COLUMN "resource" text;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD COLUMN "resource_id" text;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD COLUMN "status" text DEFAULT 'success';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "subscription_interval" text;