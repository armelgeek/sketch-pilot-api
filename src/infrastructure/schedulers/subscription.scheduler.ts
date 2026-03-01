import { CheckSubscriptionExpirationUseCase } from '@/application/use-cases/subscription/check-subscription-expiration.use-case'
import { NotifyTrialEndingUseCase } from '@/application/use-cases/subscription/notify-trial-ending.use-case'

export class SubscriptionScheduler {
  private notifyTrialEndingUseCase: NotifyTrialEndingUseCase
  private checkSubscriptionExpirationUseCase: CheckSubscriptionExpirationUseCase

  constructor() {
    this.notifyTrialEndingUseCase = new NotifyTrialEndingUseCase()
    this.checkSubscriptionExpirationUseCase = new CheckSubscriptionExpirationUseCase()
  }

  start() {
    setInterval(
      async () => {
        try {
          await this.notifyTrialEndingUseCase.execute()
        } catch (error) {
          console.error("Erreur lors de la vérification des périodes d'essai:", error)
        }
      },
      60 * 60 * 1000
    ) // 1 heure

    setInterval(
      async () => {
        try {
          await this.checkSubscriptionExpirationUseCase.execute()
        } catch (error) {
          console.error('Erreur lors de la vérification des abonnements expirés:', error)
        }
      },
      60 * 60 * 1000
    ) // 1 heure
  }
}
