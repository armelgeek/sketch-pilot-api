import { eq } from 'drizzle-orm'
import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import { stripe } from '@/infrastructure/config/stripe.config'
import { db } from '@/infrastructure/database/db'
import { children, users } from '@/infrastructure/database/schema'
import { subscriptionPlans } from '@/infrastructure/database/schema/subscription-plan.schema'
import type Stripe from 'stripe'

type HistoryEntry = {
  id: string
  action: string
  oldPlan: string | null
  newPlan: string | null
  amount: string | null
  currency: string | null
  status: string
  date: Date
  invoiceType: 'month' | 'year'
  metadata?: {
    invoiceUrl: string | null
    pdfUrl: string | null
    periodStart: Date | null
    periodEnd: Date | null
  } | null
}

export interface GetParentDetailsArgs {
  parentId: string
  currentUserId?: string
}

interface ParentDetails {
  // Informations de base
  id: string
  name: string | null
  email: string
  createdAt: Date
  // Informations d'abonnement
  subscription: {
    currentPlan: {
      name: string | null
      childLimit: number | null
      description: string | null
    }
    isTrialActive: boolean
    trialEndDate: Date | null
    currentPeriodEnd: Date | null
    status: 'active' | 'inactive' | 'trial'
  }
  // Statistiques d'utilisation
  usage: {
    currentChildrenCount: number
    childLimit: number | null
  }
  // Historique des paiements/changements
  history: Array<HistoryEntry>
}

interface Response {
  success: boolean
  data: ParentDetails | null
  error?: string
}

export class GetParentDetailsUseCase extends IUseCase<GetParentDetailsArgs, Response> {
  async execute({ parentId }: GetParentDetailsArgs): Promise<Response> {
    try {
      const parent = await db.query.users.findFirst({
        where: eq(users.id, parentId)
      })

      if (!parent) {
        return {
          success: false,
          data: null,
          error: 'Parent non trouvé'
        }
      }

      // 3. Récupérer le plan d'abonnement actuel
      const currentPlan = parent.planId
        ? await db.query.subscriptionPlans.findFirst({
            where: eq(subscriptionPlans.id, parent.planId)
          })
        : null

      // 4. Compter le nombre d'enfants actuels
      const childrenCount = await db
        .select({ count: children.id })
        .from(children)
        .where(eq(children.parentId, parentId))
        .then((rows) => rows.length)

      // 5. Récupérer l'historique des abonnements depuis Stripe et la base de données
      const stripeHistoryPromise = parent.stripeCustomerId
        ? stripe.invoices.list({ customer: parent.stripeCustomerId, limit: 100 }).then((invoices) => {
            return Promise.all(
              invoices.data.map(async (inv: Stripe.Invoice): Promise<HistoryEntry & { invoiceType: string }> => {
                let planName: string | null = null
                let interval: string | null = null
                const line = inv.lines.data[0]
                if (line?.price) {
                  interval = (line.price as any).interval || null
                  let localPlan = null
                  if (line.price.id) {
                    localPlan = await db.query.subscriptionPlans.findFirst({
                      where: eq(subscriptionPlans.stripePriceIdMonthly, line.price.id)
                    })
                  }
                  if (!localPlan && line.price.id) {
                    localPlan = await db.query.subscriptionPlans.findFirst({
                      where: eq(subscriptionPlans.stripePriceIdYearly, line.price.id)
                    })
                  }
                  planName = localPlan?.name || null
                }
                if (!planName && line?.price?.product && typeof line.price.product === 'string') {
                  planName = null
                }

                // On n'injecte la période du trial QUE pour les factures d'essai gratuit (amount_paid = 0 et trial actif au moment de la facture)
                const isTrialInvoice = (!inv.amount_paid || inv.amount_paid === 0) && parent.isTrialActive
                return {
                  id: inv.id,
                  action: 'payment',
                  oldPlan: null,
                  newPlan: planName,
                  amount: inv.total ? (inv.total / 100).toString() : null,
                  currency: inv.currency || null,
                  status: inv.status || 'unknown',
                  date: new Date(inv.created * 1000),
                  metadata: {
                    invoiceUrl: inv.hosted_invoice_url || null,
                    pdfUrl: inv.invoice_pdf || null,
                    periodStart:
                      isTrialInvoice && parent.trialStartDate
                        ? parent.trialStartDate
                        : inv.period_start
                          ? new Date(inv.period_start * 1000)
                          : null,
                    periodEnd:
                      isTrialInvoice && parent.trialEndDate
                        ? parent.trialEndDate
                        : inv.period_end
                          ? new Date(inv.period_end * 1000)
                          : null
                  },
                  invoiceType: interval === 'month' ? 'month' : 'year'
                }
              })
            )
          })
        : Promise.resolve([])

      const stripeHistory = await stripeHistoryPromise

      // Fusionner et trier l'historique
      const combinedHistory = [...stripeHistory].sort((a, b) => b.date.getTime() - a.date.getTime())

      let status: 'active' | 'inactive' | 'trial' = 'inactive'
      if (parent.isTrialActive) {
        status = 'trial'
      } else if (
        parent.stripeSubscriptionId &&
        parent.stripeCurrentPeriodEnd &&
        parent.stripeCurrentPeriodEnd > new Date()
      ) {
        status = 'active'
      }

      // 7. Construire et retourner la réponse
      const parentDetails: ParentDetails = {
        id: parent.id,
        name: parent.name,
        email: parent.email,
        createdAt: parent.createdAt,
        subscription: {
          currentPlan: currentPlan
            ? {
                name: currentPlan.name,
                childLimit: Number(currentPlan.childLimit),
                description: currentPlan.description
              }
            : {
                name: null,
                childLimit: null,
                description: null
              },
          isTrialActive: parent.isTrialActive,
          trialEndDate: parent.trialEndDate,
          currentPeriodEnd: parent.stripeCurrentPeriodEnd,
          status
        },
        usage: {
          currentChildrenCount: childrenCount,
          childLimit: currentPlan?.childLimit ? Number(currentPlan.childLimit) : null
        },
        history: combinedHistory
      }

      return {
        success: true,
        data: parentDetails
      }
    } catch (error: any) {
      console.error('[Get Parent Details Error]', error)
      return {
        success: false,
        data: null,
        error: error.message || 'Une erreur est survenue lors de la récupération des détails du parent'
      }
    }
  }

  log(): ActivityType {
    return ActivityType.GET_PARENT
  }
}
