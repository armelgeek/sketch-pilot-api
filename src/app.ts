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
import type { Routes } from './domain/types'

export class App {
  private app: OpenAPIHono<{
    Variables: {
      user: typeof auth.$Infer.Session.user | null
      session: typeof auth.$Infer.Session.session | null
    }
  }>

  constructor(routes: Routes[]) {
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
    this.app.use('/uploads/*', serveStatic({ root: './' }))

    this.app.use(logger())
    this.app.use(prettyJSON())

    this.app.use(
      '*',
      cors({
        origin:
          Bun.env.NODE_ENV === 'production'
            ? [Bun.env.PRODUCTION_URL || 'http://localhost:5000', Bun.env.REACT_APP_URL || 'http://localhost:5173']
            : [Bun.env.BETTER_AUTH_URL || 'http://localhost:5000', Bun.env.REACT_APP_URL || 'http://localhost:5173'],
        credentials: true,
        maxAge: 86400
      })
    )
    this.app.use('*', responseMiddleware())
    this.app.use(addSession)
    this.app.use('*', (c, next) => {
      // Allow public access to config endpoints
      if (c.req.method === 'GET' && c.req.path.startsWith('/api/v1/config/')) {
        return next()
      }
      // Allow public read access to active prompts
      if (c.req.method === 'GET' && c.req.path === '/api/v1/prompts') {
        return next()
      }
      // Allow public read access to character models list
      if (c.req.method === 'GET' && c.req.path === '/api/v1/character-models') {
        return next()
      }
      // Allow email check without authentication
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
    const apiTitle = 'API'

    this.app.doc31('/swagger', () => {
      const protocol = 'https:'
      const hostname = Bun.env.NODE_ENV === 'production' ? Bun.env.PRODUCTION_HOST || 'localhost' : 'localhost'
      const port = Bun.env.NODE_ENV === 'production' ? '' : ':5000'

      return {
        openapi: '3.1.0',
        info: {
          version: '1.0.0',
          title: apiTitle,
          description: `# Introduction \n API Documentation.\n`
        },
        servers: [{ url: `${protocol}//${hostname}${port ? `:${port}` : ''}`, description: 'Current environment' }]
      }
    })

    this.app.get(
      '/docs',
      apiReference({
        pageTitle: `${apiTitle} Documentation`,
        theme: 'deepSpace',
        isEditable: false,
        layout: 'modern',
        darkMode: true,
        url:
          Bun.env.NODE_ENV === 'production'
            ? `https://${Bun.env.PRODUCTION_HOST || 'localhost'}/swagger`
            : 'http://localhost:5000/swagger'
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
