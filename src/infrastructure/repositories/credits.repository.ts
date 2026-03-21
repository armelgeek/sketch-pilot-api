import { desc, eq } from 'drizzle-orm'
import { WELCOME_CREDITS } from '../config/video.config'
import { db } from '../database/db'
import { creditTransactions, userCredits } from '../database/schema'

export class CreditsRepository {
  async getUserCredits(userId: string) {
    const credits = await db.query.userCredits?.findFirst?.({
      where: (t: any, { eq: eqFn }: any) => eqFn(t.userId, userId)
    })
    return credits || null
  }

  async getActiveSubscription(userId: string) {
    const sub = await db.query.subscriptions?.findFirst?.({
      where: (t: any, { and: andFn, eq: eqFn }: any) => andFn(eqFn(t.referenceId, userId), eqFn(t.status, 'active'))
    })
    return sub || null
  }

  async ensureUserCredits(userId: string) {
    let credits = await this.getUserCredits(userId)
    const now = new Date()

    if (!credits) {
      const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      await db.insert(userCredits).values({
        id: crypto.randomUUID(),
        userId,
        extraCredits: WELCOME_CREDITS,
        videosThisMonth: 0,
        resetDate,
        updatedAt: now
      })

      // Record welcome transaction
      await this.addTransaction({
        userId,
        type: 'welcome_bonus',
        amount: WELCOME_CREDITS
      })

      credits = await this.getUserCredits(userId)
    } else if (credits.resetDate && credits.resetDate <= now) {
      // Monthly reset
      const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      await db
        .update(userCredits)
        .set({ videosThisMonth: 0, resetDate: nextReset, updatedAt: now })
        .where(eq(userCredits.userId, userId))

      credits = await this.getUserCredits(userId)
    }
    return credits
  }

  /**
   * Consumes credits from the user's account with priority:
   * 1. Monthly plan credits (videosThisMonth field now tracks credits)
   * 2. Extra credits (purchased/topup)
   *
   * @param userId The unique user ID
   * @param totalAmount Total credits to deduct
   * @param planLimit The monthly credit limit for the user's current plan (-1 for unlimited)
   * @returns An object containing the amount of plan credits and extra credits consumed.
   */
  async consumeCredits(
    userId: string,
    totalAmount: number,
    planLimit: number
  ): Promise<{ planConsumed: number; extraConsumed: number }> {
    const credits = await this.ensureUserCredits(userId)
    if (!credits) throw new Error('User credits record not found')

    const now = new Date()
    const consumedThisMonth = credits.videosThisMonth

    let planConsumed = 0
    let extraConsumed = 0

    if (planLimit === -1) {
      // Unlimited plan: use plan quota (tracked but never blocked)
      planConsumed = totalAmount
    } else {
      const remainingPlan = Math.max(0, planLimit - consumedThisMonth)

      if (remainingPlan >= totalAmount) {
        planConsumed = totalAmount
      } else {
        planConsumed = remainingPlan
        extraConsumed = totalAmount - remainingPlan
      }
    }

    // Update database
    if (planConsumed > 0 || extraConsumed > 0) {
      await db
        .update(userCredits)
        .set({
          videosThisMonth: consumedThisMonth + planConsumed,
          extraCredits: credits.extraCredits - extraConsumed,
          updatedAt: now
        })
        .where(eq(userCredits.userId, userId))
    }

    return { planConsumed, extraConsumed }
  }

  async addExtraCredits(userId: string, amount: number): Promise<void> {
    const credits = await this.ensureUserCredits(userId)
    if (!credits) return
    await db
      .update(userCredits)
      .set({ extraCredits: credits.extraCredits + amount, updatedAt: new Date() })
      .where(eq(userCredits.userId, userId))
  }

  async setExtraCredits(userId: string, amount: number): Promise<void> {
    await this.ensureUserCredits(userId)
    await db
      .update(userCredits)
      .set({ extraCredits: amount, updatedAt: new Date() })
      .where(eq(userCredits.userId, userId))
  }

  getCreditTransactions(userId: string, limit = 50) {
    return db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, userId))
      .orderBy(desc(creditTransactions.createdAt))
      .limit(limit)
  }

  async addTransaction(data: {
    userId: string
    type: string
    amount: number
    price?: string | null
    currency?: string
    stripeSessionId?: string
    packId?: string
    videoId?: string
    metadata?: any
  }) {
    await db.insert(creditTransactions).values({
      id: crypto.randomUUID(),
      userId: data.userId,
      type: data.type,
      amount: data.amount,
      price: data.price ?? null,
      currency: data.currency || 'usd',
      stripeSessionId: data.stripeSessionId ?? null,
      packId: data.packId ?? null,
      videoId: data.videoId ?? null,
      metadata: data.metadata ?? null,
      createdAt: new Date()
    })
  }

  /**
   * Refund credits to the user.
   */
  async refundCredits(
    userId: string,
    amount: number,
    videoId: string,
    metadata: { planConsumed: number; extraConsumed: number }
  ): Promise<void> {
    const credits = await this.ensureUserCredits(userId)
    if (!credits) return

    // Refund plan credits by decrementing videosThisMonth
    const newVideosThisMonth = Math.max(0, credits.videosThisMonth - metadata.planConsumed)

    // Refund extra credits
    const newExtraCredits = credits.extraCredits + metadata.extraConsumed

    await db
      .update(userCredits)
      .set({
        videosThisMonth: newVideosThisMonth,
        extraCredits: newExtraCredits,
        updatedAt: new Date()
      })
      .where(eq(userCredits.userId, userId))

    // Record refund transaction
    await this.addTransaction({
      userId,
      type: 'refund',
      amount,
      videoId,
      metadata: {
        ...metadata,
        originalAmount: -amount,
        reason: 'Job failed permanently'
      }
    })
    console.info(`[CreditsRepository] Refunded ${amount} credits to user ${userId} for video ${videoId}`)
  }
}
