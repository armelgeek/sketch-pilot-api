import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { users } from './schema'

export const series = pgTable('series', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),

  // The 'Bible' or overarching narrative context for the entire series
  globalContext: text('global_context'),

  // Persistent registry of characters: { name: { description, modelId, etc } }
  characterRegistry: jsonb('character_registry').$type<Record<string, any>>().default({}),
  // Persistent registry of locations: { name: { description, thumbnailUrl } }
  locationRegistry: jsonb('location_registry').$type<Record<string, any>>().default({}),

  // Cumulative context of previous episodes (summaries, cliffhangers)
  previousEpisodesContext: text('previous_episodes_context').default(''),

  // Total planned episodes (optional)
  totalEpisodes: text('total_episodes'),

  // Generation Preferences
  language: text('language').default('fr'),
  aspectRatio: text('aspect_ratio').default('9:16'),
  duration: text('duration').default('60'),
  videoType: text('video_type').default('series'),
  videoGenre: text('video_genre').default('Horreur Historique'),
  promptId: text('prompt_id'),
  // Global visual style reference model for all character image generations
  visualStyleModelId: text('visual_style_model_id'),
  audioProvider: text('audio_provider'),
  kokoroVoicePreset: text('kokoro_voice_preset'),

  // Last generated episode number
  lastEpisodeNumber: text('last_episode_number').default('0'),

  // Current status of the saga
  status: text('status').default('active'),

  // Last cliffhanger and unresolved threads for continuity
  lastCliffhanger: text('last_cliffhanger'),
  unresolvedThreads: jsonb('unresolved_threads').$type<string[]>().default([]),

  // Planned episodes generated during prep phase
  plannedEpisodes: jsonb('planned_episodes').$type<{ number: number; title: string; hook: string }[]>().default([]),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})
