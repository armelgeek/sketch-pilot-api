import type { TrialConfig } from '../models/trial-config.model'

export interface TrialConfigRepositoryInterface {
  getConfig: () => Promise<TrialConfig | null>
  updateConfig: (config: Omit<TrialConfig, 'id' | 'createdAt' | 'updatedAt'>) => Promise<TrialConfig>
}
