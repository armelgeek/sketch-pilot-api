import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/infrastructure/database/db'
import { activityLogs, users } from '@/infrastructure/database/schema/schema'
import { SUPER_ADMINS } from '../config/auth.config'

export class ActivityLogRepository {
  async getDistinctActions(): Promise<string[]> {
    const rows = await db.select({ action: activityLogs.action }).from(activityLogs).groupBy(activityLogs.action)
    return rows.map((r: any) => r.action).filter(Boolean)
  }

  async getDistinctResources(): Promise<string[]> {
    const rows = await db.select({ resource: activityLogs.resource }).from(activityLogs).groupBy(activityLogs.resource)
    return rows.map((r: any) => r.resource).filter(Boolean)
  }

  async getDistinctStatuses(): Promise<string[]> {
    const rows = await db.select({ status: activityLogs.status }).from(activityLogs).groupBy(activityLogs.status)
    return rows.map((r: any) => r.status).filter(Boolean)
  }

  async getDistinctRoles(): Promise<string[]> {
    const rows = await db
      .select({ role: users.role })
      .from(activityLogs)
      .innerJoin(users, eq(activityLogs.userId, users.id))
      .groupBy(users.role)
    return rows.map((r: any) => r.role).filter(Boolean)
  }
  async updateResource(activityId: string, resourceId?: string, resource?: string, status?: string): Promise<void> {
    const updateData: Record<string, any> = {}
    if (resourceId !== undefined) updateData.resourceId = resourceId
    if (resource !== undefined) updateData.resource = resource
    if (status !== undefined) updateData.status = status
    await db.update(activityLogs).set(updateData).where(eq(activityLogs.id, activityId))
  }
  async search({
    search,
    userStatus,
    activityType,
    result,
    page = 1,
    limit = 20,
    action
  }: {
    search?: string
    userStatus?: string
    activityType?: string
    result?: string
    page?: number
    limit?: number
    action?: string
  }) {
    const where = []
    if (search) {
      // Use coalesce to handle null firstname/lastname for ilike
      where.push(
        or(
          ilike(sql`coalesce(${users.firstname}, '')`, `%${search}%`),
          ilike(sql`coalesce(${users.lastname}, '')`, `%${search}%`),
          ilike(sql`coalesce(${users.email}, '')`, `%${search}%`),
          ilike(sql`coalesce(${users.name}, '')`, `%${search}%`),
          ilike(sql`coalesce(${activityLogs.ipAddress}, '')`, `%${search}%`)
        )
      )
    }
    if (userStatus === 'admin') {
      // Exclude super admins by email
      const emails = SUPER_ADMINS.map((a) => a.email)
        .map((e) => `'${e}'`)
        .join(',')
      where.push(sql`${users.role} = 'admin' AND ${users.email} NOT IN (${sql.raw(emails)})`)
    } else if (userStatus === 'super_admin') {
      // Only super admins by email
      const emails = SUPER_ADMINS.map((a) => a.email)
        .map((e) => `'${e}'`)
        .join(',')
      where.push(sql`${users.email} IN (${sql.raw(emails)})`)
    } else if (userStatus === 'parent') {
      where.push(eq(users.role, 'user'))
    }
    if (activityType) {
      where.push(eq(activityLogs.activityType, activityType))
    }
    // Support filtering by action (for explicit action param)
    if (typeof action === 'string' && action.trim() !== '') {
      where.push(eq(activityLogs.action, action))
    }
    if (result) {
      where.push(eq(activityLogs.status, result))
    }
    const offset = (page - 1) * limit
    // Filtrage des doublons : group by userId, action, status, date arrondie à la minute
    const [items, [{ count: totalCount }]] = await Promise.all([
      db
        .select({
          id: sql`min(${activityLogs.id})`.as('id'),
          timestamp: sql`date_trunc('minute', ${activityLogs.timestamp})`.as('timestamp'),
          action: activityLogs.action,
          resource: activityLogs.resource,
          resourceId: activityLogs.resourceId,
          status: activityLogs.status,
          ipAddress: activityLogs.ipAddress,
          activityType: activityLogs.activityType,
          userId: users.id,
          firstname: users.firstname,
          lastname: users.lastname,
          name: users.name,
          email: users.email,
          role: users.role
        })
        .from(activityLogs)
        .innerJoin(users, eq(activityLogs.userId, users.id))
        .where(where.length ? and(...where) : undefined)
        .groupBy(
          users.id,
          activityLogs.action,
          activityLogs.status,
          sql`date_trunc('minute', ${activityLogs.timestamp})`,
          activityLogs.resource,
          activityLogs.resourceId,
          activityLogs.ipAddress,
          activityLogs.activityType,
          users.firstname,
          users.lastname,
          users.name,
          users.email,
          users.role
        )
        .orderBy(desc(sql`date_trunc('minute', ${activityLogs.timestamp})`))
        .offset(offset)
        .limit(limit),
      db.select({ count: count() }).from(
        db
          .select({
            id: sql`min(${activityLogs.id})`.as('id'),
            timestamp: sql`date_trunc('minute', ${activityLogs.timestamp})`.as('timestamp'),
            action: activityLogs.action,
            status: activityLogs.status,
            userId: users.id
          })
          .from(activityLogs)
          .innerJoin(users, eq(activityLogs.userId, users.id))
          .where(where.length ? and(...where) : undefined)
          .groupBy(
            users.id,
            activityLogs.action,
            activityLogs.status,
            sql`date_trunc('minute', ${activityLogs.timestamp})`
          )
          .as('deduped')
      )
    ])
    return {
      items,
      total: Number(totalCount),
      page,
      limit,
      totalPages: Math.ceil(Number(totalCount) / limit)
    }
  }
}
