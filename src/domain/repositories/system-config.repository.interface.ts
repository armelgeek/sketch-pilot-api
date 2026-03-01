import type { SystemConfigInterface } from '@/application/services/system-config.service'

export interface SystemConfigRepositoryInterface {
  findConfig: (key: string) => Promise<SystemConfigInterface | null>
  updateConfig: (key: string, value: string) => Promise<SystemConfigInterface>
}
