import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const characterModels = pgTable('character_models', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  imageUrl: text('image_url'),
  mimeType: text('mime_type').default('image/jpeg'),
  isStandard: boolean('is_standard').default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

export type CharacterModelRow = typeof characterModels.$inferSelect
export type NewCharacterModelRow = typeof characterModels.$inferInsert
