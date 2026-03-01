import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { z } from 'zod'
import { SUPER_ADMINS } from '../config/auth.config'
import { ActivityLogRepository } from '../repositories/activity-log.repository'

export class AdminActivityLogController {
  public controller: OpenAPIHono
  private activityLogRepository: ActivityLogRepository

  constructor() {
    this.controller = new OpenAPIHono()
    this.activityLogRepository = new ActivityLogRepository()
    this.initRoutes()
  }

  public initRoutes() {
    // Endpoint pour les valeurs de filtres (dropdowns)
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/activity-logs/filters',
        tags: ['ActivityLogs'],
        summary: 'Get filter values for activity logs',
        responses: {
          200: {
            description: 'Filter values',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    actions: z.array(z.string()),
                    resources: z.array(z.string()),
                    statuses: z.array(z.string()),
                    roles: z.array(z.string())
                  })
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const [actions, resources, statuses, roles] = await Promise.all([
            this.activityLogRepository.getDistinctActions(),
            this.activityLogRepository.getDistinctResources(),
            this.activityLogRepository.getDistinctStatuses(),
            this.activityLogRepository.getDistinctRoles()
          ])
          return c.json({ success: true, data: { actions, resources, statuses, roles } })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/activity-logs',
        tags: ['ActivityLogs'],
        summary: 'List activity logs with filters',
        request: {
          query: z.object({
            search: z
              .string()
              .optional()
              .describe('Recherche texte (nom, action, ressource)')
              .openapi({ example: 'admin' }),
            userStatus: z.string().optional().describe('Rôle utilisateur').openapi({ example: 'admin' }),
            activityType: z.string().optional().describe("Type d'activité").openapi({ example: 'CREATE' }),
            action: z.string().optional().describe('Action précise').openapi({ example: 'CREATE_MODULE' }),
            result: z.string().optional().describe("Statut de l'activité").openapi({ example: 'success' }),
            page: z.string().optional().describe('Page de pagination').openapi({ example: '1' }),
            limit: z.string().optional().describe('Limite de résultats par page').openapi({ example: '20' })
          })
        },
        responses: {
          200: {
            description: 'List of activity logs',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean(),
                  data: z.object({
                    items: z.array(
                      z.object({
                        id: z.string(),
                        timestamp: z.string(),
                        action: z.string(),
                        resource: z.string().nullable(),
                        resourceId: z.string().nullable(),
                        status: z.string(),
                        ipAddress: z.string().nullable(),
                        userId: z.string(),
                        firstname: z.string(),
                        lastname: z.string(),
                        role: z.string()
                      })
                    ),
                    total: z.number(),
                    page: z.number(),
                    limit: z.number(),
                    totalPages: z.number()
                  })
                })
              }
            }
          }
        }
      }),
      async (c: any) => {
        try {
          const { search, userStatus, activityType, action, result, page, limit } = c.req.valid('query')
          const logs = await this.activityLogRepository.search({
            search,
            userStatus,
            activityType,
            action,
            result,
            page: page ? Number.parseInt(page, 10) : 1,
            limit: limit ? Number.parseInt(limit, 10) : 20
          })
          const newItems = logs.items.map((item) => {
            if (SUPER_ADMINS.some((admin) => admin.email === item.email)) {
              item.role = 'super_admin'
            }
            return {
              ...item,
              role: item.role === 'user' ? 'parent' : item.role,
              timestamp:
                typeof item.timestamp === 'string'
                  ? item.timestamp
                  : item.timestamp instanceof Date
                    ? item.timestamp.toISOString()
                    : typeof item.timestamp === 'number' || typeof item.timestamp === 'string'
                      ? new Date(item.timestamp).toISOString()
                      : ''
            }
          })
          return c.json({ success: true, data: { ...logs, items: newItems } })
        } catch (error: any) {
          return c.json({ success: false, error: error.message }, 400)
        }
      }
    )
  }
}
