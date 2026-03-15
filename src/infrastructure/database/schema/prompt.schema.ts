import { boolean, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const prompts = pgTable('prompts', {
  id: text('id').primaryKey(),
  /** Human-readable name for this prompt entry */
  name: text('name').notNull(),
  /** Optional description / notes */
  description: text('description'),
  config: jsonb('config').$type<any>(),
  /** Whether this prompt is active and should be used at runtime */
  isActive: boolean('is_active').notNull().default(true),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})
