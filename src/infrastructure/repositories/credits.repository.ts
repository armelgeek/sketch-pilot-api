import { desc, eq } from 'drizzle-orm'
import { db } from '../database/db'
import { creditTransactions, userCredits } from '../database/schema'

export class CreditsRepository {
  async getUserCredits(userId: string) {
    const credits = await db.query.userCredits?.findFirst?.({
      where: (t: any, { eq: eqFn }: any) => eqFn(t.userId, userId)
    })
    return credits || null
  }

  async ensureUserCredits(userId: string) {
    let credits = await this.getUserCredits(userId)
    if (!credits) {
      const now = new Date()
      const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      await db.insert(userCredits).values({
        id: crypto.randomUUID(),
        userId,
        extraCredits: 0,
        videosThisMonth: 0,
        resetDate,
        updatedAt: now
      })
      credits = await this.getUserCredits(userId)
    }
    return credits
  }

  async incrementVideosThisMonth(userId: string): Promise<void> {
    const credits = await this.ensureUserCredits(userId)
    if (!credits) return
    // Check if month has reset
    const now = new Date()
    if (credits.resetDate && credits.resetDate <= now) {
      // Reset monthly counter
      const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      await db
        .update(userCredits)
        .set({ videosThisMonth: 1, resetDate: nextReset, updatedAt: now })
        .where(eq(userCredits.userId, userId))
    } else {
      await db
        .update(userCredits)
        .set({ videosThisMonth: credits.videosThisMonth + 1, updatedAt: now })
        .where(eq(userCredits.userId, userId))
    }
  }

  async deductExtraCredit(userId: string): Promise<void> {
    const credits = await this.ensureUserCredits(userId)
    if (!credits || credits.extraCredits <= 0) return
    await db
      .update(userCredits)
      .set({ extraCredits: credits.extraCredits - 1, updatedAt: new Date() })
      .where(eq(userCredits.userId, userId))
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
      createdAt: new Date()
    })
  }
}
