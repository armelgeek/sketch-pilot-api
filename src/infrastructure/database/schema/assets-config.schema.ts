import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * voice_presets — Available voice presets for video narration.
 * Managed dynamically: set isActive = false to hide a voice without code changes.
 */
export const voicePresets = pgTable('voice_presets', {
  id: text('id').primaryKey(), // e.g. 'vp_af_heart'
  presetId: text('preset_id').notNull().unique(), // e.g. 'af_heart' (used in KokoroTTS)
  provider: text('provider').notNull().default('kokoro'), // 'kokoro' | 'elevenlabs' | 'google'
  name: text('name').notNull(), // Display name, e.g. 'Heart'
  language: text('language').notNull().default('en-US'), // BCP-47 code
  gender: text('gender').notNull().default('female'), // 'male' | 'female' | 'neutral'
  description: text('description'),
  previewUrl: text('preview_url'), // Optional audio preview URL
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

/**
 * music_tracks — Available background music tracks for video generation.
 * Managed dynamically: set isActive = false to hide a track without code changes.
 */
export const musicTracks = pgTable('music_tracks', {
  id: text('id').primaryKey(), // e.g. 'mt_lofi_1'
  trackId: text('track_id').notNull().unique(), // e.g. 'lofi-1' (used in VideoAssembler matching)
  name: text('name').notNull(), // Display name, e.g. 'Chill Lo-Fi'
  path: text('path').notNull(), // Filename in music assets dir, e.g. 'lofi-beat.mp3'
  tags: text('tags').array().notNull().default([]), // e.g. ['chill', 'lo-fi', 'educational']
  previewUrl: text('preview_url'), // Optional audio preview URL from MinIO/CDN
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

export type VoicePreset = typeof voicePresets.$inferSelect
export type MusicTrack = typeof musicTracks.$inferSelect
