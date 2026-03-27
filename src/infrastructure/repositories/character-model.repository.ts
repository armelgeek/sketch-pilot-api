import { eq } from 'drizzle-orm'
import { db } from '../database/db'
import { characterModels, type CharacterModel, type NewCharacterModel } from '../database/schema/character-model.schema'

export class CharacterModelRepository {
  async findAllByUserId(userId: string): Promise<CharacterModel[]> {
    return await db.select().from(characterModels).where(eq(characterModels.userId, userId))
  }

  async findById(id: string): Promise<CharacterModel | undefined> {
    const results = await db.select().from(characterModels).where(eq(characterModels.id, id)).limit(1)
    return results[0]
  }

  async create(data: NewCharacterModel): Promise<CharacterModel> {
    const [inserted] = await db.insert(characterModels).values(data).returning()
    return inserted
  }

  async update(id: string, data: Partial<CharacterModel>): Promise<CharacterModel> {
    const [updated] = await db
      .update(characterModels)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(characterModels.id, id))
      .returning()
    return updated
  }

  async delete(id: string): Promise<void> {
    await db.delete(characterModels).where(eq(characterModels.id, id))
  }
}
