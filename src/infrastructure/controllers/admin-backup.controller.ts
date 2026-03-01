import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { BackupDatabaseService } from '@/application/services/backup-database.service'
import { RestoreDatabaseService } from '@/application/services/restore-database.service'
import type { Routes } from '@/domain/types'

export class AdminBackupController implements Routes {
  public controller: OpenAPIHono
  private backupService: BackupDatabaseService
  private restoreService: RestoreDatabaseService

  constructor() {
    this.controller = new OpenAPIHono()
    this.backupService = new BackupDatabaseService()
    this.restoreService = new RestoreDatabaseService()
    this.initRoutes()
  }

  public initRoutes() {
    // Endpoint GET: backup
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/v1/admin/backup',
        tags: ['Backup'],
        summary: 'Télécharger un backup complet de la base (JSON)',
        responses: {
          200: {
            description: 'Backup JSON',
            content: {
              'application/json': {
                schema: z.any()
              }
            }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (user && user.role === 'admin') {
          const data = await this.backupService.getFullBackup()
          const filename = `meko-backup-${new Date().toISOString().replaceAll(':', '-')}.json`
          c.header('Content-Disposition', `attachment; filename=${filename}`)
          return c.json(data)
        }
        return c.json({ error: 'Forbidden' }, 403)
      }
    )

    // Endpoint POST: restore
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/v1/admin/restore',
        tags: ['Backup'],
        summary: "Restaurer la base de données à partir d'un backup JSON",
        request: {
          body: {
            content: {
              'application/json': {
                schema: z.object({}).passthrough()
              },
              'multipart/form-data': {
                schema: z.object({
                  file: z.any()
                })
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Restauration terminée',
            content: {
              'application/json': {
                schema: z.object({ success: z.boolean() })
              }
            }
          },
          400: {
            description: 'Erreur',
            content: {
              'application/json': {
                schema: z.object({ error: z.string() })
              }
            }
          }
        }
      }),
      async (c: any) => {
        const user = c.get('user')
        if (!user || user.role !== 'admin') {
          return c.status(403).json({ error: 'Forbidden' })
        }
        let backup
        // Supporte JSON direct ou upload multipart
        if (c.req.header('content-type')?.includes('multipart')) {
          const body = await c.req.parseBody()
          if (!body.file) return c.json({ error: 'Aucun fichier fourni' }, 400)
          const text = await body.file.text()
          try {
            backup = JSON.parse(text)
          } catch {
            return c.json({ error: 'Fichier JSON invalide' }, 400)
          }
        } else {
          try {
            backup = await c.req.json()
          } catch {
            return c.json({ error: 'Body JSON invalide' }, 400)
          }
        }
        try {
          const result = await this.restoreService.restoreFromBackup(backup)
          return c.json(result)
        } catch (error: any) {
          return c.json({ error: error.message }, 400)
        }
      }
    )
  }
}
