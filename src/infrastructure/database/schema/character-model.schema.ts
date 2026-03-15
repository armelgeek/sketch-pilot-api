import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const characterModels = pgTable('character_models', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  imageUrl: text('image_url'),
  mimeType: text('mime_type').default('image/jpeg'),
  gender: text('gender').notNull().default('unknown'), // 'male', 'female', 'unknown'
  age: text('age').notNull().default('unknown'), // 'child', 'youth', 'senior', 'unknown'
  voiceId: text('voice_id'), // Associated voice preset ID
  description: text('description'), // The prompt or appearance details
  userId: text('user_id'), // Owner of the model (null for system models)
  isStandard: boolean('is_standard').default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

export type CharacterModelRow = typeof characterModels.$inferSelect
export type NewCharacterModelRow = typeof characterModels.$inferInsert
