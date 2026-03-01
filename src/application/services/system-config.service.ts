import { eq } from 'drizzle-orm'

import { db } from '@/infrastructure/database/db'
import { systemConfig } from '@/infrastructure/database/schema/schema'

export interface SystemConfigInterface {
  isSubscriptionEnabled: boolean
}

export class SystemConfigService {
  private static instance: SystemConfigService
  private config: SystemConfigInterface
  private isInitialized = false

  private constructor() {
    // Valeur par défaut, remplacée par initialize()
    this.config = {
      isSubscriptionEnabled: false
    }
  }

  public static getInstance(): SystemConfigService {
    if (!SystemConfigService.instance) {
      SystemConfigService.instance = new SystemConfigService()
    }
    return SystemConfigService.instance
  }

  /**
   * Initialise la configuration depuis la base de données
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      const configRow = await db
        .select()
        .from(systemConfig)
        .where(eq(systemConfig.key, 'isSubscriptionEnabled'))
        .limit(1)
      if (configRow.length > 0) {
        this.setConfigValue('isSubscriptionEnabled', configRow[0].value)
        console.info(`⚙️ Configuration système chargée : isSubscriptionEnabled = ${this.config.isSubscriptionEnabled}`)
      } else {
        console.warn('⚠️ Clé isSubscriptionEnabled non trouvée en base, utilisation de la valeur par défaut (false)')
      }
      this.isInitialized = true
    } catch (error) {
      console.warn('⚠️ Impossible de charger la config depuis la DB, utilisation des valeurs par défaut:', error)
      this.isInitialized = true
    }
  }

  private setConfigValue(key: string, value: string): void {
    if (key === 'isSubscriptionEnabled') {
      this.config.isSubscriptionEnabled = value === 'true'
    }
  }

  public async getConfig(): Promise<SystemConfigInterface> {
    await this.initialize()
    return { ...this.config }
  }

  public getConfigSync(): SystemConfigInterface {
    if (!this.isInitialized) {
      console.warn('⚠️ getConfigSync() appelé avant initialisation')
    }
    return { ...this.config }
  }

  public async updateConfig(updates: Partial<SystemConfigInterface>): Promise<void> {
    await this.initialize()
    if (typeof updates.isSubscriptionEnabled === 'boolean') {
      this.config.isSubscriptionEnabled = updates.isSubscriptionEnabled
      await this.saveConfigToDb('isSubscriptionEnabled', updates.isSubscriptionEnabled ? 'true' : 'false', new Date())
    }
    console.info('💾 Configuration système sauvegardée en base de données')
  }

  private async saveConfigToDb(key: string, value: string, timestamp: Date): Promise<void> {
    const id = `config_${key}`
    try {
      const existing = await db.select().from(systemConfig).where(eq(systemConfig.key, key)).limit(1)
      if (existing.length > 0) {
        await db
          .update(systemConfig)
          .set({ value, updatedAt: timestamp, isActive: true })
          .where(eq(systemConfig.key, key))
      } else {
        await db.insert(systemConfig).values({
          id,
          key,
          value,
          description: `Configuration automatique pour ${key}`,
          isActive: true,
          createdAt: timestamp,
          updatedAt: timestamp
        })
      }
    } catch (error) {
      console.error(`Erreur lors de la sauvegarde de ${key}:`, error)
    }
  }

  // Méthodes spécifiques pour les vérifications courantes
  public async isSubscriptionEnabled(): Promise<boolean> {
    await this.initialize()
    return this.config.isSubscriptionEnabled
  }

  public isSubscriptionEnabledSync(): boolean {
    if (!this.isInitialized) {
      console.warn('⚠️ isSubscriptionEnabledSync() appelé avant initialisation, retour de false par défaut')
    }
    return this.config.isSubscriptionEnabled
  }

  // Méthodes pour désactiver temporairement le système d'abonnement
  public async disableSubscriptionSystem(): Promise<void> {
    await this.updateConfig({
      isSubscriptionEnabled: false
    })
  }

  public async enableSubscriptionSystem(): Promise<void> {
    await this.updateConfig({
      isSubscriptionEnabled: true
    })
  }

  // Mode test - désactive toutes les restrictions d'abonnement
  public async enableTestMode(): Promise<void> {
    await this.updateConfig({
      isSubscriptionEnabled: false
    })
    console.info('🧪 Mode test activé - Configuration sauvegardée en DB')
  }

  public async disableTestMode(): Promise<void> {
    await this.updateConfig({
      isSubscriptionEnabled: true
    })
    console.info('💼 Mode production activé - Configuration sauvegardée en DB')
  }
}
