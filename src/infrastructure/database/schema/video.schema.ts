import { integer, jsonb, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { users } from './schema'

export const videos = pgTable('videos', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  topic: text('topic').notNull(),
  title: text('title'),
  status: text('status').notNull().default('queued'), // draft | queued | processing | completed | failed | cancelled
  jobId: text('job_id'),
  progress: integer('progress').notNull().default(0),
  currentStep: text('current_step'),
  errorMessage: text('error_message'),
  options: jsonb('options'),
  // Generated assets
  videoUrl: text('video_url'),
  thumbnailUrl: text('thumbnail_url'),
  narrationUrl: text('narration_url'),
  captionsUrl: text('captions_url'),
  duration: integer('duration'), // in seconds
  // Metadata
  language: text('language').default('fr'),
  characterModelId: text('character_model_id'),
  seriesId: text('series_id'), // Will be linked in code, no hard FK to avoid migration circularity if needed, but referencing series.id is better
  episodeNumber: integer('episode_number'),
  creditsUsed: integer('credits_used').notNull().default(1),

  // Snapshot of context used for this generation
  previousEpisodesContext: text('previous_episodes_context'),
  globalContext: text('global_context'),
  lastCliffhanger: jsonb('last_cliffhanger').$type<any>(),
  continuityAnalysis: jsonb('continuity_analysis').$type<any>(),
  lastEpisodeFinalImage: text('last_episode_final_image'),
  lastEpisodeFinalScene: jsonb('last_episode_final_scene').$type<any>(),

  // Persistent registries for visual consistency (intra-video and regeneration)
  characterRegistry: jsonb('character_registry').$type<Record<string, any>>().default({}),
  locationRegistry: jsonb('location_registry').$type<Record<string, any>>().default({}),
  assetRegistry: jsonb('asset_registry').$type<Record<string, any>>().default({}),

  // Script / scenes data
  script: jsonb('script'),
  narrationLayer: jsonb('narration_layer').$type<any>(),
  // @deprecated Use video_scenes table instead
  scenes: jsonb('scenes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at')
})

export const videoScenes = pgTable('video_scenes', {
  id: text('id').primaryKey(),
  videoId: text('video_id')
    .notNull()
    .references(() => videos.id, { onDelete: 'cascade' }),
  sceneNumber: integer('scene_number').notNull(),

  // Timing
  startTime: numeric('start_time').default('0'),
  endTime: numeric('end_time').default('0'),
  duration: numeric('duration').default('0'),

  // Content
  summary: text('summary'),
  justification: text('justification'),
  narration: text('narration').notNull(),
  locationId: text('location_id'),

  // Visuals
  imagePrompt: text('image_prompt'),
  imageUrl: text('image_url'),
  thumbnailUrl: text('thumbnail_url'),

  // Directives
  cameraAction: jsonb('camera_action').$type<any>(),
  animationPrompt: text('animation_prompt'),
  preset: text('preset'),
  transition: text('transition'),
  continueFromPrevious: text('continue_from_previous').default('false'), // boolean as text

  // Continuity & Context
  persistentDecorTokens: jsonb('persistent_decor_tokens').$type<string[]>().default([]),
  isEstablishingShot: text('is_establishing_shot').default('false'),
  spatialAnchor: text('spatial_anchor'),
  composition: jsonb('composition').$type<any>(),
  visualEvolution: jsonb('visual_evolution').$type<any>(),
  visualDelta: jsonb('visual_delta').$type<any>(),
  visualBaseState: jsonb('visual_base_state').$type<any>(),
  visualStateLock: jsonb('visual_state_lock').$type<any>(),
  frameAnchor: jsonb('frame_anchor').$type<any>(),
  worldStateSnapshot: jsonb('world_state_snapshot').$type<any>(),
  weatherState: text('weather_state'),
  timeOfDay: text('time_of_day'),
  colorPalette: text('color_palette'),
  cameraStyle: text('camera_style'),

  // v8.0 Narrative Layer
  sceneDelta: jsonb('scene_delta').$type<any>(),
  scenePurpose: jsonb('scene_purpose').$type<any>(),
  tensionState: jsonb('tension_state').$type<any>(),

  // v17.0 Living Engine
  acting: jsonb('acting').$type<any>(),
  momentum: jsonb('momentum').$type<any>(),

  // v17.5 Sequence Engine
  sequenceId: text('sequence_id'),
  sequenceProgress: integer('sequence_progress'),

  // v18.1 Semantic Segmentation
  visualSubject: text('visual_subject'),

  metadata: jsonb('metadata').$type<Record<string, any>>().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

export const userCredits = pgTable('user_credits', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  extraCredits: integer('extra_credits').notNull().default(0),
  videosThisMonth: integer('videos_this_month').notNull().default(0),
  resetDate: timestamp('reset_date').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

export const creditTransactions = pgTable('credit_transactions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // topup | consumption
  amount: integer('amount').notNull(), // positive for topup, negative for consumption
  price: numeric('price', { precision: 10, scale: 2 }),
  currency: text('currency').default('usd'),
  stripeSessionId: text('stripe_session_id'),
  packId: text('pack_id'),
  videoId: text('video_id'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow()
})
