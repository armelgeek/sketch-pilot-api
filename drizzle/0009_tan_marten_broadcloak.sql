ALTER TABLE "children" ALTER COLUMN "lastname" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;