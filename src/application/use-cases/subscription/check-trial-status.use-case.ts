import { eq } from 'drizzle-orm'
import { validDateOrNull } from '@/application/utils/date.util'
import { IUseCase } from '@/domain/types'
import { db } from '@/infrastructure/database/db'
import { users } from '@/infrastructure/database/schema'

export interface CheckTrialStatusArgs {
  userId: string
}

export class CheckTrialStatusUseCase extends IUseCase<CheckTrialStatusArgs, void> {
  async execute({ userId }: CheckTrialStatusArgs): Promise<void> {
    const [user] = await db
      .select({
        isTrialActive: users.isTrialActive,
        trialEndDate: users.trialEndDate,
        stripeSubscriptionId: users.stripeSubscriptionId,
        hasTrialUsed: users.hasTrialUsed
      })
      .from(users)
      .where(eq(users.id, userId))

    if (!user || !user.isTrialActive || !user.trialEndDate) {
      return
    }

    if (user.stripeSubscriptionId) {
      return
    }

    if (user.trialEndDate.getTime() < Date.now()) {
      await db
        .update(users)
        .set({
          isTrialActive: false,
          trialEndDate: validDateOrNull(null),
          trialStartDate: validDateOrNull(null),
          hasTrialUsed: true
        })
        .where(eq(users.id, userId))
    }
  }
}
