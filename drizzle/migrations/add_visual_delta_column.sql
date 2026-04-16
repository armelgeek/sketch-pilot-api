-- Migration to add visual_delta column for AnchorEngine V2
ALTER TABLE "video_scenes" ADD COLUMN IF NOT EXISTS "visual_delta" jsonb;
