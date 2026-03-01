import { eq, lt } from 'drizzle-orm'
import { IUseCase } from '@/domain/types'
import { ActivityType } from '@/infrastructure/config/activity.config'
import { emailTemplates, sendEmail } from '@/infrastructure/config/mail.config'
import { db } from '@/infrastructure/database/db'
import { users } from '@/infrastructure/database/schema'

export class CheckSubscriptionExpirationUseCase extends IUseCase<{}, void> {
  async execute(): Promise<void> {
    const now = new Date()

    const expiringSubscriptions = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        stripeSubscriptionId: users.stripeSubscriptionId,
        stripeCurrentPeriodEnd: users.stripeCurrentPeriodEnd
      })
      .from(users)
      .where(lt(users.stripeCurrentPeriodEnd, now))

    for (const user of expiringSubscriptions) {
      if (!user.stripeSubscriptionId) continue

      await db
        .update(users)
        .set({
          stripeSubscriptionId: null,
          planId: null,
          stripeCurrentPeriodEnd: null
        })
        .where(eq(users.id, user.id))

      const emailTemplate = await emailTemplates.subscriptionExpired(user.name)
      await sendEmail({
        to: user.email,
        ...emailTemplate
      })

      await this.logActivity(user.id)
    }
  }

  log(): ActivityType {
    return ActivityType.SUBSCRIPTION_EXPIRED
  }
}
