import { eq, sql } from 'drizzle-orm'
import { db } from '@/infrastructure/database/db'
import { avatars } from '@/infrastructure/database/schema'
import type { Avatar } from '@/domain/models/avatar.model'
import type { AvatarRepositoryInterface } from '@/domain/repositories/avatar.repository.interface'

export class AvatarRepository implements AvatarRepositoryInterface {
  async save(avatar: { id: string; path: string }): Promise<Avatar> {
    const [result] = await db
      .insert(avatars)
      .values({
        id: avatar.id,
        image: avatar.path
      })
      .returning()

    return {
      id: result.id,
      path: result.image,
      type: 'webp'
    }
  }

  async findById(id: string): Promise<Avatar | null> {
    const result = await db.query.avatars.findFirst({
      where: eq(avatars.id, id)
    })
    if (!result) {
      return null
    }
    return {
      id: result.id,
      path: result.image,
      type: 'webp'
    }
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(avatars).where(eq(avatars.id, id))
    return result.length > 0
  }
  async findAll(pagination: { skip: number; limit: number }): Promise<Avatar[]> {
    const results = await db.query.avatars.findMany({
      limit: pagination.limit,
      offset: pagination.skip
    })
    return results.map((result) => ({
      id: result.id,
      path: result.image,
      type: 'webp'
    }))
  }

  async count(): Promise<number> {
    const result = await db
      .select({
        count: sql`count(*)`
      })
      .from(avatars)
    return Number(result[0].count)
  }
}
