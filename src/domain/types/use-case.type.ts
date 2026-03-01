import { ActivityActionType, type ActivityType } from '@/infrastructure/config/activity.config'
import { db } from '@/infrastructure/database/db'
import { activityLogs } from '@/infrastructure/database/schema'
import { ActivityLogRepository } from '@/infrastructure/repositories/activity-log.repository'

import type { NewActivityLog } from './activity-log.type'

interface Obj {
  [key: string]: any
}

export abstract class IUseCase<T extends Obj = any, TRes = any> {
  abstract execute(params: T): Promise<TRes>
  abstract log(): ActivityType
  protected async logActivity(
    userId: string,
    resourceId?: string,
    resource?: string,
    ipAddress?: string,
    status?: string
  ): Promise<string | undefined> {
    try {
      const action = this.log()
      let finalIp = ipAddress
      if (!finalIp && typeof globalThis !== 'undefined' && (globalThis as any).__honoCtx) {
        const ctx = (globalThis as any).__honoCtx
        finalIp =
          ctx.req.header('x-forwarded-for') ||
          ctx.req.header('x-real-ip') ||
          ctx.req.header('cf-connecting-ip') ||
          ctx.req.header('x-client-ip') ||
          ctx.req.header('x-remote-addr') ||
          ctx.req.header('remote-addr') ||
          undefined
      }
      const actionTypeMap = ActivityActionType as Record<ActivityType, string>
      const newActivity: NewActivityLog = {
        id: crypto.randomUUID(),
        userId,
        action,
        activityType: actionTypeMap[action] ?? 'UNKNOWN',
        timestamp: new Date(),
        ipAddress: finalIp || '',
        status: status || 'success'
      }
      if (resourceId) {
        ;(newActivity as any).resourceId = resourceId
      }
      if (resource) {
        ;(newActivity as any).resource = resource
      }
      await db.insert(activityLogs).values(newActivity)
      return newActivity.id
    } catch (error) {
      console.error('Failed to log activity:', error)
      return undefined
    }
  }

  async run(
    params: T & { currentUserId: string; resource?: string; ipAddress?: string; status?: string }
  ): Promise<{ result: TRes; activityLogId?: string }> {
    const { currentUserId, resource, ipAddress, status, ...rest } = params
    let activityLogId: string | undefined
    if (currentUserId) {
      activityLogId = await this.logActivity(currentUserId, undefined, resource, ipAddress, status)
    }
    const result = await this.execute(rest as any)
    return { result, activityLogId }
  }

  async updateActivityResource(activityLogId: string, resourceId?: string, resource?: string, status?: string) {
    try {
      const repo = new ActivityLogRepository()
      await repo.updateResource(activityLogId, resourceId, resource, status)
    } catch (error) {
      console.error('Failed to update activity log resourceId/resource/status:', error)
    }
  }
}
