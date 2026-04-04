-- Migration: Add character_models table
-- Allows admin to define base characters that users can select from

CREATE TABLE IF NOT EXISTS "character_models" (
  "id" varchar(255) PRIMARY KEY,
  "name" text NOT NULL,
  "description" text,
  "gender" text DEFAULT 'unknown',
  "age" text DEFAULT 'unknown',
  "voice_id" text,
  "is_standard" text DEFAULT 'false',
  "style_prefix" text,
  "artist_persona" text,
  "images" jsonb DEFAULT '[]',
  "thumbnail_url" text,
  "user_id" varchar(255) REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT NOW(),
  "updated_at" timestamp NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS "character_models_user_id_idx" ON "character_models"("user_id");
CREATE INDEX IF NOT EXISTS "character_models_is_standard_idx" ON "character_models"("is_standard");
