CREATE TABLE "trial_config" (
	"id" text PRIMARY KEY NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"duration_in_days" integer DEFAULT 14 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_trial_reminder_date" timestamp;