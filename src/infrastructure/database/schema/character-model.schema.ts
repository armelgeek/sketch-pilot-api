import { jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'
import { users } from './schema'

export const characterModels = pgTable('character_models', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  gender: text('gender').default('unknown'),
  age: text('age').default('unknown'),
  voiceId: text('voice_id'),
  isStandard: text('is_standard').default('false'),
  stylePrefix: text('style_prefix'),
  artistPersona: text('artist_persona'),
  images: jsonb('images').$type<string[]>().default([]),
  thumbnailUrl: text('thumbnail_url'),
  userId: varchar('user_id', { length: 255 }).references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
})

export type CharacterModel = typeof characterModels.$inferSelect
export type NewCharacterModel = typeof characterModels.$inferInsert
