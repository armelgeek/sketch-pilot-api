import { eq } from 'drizzle-orm'
import { validDateOrNull } from '@/application/utils/date.util'
import { IUseCase } from '@/domain/types'
import { ActivityType } from '@/infrastructure/config/activity.config'
import { emailTemplates, sendEmail } from '@/infrastructure/config/mail.config'
import { db } from '@/infrastructure/database/db'
import { users } from '@/infrastructure/database/schema'

export class NotifyTrialEndingUseCase extends IUseCase<{}, void> {
  async execute(): Promise<void> {
    const trialUsers = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        trialEndDate: users.trialEndDate,
        isTrialActive: users.isTrialActive,
        hasTrialUsed: users.hasTrialUsed
      })
      .from(users)
      .where(eq(users.isTrialActive, true))

    const now = new Date()
    const threeDaysInMs = 3 * 24 * 60 * 60 * 1000
    const oneDayInMs = 24 * 60 * 60 * 1000

    for (const user of trialUsers) {
      if (!user.trialEndDate || !user.isTrialActive) continue

      const timeUntilEnd = user.trialEndDate.getTime() - now.getTime()

      // Notification à 3 jours de la fin
      if (timeUntilEnd > 0 && timeUntilEnd <= threeDaysInMs) {
        const daysLeft = Math.ceil(timeUntilEnd / (24 * 60 * 60 * 1000))
        const emailTemplate = await emailTemplates.trialEnding(user.name, daysLeft)
        await sendEmail({
          to: user.email,
          ...emailTemplate
        })
      }
      // Notification à 1 jour de la fin
      else if (timeUntilEnd > 0 && timeUntilEnd <= oneDayInMs) {
        const emailTemplate = await emailTemplates.trialLastDay(user.name)
        await sendEmail({
          to: user.email,
          ...emailTemplate
        })
      }
      // Notification le jour de la fin
      else if (timeUntilEnd <= 0 && timeUntilEnd > -oneDayInMs) {
        await db
          .update(users)
          .set({
            isTrialActive: false,
            hasTrialUsed: true,
            trialEndDate: validDateOrNull(null),
            trialStartDate: validDateOrNull(null)
          })
          .where(eq(users.id, user.id))

        const emailTemplate = await emailTemplates.trialEnded(user.name)
        await sendEmail({
          to: user.email,
          ...emailTemplate
        })
      }

      await this.logActivity(user.id)
    }
  }

  log(): ActivityType {
    return ActivityType.TRIAL_ENDING_NOTIFICATION
  }
}
