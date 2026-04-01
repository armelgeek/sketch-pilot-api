import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const voicePresets = pgTable('voice_presets', {
  id: text('id').primaryKey(),
  presetId: text('preset_id').notNull().unique(),
  provider: text('provider').notNull().default('elevenlabs'),
  name: text('name').notNull(),
  language: text('language').notNull().default('en-US'),
  gender: text('gender').notNull().default('female'),
  description: text('description'),
  previewUrl: text('preview_url'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

export const musicTracks = pgTable('music_tracks', {
  id: text('id').primaryKey(),
  trackId: text('track_id').notNull().unique(),
  name: text('name').notNull(),
  path: text('path').notNull(),
  tags: text('tags').array().notNull().default([]),
  previewUrl: text('preview_url'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})
