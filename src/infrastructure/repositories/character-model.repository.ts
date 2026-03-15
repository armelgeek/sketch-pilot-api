import { and, eq, or } from 'drizzle-orm'
import { db } from '../database/db'
import { characterModels } from '../database/schema'

export class CharacterModelRepository {
  async findAll() {
    return await db.select().from(characterModels).where(eq(characterModels.isStandard, true))
  }

  async findAllForUser(userId: string) {
    return await db
      .select()
      .from(characterModels)
      .where(or(eq(characterModels.isStandard, true), eq(characterModels.userId, userId)))
  }

  async findByName(name: string) {
    const [model] = await db.select().from(characterModels).where(eq(characterModels.name, name))
    return model || null
  }

  async findById(id: string) {
    const [model] = await db.select().from(characterModels).where(eq(characterModels.id, id))
    return model || null
  }

  async findByMetadata(gender?: string, age?: string) {
    if (!gender && !age) return null

    const conditions = []
    if (gender) conditions.push(eq(characterModels.gender, gender))
    if (age) conditions.push(eq(characterModels.age, age))

    const [model] = await db
      .select()
      .from(characterModels)
      .where(and(...conditions))
      .limit(1)
    return model || null
  }

  async findStandard() {
    const [model] = await db.select().from(characterModels).where(eq(characterModels.isStandard, true))
    return model || null
  }

  async create(data: typeof characterModels.$inferInsert) {
    const [model] = await db.insert(characterModels).values(data).returning()
    return model
  }

  async update(id: string, data: Partial<typeof characterModels.$inferInsert>) {
    const [model] = await db
      .update(characterModels)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(characterModels.id, id))
      .returning()
    return model
  }

  async delete(id: string) {
    const [deleted] = await db.delete(characterModels).where(eq(characterModels.id, id)).returning()
    return deleted || null
  }
}
