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
  language: text('language').default('en'),
  characterModelId: text('character_model_id'),
  creditsUsed: integer('credits_used').notNull().default(1),
  // Script / scenes data
  script: jsonb('script'),
  scenes: jsonb('scenes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at')
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
