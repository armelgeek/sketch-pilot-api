import { integer, jsonb, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { users } from './schema'
import { series } from './series.schema'
import { videos } from './video.schema'

export const vimaxLearningTransactions = pgTable('vimax_learning_transactions', {
  id: text('id').primaryKey(),
  seriesId: text('series_id')
    .notNull()
    .references(() => series.id, { onDelete: 'cascade' }),
  videoId: text('video_id').references(() => videos.id, { onDelete: 'set null' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Quality Scores
  narrativeScore: integer('narrative_score'),
  visualScore: integer('visual_score'),
  logicScore: integer('logic_score'),
  totalScore: integer('total_score'),

  // Learning Results
  newLessonsCount: integer('new_lessons_count').default(0),
  lessons: jsonb('lessons').$type<string[]>(), // IDs of new lessons

  // Performance & Cost
  tokenUsage: integer('token_usage'),
  estimatedCost: numeric('estimated_cost', { precision: 10, scale: 4 }), // USD

  // Metadata
  auditReport: jsonb('audit_report').$type<any>(), // Full JSON from auditors
  durationMs: integer('duration_ms'),

  createdAt: timestamp('created_at').notNull().defaultNow()
})
