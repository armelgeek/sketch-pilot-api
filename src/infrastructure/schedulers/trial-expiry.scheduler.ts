import { and, eq, isNull, lt, or } from 'drizzle-orm'
import { emailTemplates, sendEmail } from '@/infrastructure/config/mail.config'
import { db } from '@/infrastructure/database/db'
import { users } from '@/infrastructure/database/schema'

/**
 * Scheduler: Désactive les trials expirés et envoie l'email de fin d'essai.
 * À exécuter via cron (ex: toutes les heures).
 */
export async function runTrialExpiryScheduler() {
  const now = new Date()
  // Sélectionne tous les utilisateurs avec trial actif, trialCanceled, trialEndDate dépassée et pas d'abonnement Stripe
  // Sélectionne les périodes d'essai expirées
  const expiredTrials = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.isTrialActive, true),
        lt(users.trialEndDate, now),
        // On vérifie seulement si la période d'essai est annulée si l'utilisateur n'a pas d'abonnement
        or(eq(users.trialCanceled, true), isNull(users.stripeSubscriptionId))
      )
    )

  // Rappel J-1/J-2/J-3 : n'envoie qu'une seule fois par jour
  // Nécessite un champ lastTrialReminderDate (date) dans users
  for (const daysLeft of [1, 2, 3]) {
    const targetDate = new Date(now.getTime() + daysLeft * 24 * 60 * 60 * 1000)
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endingTrials = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.isTrialActive, true),
          eq(users.trialEndDate, new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate())),
          or(isNull(users.lastTrialReminderDate), lt(users.lastTrialReminderDate, dayStart))
        )
      )

    for (const user of endingTrials) {
      if (user.email && user.name) {
        const emailTemplate =
          daysLeft === 1 ? emailTemplates.trialLastDay(user.name) : emailTemplates.trialEnding(user.name, daysLeft)
        await sendEmail({
          to: user.email,
          ...emailTemplate
        })
        await db.update(users).set({ lastTrialReminderDate: now }).where(eq(users.id, user.id))
        console.info(`[TrialScheduler] Trial reminder (${daysLeft} days left) sent to user ${user.id}`)
      }
    }
  }

  for (const user of expiredTrials) {
    await db.update(users).set({ isTrialActive: false }).where(eq(users.id, user.id))

    // Envoi de l'email de fin d'essai
    if (user.email && user.name) {
      const emailTemplate = emailTemplates.trialEnded(user.name)
      await sendEmail({
        to: user.email,
        ...emailTemplate
      })
      console.info(`[TrialScheduler] Trial ended for user ${user.id}, email sent.`)
    }
  }
}
