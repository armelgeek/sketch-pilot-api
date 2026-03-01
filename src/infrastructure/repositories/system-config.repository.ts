import { eq } from 'drizzle-orm'
import { db } from '@/infrastructure/database/db'
import { systemConfig } from '@/infrastructure/database/schema/schema'
import type { SystemConfigRepositoryInterface } from '@/domain/repositories/system-config.repository.interface'

export class SystemConfigRepository implements SystemConfigRepositoryInterface {
  async findConfig(key: string) {
    const row = await db.select().from(systemConfig).where(eq(systemConfig.key, key)).limit(1)
    if (row.length === 0) return null
    return { isSubscriptionEnabled: row[0].value === 'true' }
  }

  async updateConfig(key: string, value: string) {
    const updated = await db.update(systemConfig).set({ value }).where(eq(systemConfig.key, key)).returning()
    if (updated.length === 0) throw new Error('Config not found')
    return { isSubscriptionEnabled: updated[0].value === 'true' }
  }
}
