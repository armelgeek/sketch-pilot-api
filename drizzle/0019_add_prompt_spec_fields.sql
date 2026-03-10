-- Migration: add VideoTypeSpecification fields to the prompts table
ALTER TABLE "prompts"
  ADD COLUMN IF NOT EXISTS "role"             text,
  ADD COLUMN IF NOT EXISTS "context"          text,
  ADD COLUMN IF NOT EXISTS "audience_default" text,
  ADD COLUMN IF NOT EXISTS "character"        text,
  ADD COLUMN IF NOT EXISTS "task"             text,
  ADD COLUMN IF NOT EXISTS "goals"            jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "structure"        text,
  ADD COLUMN IF NOT EXISTS "visual_style"     text,
  ADD COLUMN IF NOT EXISTS "rules"            jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "formatting"       text,
  ADD COLUMN IF NOT EXISTS "output_format"    text,
  ADD COLUMN IF NOT EXISTS "instructions"     jsonb DEFAULT '[]'::jsonb;
