CREATE TABLE "subscription_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"child_limit" numeric(4, 0),
	"price_monthly" numeric(10, 2) NOT NULL,
	"price_yearly" numeric(10, 2) NOT NULL,
	"displayed_yearly" numeric(10, 2) NOT NULL,
	"displayed_monthly" numeric(10, 2) NOT NULL,
	"displayed_yearly_bar" numeric(10, 2) NOT NULL,
	"currency" text NOT NULL,
	"stripe_price_id_monthly" text,
	"stripe_price_id_yearly" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN "duration" real;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "extraction_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "extraction_error" text;