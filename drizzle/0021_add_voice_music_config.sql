-- Migration: Add voice and music configuration tables
-- Creates dynamic voice presets and music tracks management

-- ─────────────────────────────────────────────────────────────────
-- TABLE: voice_presets
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "voice_presets" (
  "id" text PRIMARY KEY,
  "preset_id" text NOT NULL UNIQUE,
  "provider" text NOT NULL DEFAULT 'kokoro',
  "name" text NOT NULL,
  "language" text NOT NULL DEFAULT 'en-US',
  "gender" text NOT NULL DEFAULT 'female',
  "description" text,
  "preview_url" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT NOW(),
  "updated_at" timestamp NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS "voice_presets_provider_idx" ON "voice_presets"("provider");
CREATE INDEX IF NOT EXISTS "voice_presets_is_active_idx" ON "voice_presets"("is_active");
CREATE INDEX IF NOT EXISTS "voice_presets_preset_id_idx" ON "voice_presets"("preset_id");

-- ─────────────────────────────────────────────────────────────────
-- TABLE: music_tracks
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "music_tracks" (
  "id" text PRIMARY KEY,
  "track_id" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "path" text NOT NULL,
  "tags" text[] NOT NULL DEFAULT '{}',
  "preview_url" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT NOW(),
  "updated_at" timestamp NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS "music_tracks_is_active_idx" ON "music_tracks"("is_active");
CREATE INDEX IF NOT EXISTS "music_tracks_track_id_idx" ON "music_tracks"("track_id");

-- ─────────────────────────────────────────────────────────────────
-- SEED DATA: Kokoro voice presets
-- ─────────────────────────────────────────────────────────────────
INSERT INTO "voice_presets" (id, preset_id, provider, name, language, gender, description) VALUES
  ('vp_af_heart',    'af_heart',    'kokoro', 'Heart',    'en-US', 'female', 'Warm and expressive US female voice'),
  ('vp_af_bella',    'af_bella',    'kokoro', 'Bella',    'en-US', 'female', 'Clear and professional US female voice'),
  ('vp_af_nicole',   'af_nicole',   'kokoro', 'Nicole',   'en-US', 'female', 'Natural and friendly US female voice'),
  ('vp_am_adam',     'am_adam',     'kokoro', 'Adam',     'en-US', 'male',   'Deep and authoritative US male voice'),
  ('vp_am_michael',  'am_michael',  'kokoro', 'Michael',  'en-US', 'male',   'Clear and engaging US male voice'),
  ('vp_am_echo',     'am_echo',     'kokoro', 'Echo',     'en-US', 'male',   'Smooth and natural US male voice'),
  ('vp_bf_emma',     'bf_emma',     'kokoro', 'Emma',     'en-GB', 'female', 'Elegant British female voice'),
  ('vp_bf_isabella', 'bf_isabella', 'kokoro', 'Isabella', 'en-GB', 'female', 'Sophisticated British female voice'),
  ('vp_bm_george',   'bm_george',   'kokoro', 'George',   'en-GB', 'male',   'Distinguished British male voice'),
  ('vp_bm_lewis',    'bm_lewis',    'kokoro', 'Lewis',    'en-GB', 'male',   'Calm British male voice')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────
-- SEED DATA: Background music tracks
-- ─────────────────────────────────────────────────────────────────
INSERT INTO "music_tracks" (id, track_id, name, path, tags) VALUES
  ('mt_lofi_1',    'lofi-1',    'Chill Lo-Fi',       'lofi-beat.mp3',          ARRAY['chill', 'lo-fi', 'educational', 'tutorial']),
  ('mt_upbeat_1',  'upbeat-1',  'Upbeat Corporate',  'upbeat-corporate.mp3',   ARRAY['upbeat', 'business', 'motivational', 'promo']),
  ('mt_ambient_1', 'ambient-1', 'Soft Ambient',      'soft-ambient.mp3',       ARRAY['sad', 'emotional', 'story', 'quiet']),
  ('mt_fun_1',     'fun-1',     'Funky Groove',      'funky-groove.mp3',       ARRAY['fun', 'entertainment', 'kids'])
ON CONFLICT (id) DO NOTHING;
