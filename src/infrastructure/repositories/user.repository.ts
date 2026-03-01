import { and, eq, ilike, not, or, sql } from 'drizzle-orm'
import type { User } from '@/domain/models/user.model'
import type {
  PaginatedUsers,
  UserFilter,
  UserRepositoryInterface
} from '@/domain/repositories/user.repository.interface'
import { db } from '../database/db'

import { children, users } from '../database/schema'
import type { z } from 'zod'

export class UserRepository implements UserRepositoryInterface {
  async findById(id: string): Promise<z.infer<typeof User> | null> {
    const [user] = await db.select().from(users).where(eq(users.id, id))

    if (!user) return null

    return {
      id: user.id,
      name: user.name,
      firstname: user.firstname || undefined,
      lastname: user.lastname || undefined,
      email: user.email,
      emailVerified: user.emailVerified,
      lastLoginAt: user.lastLoginAt || null,
      image: user.image || undefined,
      isAdmin: user.isAdmin,
      isTrialActive: user.isTrialActive,
      hasTrialUsed: user.hasTrialUsed,
      trialStartDate: user.trialStartDate || undefined,
      trialEndDate: user.trialEndDate || undefined,
      stripeCustomerId: user.stripeCustomerId || undefined,
      stripeSubscriptionId: user.stripeSubscriptionId || undefined,
      stripePriceId: user.planId || undefined,
      stripeCurrentPeriodEnd: user.stripeCurrentPeriodEnd || undefined,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }
  }

  async findAll(): Promise<z.infer<typeof User>[]> {
    const dbUsers = await db.select().from(users)

    return dbUsers.map((user) => ({
      id: user.id,
      name: user.name,
      firstname: user.firstname || undefined,
      lastname: user.lastname || undefined,
      email: user.email,
      emailVerified: user.emailVerified,
      lastLoginAt: user.lastLoginAt || null,
      image: user.image || undefined,
      isAdmin: user.isAdmin,
      isTrialActive: user.isTrialActive,
      hasTrialUsed: user.hasTrialUsed,
      trialStartDate: user.trialStartDate || undefined,
      trialEndDate: user.trialEndDate || undefined,
      stripeCustomerId: user.stripeCustomerId || undefined,
      stripeSubscriptionId: user.stripeSubscriptionId || undefined,
      stripePriceId: user.planId || undefined,
      stripeCurrentPeriodEnd: user.stripeCurrentPeriodEnd || undefined,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }))
  }

  async countChildren(userId: string): Promise<number> {
    const result = await db
      .select({
        count: sql<number>`count(*)::int`
      })
      .from(children)
      .where(eq(children.parentId, userId))

    return result[0].count || 0
  }

