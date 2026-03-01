import { eq } from 'drizzle-orm'
import { validDateOrNull } from '@/application/utils/date.util'
import { db } from '@/infrastructure/database/db'
import { users } from '@/infrastructure/database/schema'

export class TrialService {
  async startTrial(userId: string, days: number = 7): Promise<boolean> {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
    if (!user || user.hasTrialUsed) {
      console.info(`[Trial] Cannot start trial for user ${userId}: user=${!!user}, hasTrialUsed=${user?.hasTrialUsed}`)
      return false
    }

    // Validation des paramètres
    if (days <= 0 || days > 365) {
      console.error(`[Trial] Invalid trial duration: ${days} days`)
      return false
    }

    const now = new Date()
    // Expire à minuit du dernier jour
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)

    console.info(
      `[Trial] startTrial for user ${userId}: start=${now.toISOString()} end=${end.toISOString()} days=${days}`
    )

    await db
      .update(users)
      .set({
        isTrialActive: true,
        trialStartDate: validDateOrNull(now),
        trialEndDate: validDateOrNull(end),
        hasTrialUsed: true
      })
      .where(eq(users.id, userId))
    return true
  }

  async interruptTrial(userId: string): Promise<boolean> {
    await db
      .update(users)
      .set({
        isTrialActive: false,
        trialEndDate: validDateOrNull(new Date())
      })
      .where(eq(users.id, userId))
    console.info(`[Trial] Trial interrupted for user ${userId}`)
    return true
  }

  async resumeTrial(userId: string): Promise<boolean> {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
    if (!user || !user.trialEndDate || user.trialEndDate < new Date()) return false
    await db.update(users).set({ isTrialActive: true }).where(eq(users.id, userId))
    return true
  }

  async canStartTrial(userId: string): Promise<boolean> {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
    // Peut démarrer un trial si jamais commencé ET n'a jamais eu de trial
    return !!user && !user.hasTrialUsed
  }
}
