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
        description: "Active ou désactive le système d'abonnement complet",
        isActive: true,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'config_isTrialRequired',
        key: 'isTrialRequired',
        value: 'false',
        description: "Détermine si une période d'essai est obligatoire",
        isActive: true,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'config_maintenanceMode',
        key: 'maintenanceMode',
        value: 'false',
        description: "Active le mode maintenance (bloque l'accès utilisateur)",
        isActive: true,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'config_allowNewRegistrations',
        key: 'allowNewRegistrations',
        value: 'true',
        description: 'Autorise ou bloque les nouvelles inscriptions',
        isActive: true,
        createdAt: now,
        updatedAt: now
      }
    ]

    for (const config of configs) {
      // Vérifier si la configuration existe déjà
      const existing = await db.select().from(systemConfig).where(eq(systemConfig.key, config.key)).limit(1)
      if (existing.length === 0) {
        await db.insert(systemConfig).values(config)
      }
    }

    const allConfigs = await db.select().from(systemConfig).where(eq(systemConfig.isActive, true))

    // Initialise le singleton SystemConfigService avec les valeurs de la DB
    const { SystemConfigService } = await import('@/application/services/system-config.service')
    await SystemConfigService.getInstance().initialize()

    return { success: true, configs: allConfigs }
  } catch (error: any) {
    return { success: false, configs: [], error: error.message }
  }
}
