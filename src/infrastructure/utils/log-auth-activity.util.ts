import { ActivityActionType, type ActivityType } from '@/infrastructure/config/activity.config'
import { db } from '@/infrastructure/database/db'
import { activityLogs } from '@/infrastructure/database/schema/schema'
import type { NewActivityLog } from '@/domain/types/activity-log.type'

export async function logAuthActivity({
  userId,
  action,
  status = 'success',
  ipAddress
}: {
  userId: string
  action: ActivityType
  status?: string
  ipAddress?: string
}) {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)

  const actionTypeMap = ActivityActionType as Record<ActivityType, string>
  const log: NewActivityLog = {
    id,
    userId,
    action,
    activityType: actionTypeMap[action] ?? 'UNKNOWN',
    status,
    ipAddress,
    timestamp: new Date()
  }
  await db.insert(activityLogs).values(log)
}
