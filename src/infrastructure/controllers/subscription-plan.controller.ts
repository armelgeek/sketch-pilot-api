import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { z } from 'zod'
import { CreateSubscriptionPlanUseCase } from '@/application/use-cases/subscription-plan/create-subscription-plan.use-case'
import { DeleteSubscriptionPlanUseCase } from '@/application/use-cases/subscription-plan/delete-subscription-plan.use-case'
import { GetSubscriptionPlanUseCase } from '@/application/use-cases/subscription-plan/get-subscription-plan.use-case'
import { ListSubscriptionPlansUseCase } from '@/application/use-cases/subscription-plan/list-subscription-plans.use-case'
import { UpdateSubscriptionPlanUseCase } from '@/application/use-cases/subscription-plan/update-subscription-plan.use-case'
import { SubscriptionPlanSchema } from '@/domain/models/subscription-plan.model'
import { SubscriptionPlanRepository } from '@/infrastructure/repositories/subscription-plan.repository'
import type { Routes } from '@/domain/types'

export class SubscriptionPlanController implements Routes {
  public controller: OpenAPIHono
  private repository: SubscriptionPlanRepository

  constructor() {
    this.controller = new OpenAPIHono()
    this.repository = new SubscriptionPlanRepository()
    this.initRoutes()
  }

