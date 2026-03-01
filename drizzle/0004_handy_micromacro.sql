ALTER TABLE "verification_codes" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "verification_codes" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "verification_codes" ALTER COLUMN "child_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp;