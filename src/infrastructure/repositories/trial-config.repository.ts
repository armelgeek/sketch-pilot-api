import { randomUUID } from 'node:crypto'
import { desc } from 'drizzle-orm'
import type { TrialConfig } from '@/domain/models/trial-config.model'
import type { TrialConfigRepositoryInterface } from '@/domain/repositories/trial-config.repository.interface'
import { db } from '../database/db'
import { trialConfig } from '../database/schema/trial-config.schema'

export class TrialConfigRepository implements TrialConfigRepositoryInterface {
  async getConfig(): Promise<TrialConfig | null> {
    const configs = await db.select().from(trialConfig).orderBy(desc(trialConfig.createdAt)).limit(1)

    if (!configs.length) return null

    const config = configs[0]
    return {
      id: config.id,
      isEnabled: config.isEnabled,
      durationInDays: config.durationInDays,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt
    }
  }

  async updateConfig(data: Omit<TrialConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<TrialConfig> {
    const id = randomUUID()
    const now = new Date()

    await db.insert(trialConfig).values({
      id,
      isEnabled: data.isEnabled,
      durationInDays: data.durationInDays,
      createdAt: now,
      updatedAt: now
    })

    return {
      id,
      isEnabled: data.isEnabled,
      durationInDays: data.durationInDays,
      createdAt: now,
      updatedAt: now
    }
  }
}
