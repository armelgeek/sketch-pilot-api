-- Migration: add prompts table for dynamic prompt management
CREATE TABLE IF NOT EXISTS "prompts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"prompt_type" text NOT NULL,
	"video_type" text,
	"video_genre" text,
	"template" text NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb,
	"language" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
