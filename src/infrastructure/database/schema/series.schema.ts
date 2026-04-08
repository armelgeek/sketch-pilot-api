import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { characterModels } from './character-model.schema'
import { prompts } from './prompt.schema'
import { users } from './schema'

export const series = pgTable('series', {
  id: text('id').primaryKey(), // We'll generate UUIDs in the application layer
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  characterModelId: text('character_model_id').references(() => characterModels.id, { onDelete: 'set null' }),
  secondaryCharacterIds: jsonb('secondary_character_ids').$type<string[]>().default([]),
  promptId: text('prompt_id').references(() => prompts.id, { onDelete: 'set null' }),
  fullStory: text('full_story'),
  totalEpisodes: integer('total_episodes').default(10),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})
