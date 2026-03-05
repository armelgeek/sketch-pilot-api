import { eq } from 'drizzle-orm'
import { db } from '../database/db'
import { systemConfig } from '../database/schema/schema'

export async function initSystemConfig(): Promise<{ success: boolean; configs: any[]; error?: string }> {
  try {
    const now = new Date()
    const configs = [
      {
        id: 'config_isSubscriptionEnabled',
        key: 'isSubscriptionEnabled',
        value: 'true',
        description: 'Enable or disable the subscription system',
        isActive: true,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'config_isTrialRequired',
        key: 'isTrialRequired',
        value: 'false',
        description: 'Determines if a trial period is required',
        isActive: true,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'config_maintenanceMode',
        key: 'maintenanceMode',
        value: 'false',
        description: 'Enable maintenance mode (blocks user access)',
        isActive: true,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'config_allowNewRegistrations',
        key: 'allowNewRegistrations',
        value: 'true',
        description: 'Allow or block new registrations',
        isActive: true,
        createdAt: now,
        updatedAt: now
      }
    ]

    for (const config of configs) {
      const existing = await db.select().from(systemConfig).where(eq(systemConfig.key, config.key)).limit(1)
      if (existing.length === 0) {
        await db.insert(systemConfig).values(config)
      }
    }

    const allConfigs = await db.select().from(systemConfig).where(eq(systemConfig.isActive, true))

    const { SystemConfigService } = await import('@/application/services/system-config.service')
    await SystemConfigService.getInstance().initialize()

    return { success: true, configs: allConfigs }
  } catch (error: any) {
    return { success: false, configs: [], error: error.message }
  }
}
