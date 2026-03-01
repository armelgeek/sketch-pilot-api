import { eq } from 'drizzle-orm'
import { db } from '@/infrastructure/database/db'
import { children } from '@/infrastructure/database/schema'
import type { Child } from '@/domain/models/child.model'
import type { ChildRepositoryInterface } from '@/domain/repositories/child.repository.interface'

export class ChildRepository implements ChildRepositoryInterface {
  async findById(id: string): Promise<Child | null> {
    const result = await db.query.children.findFirst({
      where: eq(children.id, id)
    })
    return result
      ? {
          ...result,
          lastname: result.lastname === null ? undefined : result.lastname,
          birthday: result.birthday === null ? undefined : result.birthday,
          avatarUrl: result.avatarUrl === null ? undefined : result.avatarUrl
        }
      : null
  }

  async findByParentId(parentId: string): Promise<Child[]> {
    const result = await db.query.children.findMany({
      where: eq(children.parentId, parentId)
    })
    return result.map((child) => ({
      ...child,
      lastname: child.lastname === null ? undefined : child.lastname,
      birthday: child.birthday === null ? undefined : child.birthday,
      avatarUrl: child.avatarUrl === null ? undefined : child.avatarUrl
    }))
  }

  async save(child: Child): Promise<Child> {
    const [result] = await db.insert(children).values(child).returning()
    return {
      ...result,
      lastname: result.lastname === null ? undefined : result.lastname,
      birthday: result.birthday === null ? undefined : result.birthday,
      avatarUrl: result.avatarUrl === null ? undefined : result.avatarUrl
    }
  }

  async update(id: string, childData: Partial<Child>): Promise<Child> {
    const [result] = await db
      .update(children)
      .set({ ...childData, updatedAt: new Date() })
      .where(eq(children.id, id))
      .returning()
    return {
      ...result,
      lastname: result.lastname === null ? undefined : result.lastname,
      avatarUrl: result.avatarUrl === null ? undefined : result.avatarUrl,
      birthday: result.birthday === null ? undefined : result.birthday
    }
  }

  async remove(id: string): Promise<boolean> {
    const result = await db.delete(children).where(eq(children.id, id)).returning()
    return result.length > 0
  }

  async countByParentId(parentId: string): Promise<number> {
    const result = await db.query.children.findMany({
      where: eq(children.parentId, parentId)
    })
    return result.length
  }
}