  async findPaginatedUsers(filter: UserFilter): Promise<PaginatedUsers> {
    const page = filter.page || 1
    const limit = filter.limit || 10
    const offset = (page - 1) * limit

    const conditions = []

    const baseQuery = db.select().from(users)

    if (filter.role) {
      if (filter.role === 'not_user') {
        conditions.push(not(eq(users.role, 'user')))
      } else {
        conditions.push(eq(users.role, filter.role))
      }
    }

    if (filter.search) {
      conditions.push(
        or(
          ilike(users.name, `%${filter.search}%`),
          ilike(users.firstname || '', `%${filter.search}%`),
          ilike(users.lastname || '', `%${filter.search}%`)
        )
      )
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined
    const query = whereClause ? baseQuery.where(whereClause) : baseQuery

    const [{ count }] = await db
      .select({
        count: sql<number>`count(${users.id})::int`
      })
      .from(query.as('filtered_users'))

    const total = count

    const results = await query.orderBy(users.createdAt).limit(limit).offset(offset)

    const mappedUsers = await Promise.all(
      results.map(async (user) => {
        const childCount = await this.countChildren(user.id)

        return {
          id: user.id,
          name: user.name,
          firstname: user.firstname || undefined,
          lastname: user.lastname || undefined,
          email: user.email,
          emailVerified: user.emailVerified,
          image: user.image || undefined,
          isAdmin: user.isAdmin,
          isTrialActive: user.isTrialActive,
          hasTrialUsed: user.hasTrialUsed,
          trialStartDate: user.trialStartDate || undefined,
          trialEndDate: user.trialEndDate || undefined,
          stripeCustomerId: user.stripeCustomerId || undefined,
          stripeSubscriptionId: user.stripeSubscriptionId || undefined,
          stripePriceId: user.planId || undefined,
          stripeCurrentPeriodEnd: user.stripeCurrentPeriodEnd || undefined,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastLoginAt: user.lastLoginAt || null,
          role: user.role,
          childrenCount: childCount
        }
      })
    )

    return {
      users: mappedUsers,
      total,
      page,
      limit
    }
  }

  async findByEmail(email: string): Promise<z.infer<typeof User> | null> {
    const [user] = await db.select().from(users).where(eq(users.email, email))

    if (!user) return null

    return {
      id: user.id,
      name: user.name,
      firstname: user.firstname || undefined,
      lastname: user.lastname || undefined,
      email: user.email,
      emailVerified: user.emailVerified,
      lastLoginAt: user.lastLoginAt || null,
      image: user.image || undefined,
      isAdmin: user.isAdmin,
      isTrialActive: user.isTrialActive,
      hasTrialUsed: user.hasTrialUsed,
      trialStartDate: user.trialStartDate || undefined,
      trialEndDate: user.trialEndDate || undefined,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }
  }

  async update(id: string, data: Partial<z.infer<typeof User>>): Promise<z.infer<typeof User>> {
    const updateData: any = {
      updatedAt: new Date()
    }

    if (data.name !== undefined) updateData.name = data.name
    if (data.email !== undefined) updateData.email = data.email
    if (data.firstname !== undefined) updateData.firstname = data.firstname
    if (data.lastname !== undefined) updateData.lastname = data.lastname
    if (data.emailVerified !== undefined) updateData.emailVerified = data.emailVerified
    if (data.image !== undefined) updateData.image = data.image
    if (data.isAdmin !== undefined) updateData.isAdmin = data.isAdmin

    const [updatedUser] = await db.update(users).set(updateData).where(eq(users.id, id)).returning()

    if (!updatedUser) {
      throw new Error('User not found')
    }

    return {
      id: updatedUser.id,
      name: updatedUser.name,
      firstname: updatedUser.firstname || undefined,
      lastname: updatedUser.lastname || undefined,
      email: updatedUser.email,
      emailVerified: updatedUser.emailVerified,
      lastLoginAt: updatedUser.lastLoginAt || null,
      image: updatedUser.image || undefined,
      isAdmin: updatedUser.isAdmin,
      isTrialActive: updatedUser.isTrialActive,
      hasTrialUsed: updatedUser.hasTrialUsed,
      trialStartDate: updatedUser.trialStartDate || undefined,
      trialEndDate: updatedUser.trialEndDate || undefined,
      stripeCustomerId: updatedUser.stripeCustomerId || undefined,
      stripeSubscriptionId: updatedUser.stripeSubscriptionId || undefined,
      stripePriceId: updatedUser.planId || undefined,
      stripeCurrentPeriodEnd: updatedUser.stripeCurrentPeriodEnd || undefined,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt
    }
  }

  async parentAccountsHistogram({ startDate, endDate }: { startDate?: Date; endDate?: Date } = {}): Promise<
    Array<{ date: string; count: number }>
  > {
    // Histogramme du nombre de comptes parents créés par mois (ou jour si période courte)
    let where = sql`is_admin = false`
    if (startDate) where = sql`${where} AND created_at >= ${startDate}`
    if (endDate) where = sql`${where} AND created_at <= ${endDate}`
    // Regroupement par mois (YYYY-MM)
    const result = await db
      .select({
        date: sql`to_char(created_at, 'YYYY-MM')`,
        count: sql`COUNT(*)`
      })
      .from(users)
      .where(where)
      .groupBy(sql`to_char(created_at, 'YYYY-MM')`)
      .orderBy(sql`to_char(created_at, 'YYYY-MM')`)
    return result.map((row) => ({ date: String(row.date), count: Number(row.count) }))
  }

  async countParents(): Promise<number> {
    // Compte tous les utilisateurs qui ne sont pas admin (parents)
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.role, 'user'))
    return result[0]?.count || 0
  }
}
