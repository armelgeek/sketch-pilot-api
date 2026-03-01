import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const trialConfig = pgTable('trial_config', {
  id: text('id').primaryKey(),
  isEnabled: boolean('is_enabled').notNull().default(true),
  durationInDays: integer('duration_in_days').notNull().default(14),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})
