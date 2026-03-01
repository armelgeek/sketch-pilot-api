import { serveStatic } from '@hono/node-server/serve-static'
import { OpenAPIHono } from '@hono/zod-openapi'
import { apiReference } from '@scalar/hono-api-reference'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import router, { type auth } from './infrastructure/config/auth.config'
import { errorHandler, notFound } from './infrastructure/middlewares/error.middleware'
import { responseMiddleware } from './infrastructure/middlewares/response.middleware'
import addSession from './infrastructure/middlewares/session.middleware'
import sessionValidator from './infrastructure/middlewares/unauthorized-access.middleware'
import { Home } from './infrastructure/pages/home'
import { VerificationCodeRepository } from './infrastructure/repositories/verification-code.repository'
import { CleanupVerificationCodesScheduler } from './infrastructure/schedulers/cleanup-verification-codes.scheduler'
import { createActivityLogsIndexes } from './infrastructure/services/create-activity-logs-indexes.service'
import { initSystemConfig } from './infrastructure/services/init-system-config.service'
import { patchSuperAdminToAdmin } from './infrastructure/services/patch-super-admin-to-admin.service'
import type { Routes } from './domain/types'

export class App {
  private app: OpenAPIHono<{
    Variables: {
      user: typeof auth.$Infer.Session.user | null
      session: typeof auth.$Infer.Session.session | null
    }
  }>

  constructor(routes: Routes[]) {
    // Patch automatique du rôle super_admin -> admin
    patchSuperAdminToAdmin().then((patchRes) => {
      if (patchRes.success) {
        console.info('Patch super_admin -> admin appliqué')
      } else {
        console.error('Erreur patch super_admin -> admin:', patchRes.error)
      }
      // Initialisation de la configuration système (une seule fois)
      initSystemConfig().then((res) => {
        if (res.success) {
          console.info('System config initialized')
        } else {
          console.error('System config init error:', res.error)
        }
        createActivityLogsIndexes()
      })
    })
    // Log temporaire pour debug
    console.info('Environment variables:', {
      NODE_ENV: Bun.env.NODE_ENV,
      SMTP_HOST: Bun.env.SMTP_HOST,
      EMAIL_FROM: Bun.env.EMAIL_FROM,
      SUBSCRIPTION_ACTION_URL: Bun.env.SUBSCRIPTION_ACTION_URL
    })

    this.app = new OpenAPIHono<{
      Variables: {
        user: typeof auth.$Infer.Session.user | null
        session: typeof auth.$Infer.Session.session | null
      }
    }>()
    this.initializeGlobalMiddlewares()
    this.initializeRoutes(routes)
    this.initializeSwaggerUI()
    this.initializeRouteFallback()
    this.initializeErrorHandler()
  }

  private initializeRoutes(routes: Routes[]) {
    routes.forEach((route) => {
      route.initRoutes()
      this.app.route('/api', route.controller)
    })
    this.app.basePath('/api').route('/', router)
    this.app.route('/', Home)
  }

  private initializeGlobalMiddlewares() {
    // Servir les fichiers statiques du dossier uploads
    this.app.use('/uploads/*', serveStatic({ root: './' }))

    this.app.use(logger())
    this.app.use(prettyJSON())

    // Timeout spécial pour les uploads de jeux (5 minutes)
    this.app.use('/api/v1/admin/lessons/*/games', async (c, next) => {
      const timeoutId = setTimeout(
        () => {
          console.error('[TIMEOUT] Upload de jeu timeout après 5 minutes')
        },
        5 * 60 * 1000
      ) // 5 minutes

      try {
        await next()
      } finally {
        clearTimeout(timeoutId)
      }
    })

    this.app.use(
      '*',
      cors({
        origin:
          Bun.env.NODE_ENV === 'production'
            ? ['https://dev-api.meko.ac', 'https://dev.meko.ac', 'https://dev.bo.meko.ac', 'http://localhost:5173']
            : [Bun.env.BETTER_AUTH_URL || 'http://localhost:3000', Bun.env.REACT_APP_URL || 'http://localhost:5173'],
        credentials: true,
        maxAge: 86400
      })
    )
    this.app.use('*', responseMiddleware())
    this.app.use(addSession)
    this.app.use('*', (c, next) => {
      // Exclure /api/v1/subscription-plans (GET) du middleware d'authentification
      if (c.req.method === 'GET' && c.req.path === '/api/v1/subscription-plans') {
        return next()
      }
      // Ne jamais appliquer de check d'authentification sur /v1/auth/check-email (GET ou POST)
      if ((c.req.method === 'GET' || c.req.method === 'POST') && c.req.path === '/api/v1/auth/check-email') {
        return next()
      }
      if (c.req.method === 'POST' || c.req.path.startsWith('/api/v1/auth/verify-otp')) {
        return next()
      }
      return sessionValidator(c, next)
    })
  }

  private initializeSwaggerUI() {
    this.app.doc31('/swagger', () => {
      const protocol = 'https:'
      const hostname = Bun.env.NODE_ENV === 'production' ? 'dev-api.meko.ac' : 'localhost'
      const port = Bun.env.NODE_ENV === 'production' ? '' : ':3000'

      return {
        openapi: '3.1.0',

        info: {
          version: '1.0.0',
          title: 'Meko Academy API',
          description: `# Introduction 
        \n Meko Academy API . \n`
        },
        servers: [{ url: `${protocol}//${hostname}${port ? `:${port}` : ''}`, description: 'Current environment' }]
      }
    })

    this.app.get(
      '/docs',
      apiReference({
        pageTitle: 'Meko Academy API Documentation',
        theme: 'deepSpace',
        isEditable: false,
        layout: 'modern',
        darkMode: true,
        metaData: {
          applicationName: 'Meko Academy API',
          author: 'Armel Wanes',
          creator: 'Armel Wanes',
          publisher: 'Armel Wanes',
          robots: 'index, follow',
          description: 'Meko Academy API is ....'
        },
        url: Bun.env.NODE_ENV === 'production' ? 'https://dev-api.meko.ac/swagger' : 'http://localhost:3000/swagger'
      })
    )
  }

  private initializeRouteFallback() {
    this.app.notFound((ctx) => {
      return ctx.json({ success: false, message: 'route not found' }, 404)
    })
  }

  private initializeErrorHandler() {
    this.app.notFound(notFound)
    this.app.onError(errorHandler)
  }

  public getApp() {
    return this.app
  }
}

// Schedule cleanup of expired verification codes (every hour)
const cleanupVerificationCodesScheduler = new CleanupVerificationCodesScheduler(new VerificationCodeRepository())

setInterval(
  () => {
    cleanupVerificationCodesScheduler.run()
  },
  60 * 60 * 1000
) // Run every hour
