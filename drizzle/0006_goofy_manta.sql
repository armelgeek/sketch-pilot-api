ALTER TABLE "lessons" DROP CONSTRAINT "lessons_name_unique";--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "title" text NOT NULL;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "content" text;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "order" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN "description";