  public initRoutes() {
    //  Auth middleware uniquement pour les routes /v1/admin/subscription-plans*
    //  Aucun middleware sur /v1/subscription-plans (GET) : accès public

    // Create
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/subscription-plans',
        tags: ['SubscriptionPlans'],
        summary: 'Créer un plan d’abonnement',
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({
                  name: z.string().min(1).describe('Nom du plan (ex: Premium, Essentiel)'),
                  description: z.string().optional().describe('Description marketing du plan'),
                  childLimit: z.number().int().positive().optional().describe('Nombre maximum d’enfants inclus'),
                  priceMonthly: z.number().nonnegative().describe('Prix réel à payer par mois (ex: 29.90)'),
                  priceYearly: z.number().nonnegative().describe('Prix réel à payer par an (ex: 299)'),
                  displayedYearly: z.number().nonnegative().describe('Prix barré affiché pour 12 mois (ex: 440)'),
                  displayedMonthly: z.number().nonnegative().describe('Prix barré affiché par mois (ex: 33)'),
                  displayedYearlyBar: z.number().nonnegative().describe('Prix barré affiché par an (ex: 440)'),
                  currency: z.string().min(1).describe('Devise (ex: EUR, USD)')
                })
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Plan créé',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), data: SubscriptionPlanSchema })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const useCase = new CreateSubscriptionPlanUseCase(this.repository)
        const params = await c.req.json()
        const { result } = await useCase.run({
          ...params
        })
        if (!result.success) {
          return c.json({ success: false, data: null, error: result.error }, 200)
        }
        const data = {
          ...result.data,
          createdAt: result.data.createdAt.toISOString(),
          updatedAt: result.data.updatedAt.toISOString()
        }
        return c.json({ success: true, data }, 201)
      }
    )

    // List (admin)
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/subscription-plans',
        tags: ['SubscriptionPlans'],
        summary: 'Lister les plans',
        request: {
          query: z.object({ skip: z.string().optional(), limit: z.string().optional() })
        },
        responses: {
          200: {
            description: 'Liste des plans',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), data: z.array(SubscriptionPlanSchema) })
              }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const { skip, limit } = c.req.query()
          const useCase = new ListSubscriptionPlansUseCase(this.repository)
          const { result } = await useCase.run({
            skip: skip ? Number(skip) : 0,
            limit: limit ? Number(limit) : 20
          })
          if (!result.success) {
            return c.json({ success: false, data: [], error: result.error }, 200)
          }
          const data = result.data.map((plan) => ({
            ...plan,
            createdAt: plan.createdAt.toISOString(),
            updatedAt: plan.updatedAt.toISOString()
          }))
          return c.json({ success: true, data })
        } catch (error: any) {
          return c.json({ success: false, data: [], error: error.message }, 200)
        }
      }
    )

    // Route publique : /v1/subscription-plans (GET)
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/subscription-plans',
        tags: ['SubscriptionPlans'],
        summary: 'Lister les plans (public)',
        request: {
          query: z.object({ skip: z.string().optional(), limit: z.string().optional() })
        },
        responses: {
          200: {
            description: 'Liste des plans',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), data: z.array(SubscriptionPlanSchema) })
              }
            }
          }
        }
      }),
      async (c) => {
        // Aucun contrôle d'authentification ici
        try {
          const { skip, limit } = c.req.query()
          const useCase = new ListSubscriptionPlansUseCase(this.repository)
          const result = await useCase.execute({ skip: skip ? Number(skip) : 0, limit: limit ? Number(limit) : 20 })
          if (!result.success) {
            return c.json({ success: false, data: [], error: result.error }, 200)
          }
          const data = result.data.map((plan) => ({
            ...plan,
            createdAt: plan.createdAt.toISOString(),
            updatedAt: plan.updatedAt.toISOString()
          }))
          return c.json({ success: true, data })
        } catch (error: any) {
          return c.json({ success: false, data: [], error: error.message }, 200)
        }
      }
    )

    // Get by id
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/subscription-plans/{id}',
        tags: ['SubscriptionPlans'],
        summary: 'Obtenir un plan',
        request: {
          params: z.object({ id: z.string().uuid() })
        },
        responses: {
          200: {
            description: 'Plan trouvé',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), data: SubscriptionPlanSchema.nullable() })
              }
            }
          }
        }
      }),
      async (c) => {
        try {
          const { id } = c.req.param()
          const useCase = new GetSubscriptionPlanUseCase(this.repository)
          const result = await useCase.execute({ id })
          if (!result.success) {
            return c.json({ success: false, data: null, error: result.error }, 200)
          }
          let data = null
          if (result.data) {
            data = {
              ...result.data,
              createdAt: result.data.createdAt.toISOString(),
              updatedAt: result.data.updatedAt.toISOString()
            }
          }
          return c.json({ success: true, data })
        } catch (error: any) {
          return c.json({ success: false, data: null, error: error.message }, 200)
        }
      }
    )

    // Update
    this.controller.openapi(
      createRoute({
        method: 'put',
        path: '/v1/admin/subscription-plans/{id}',
        tags: ['SubscriptionPlans'],
        summary: 'Mettre à jour un plan',
        request: {
          params: z.object({ id: z.string().uuid() }),
          body: {
            content: {
              'application/json': {
                schema: SubscriptionPlanSchema.omit({
                  id: true,
                  createdAt: true,
                  updatedAt: true,
                  stripeIds: true
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Plan mis à jour',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean(), data: SubscriptionPlanSchema })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const { id } = c.req.param()
        const params = await c.req.json()
        const useCase = new UpdateSubscriptionPlanUseCase(this.repository)
        const { result } = await useCase.run({
          id,
          ...params
        })
        if (!result.success) {
          return c.json({ success: false, data: null, error: result.error }, 200)
        }
        const data = {
          ...result.data,
          createdAt: result.data.createdAt.toISOString(),
          updatedAt: result.data.updatedAt.toISOString()
        }
        return c.json({ success: true, data })
      }
    )

    // Delete
    this.controller.openapi(
      createRoute({
        method: 'delete',
        path: '/v1/admin/subscription-plans/{id}',
        tags: ['SubscriptionPlans'],
        summary: 'Supprimer un plan',
        request: {
          params: z.object({ id: z.string().uuid() })
        },
        responses: {
          200: {
            description: 'Plan supprimé',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean() })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const { id } = c.req.param()
        const useCase = new DeleteSubscriptionPlanUseCase(this.repository)
        const { result } = await useCase.run({
          id
        })
        if (!result.success) {
          return c.json({ success: false, data: null, error: result.error }, 200)
        }
        return c.json({ success: true })
      }
    )
  }
}
