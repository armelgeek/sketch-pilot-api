import { eq, or } from 'drizzle-orm'
import { db } from '../database/db/index'
import { users } from '../database/schema'
export async function patchSuperAdminToAdmin(): Promise<{ success: boolean; error?: string }> {
  try {
    await db
      .update(users)
      .set({ role: 'admin' })
      .where(or(eq(users.role, 'super_admin')))
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
