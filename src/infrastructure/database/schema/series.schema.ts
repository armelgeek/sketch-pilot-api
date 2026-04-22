import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { users } from './schema'

export interface NarrativeThread {
  title: string
  status: 'open' | 'partial' | 'resolved' | 'new'
  description: string
  lastUpdatedEpisode?: number
}

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
  // Persistent registry of assets (monsters, objects, etc.): { name: { description, type } }
  assetRegistry: jsonb('asset_registry').$type<Record<string, any>>().default({}),

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
  thumbnailUrl: text('thumbnail_url'),
  audioProvider: text('audio_provider'),
  kokoroVoicePreset: text('kokoro_voice_preset'),
  characterModelId: text('character_model_id'),

  // Last generated episode number
  lastEpisodeNumber: text('last_episode_number').default('0'),

  // Current status of the saga
  status: text('status').default('active'),

  // Last cliffhanger and unresolved threads for continuity
  lastCliffhanger: jsonb('last_cliffhanger').$type<any>(),
  unresolvedThreads: jsonb('unresolved_threads').$type<NarrativeThread[]>().default([]),

  // Planned episodes generated during prep phase
  plannedEpisodes: jsonb('planned_episodes').$type<{ number: number; title: string; hook: string }[]>().default([]),

  // Final bridge for next episode continuity
  lastEpisodeFinalImage: text('last_episode_final_image'),
  lastEpisodeFinalScene: jsonb('last_episode_final_scene').$type<any>(),

  // V13: Visual & Temporal Evolution
  visualEvolution: jsonb('visual_evolution').$type<Record<string, string>>().default({}),
  weatherState: text('weather_state'),
  timeOfDay: text('time_of_day'),
  relationshipMap: jsonb('relationship_map').$type<Record<string, Record<string, string>>>().default({}),
  assetEvolution: jsonb('asset_evolution').$type<Record<string, string>>().default({}),
  colorPalette: text('color_palette'),
  symbolicMotifs: jsonb('symbolic_motifs').$type<string[]>().default([]),
  cameraStyle: text('camera_style'),
  threads: jsonb('threads').$type<any[]>().default([]),
  roadmap: jsonb('roadmap').$type<any>().default({}),
  narrationLayer: jsonb('narration_layer').$type<any>(),
  referenceStyleImage: text('reference_style_image'),
  visualStyleLock: jsonb('visual_style_lock').$type<any>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

export const seriesCharacters = pgTable('series_characters', {
  id: text('id').primaryKey(), // Using UUID or similar string ID
  seriesId: text('series_id')
    .notNull()
    .references(() => series.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // normalized handle e.g. @elias
  displayName: text('display_name'), // e.g. Elias
  description: text('description'),
  motivation: text('motivation'),
  backstory: text('backstory'),
  thumbnailUrl: text('thumbnail_url'),
  isNew: text('is_new').default('true'), // boolean as text 'true'/'false' or just use jsonb for flex
  fate: text('fate').default('ALIVE'),
  abilities: jsonb('abilities').$type<string[]>().default([]),
  knownFacts: jsonb('known_facts').$type<string[]>().default([]),
  firstMentionedEpisode: integer('first_mentioned_episode'),
  metadata: jsonb('metadata').$type<Record<string, any>>().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

export const seriesLocations = pgTable('series_locations', {
  id: text('id').primaryKey(),
  seriesId: text('series_id')
    .notNull()
    .references(() => series.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // normalized handle
  displayName: text('display_name'),
  description: text('description'),
  atmosphere: text('atmosphere'),
  thumbnailUrl: text('thumbnail_url'),
  firstMentionedEpisode: integer('first_mentioned_episode'),
  metadata: jsonb('metadata').$type<Record<string, any>>().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

export const seriesAssets = pgTable('series_assets', {
  id: text('id').primaryKey(),
  seriesId: text('series_id')
    .notNull()
    .references(() => series.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // normalized handle
  displayName: text('display_name'),
  description: text('description'),
  type: text('type').default('object'), // creature | monster | artifact | object | other
  thumbnailUrl: text('thumbnail_url'),
  metadata: jsonb('metadata').$type<Record<string, any>>().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

export const seriesThreads = pgTable('series_threads', {
  id: text('id').primaryKey(),
  seriesId: text('series_id')
    .notNull()
    .references(() => series.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  status: text('status').default('open'), // open | partial | resolved | new
  description: text('description').notNull(),
  lastUpdatedEpisode: integer('last_updated_episode'),
  metadata: jsonb('metadata').$type<Record<string, any>>().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

export const seriesRelationships = pgTable('series_relationships', {
  id: text('id').primaryKey(),
  seriesId: text('series_id')
    .notNull()
    .references(() => series.id, { onDelete: 'cascade' }),
  characterA: text('character_a').notNull(),
  characterB: text('character_b').notNull(),
  relationshipType: text('relationship_type').notNull(),
  metadata: jsonb('metadata').$type<Record<string, any>>().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

export const seriesEvolutions = pgTable('series_evolutions', {
  id: text('id').primaryKey(),
  seriesId: text('series_id')
    .notNull()
    .references(() => series.id, { onDelete: 'cascade' }),
  entityType: text('entity_type').notNull(), // character | asset | location
  entityName: text('entity_name').notNull(),
  evolutionKey: text('evolution_key').notNull(),
  evolutionValue: text('evolution_value').notNull(),
  metadata: jsonb('metadata').$type<Record<string, any>>().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

export const seriesPlannedEpisodes = pgTable('series_planned_episodes', {
  id: text('id').primaryKey(),
  seriesId: text('series_id')
    .notNull()
    .references(() => series.id, { onDelete: 'cascade' }),
  episodeNumber: integer('episode_number').notNull(),
  title: text('title').notNull(),
  hook: text('hook').notNull(),
  metadata: jsonb('metadata').$type<Record<string, any>>().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})
