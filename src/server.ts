import process from 'node:process'
import { serve } from '@hono/node-server'
import { startVideoGenerationWorker } from '@/infrastructure/workers/video-generation.worker'

import { App } from './app'
import {
  CharacterModelController,
  ConfigController,
  CreditsController,
  EmailCheckController,
  PromptController,
  ScriptsController,
  UserController,
  VideoAdminController,
  VideosController
} from './infrastructure/controllers'
import { AuthController } from './infrastructure/controllers/auth.controller'
import '@/infrastructure/schedulers'

const app = new App([
  new UserController(),
  new AuthController(),
  new EmailCheckController(),
  new CreditsController(),
  new VideosController(),
  new ScriptsController(),
  new ConfigController(),
  new VideoAdminController(),
  new PromptController(),
  new CharacterModelController()
]).getApp()

let videoWorker: any = null
if (process.env.ENABLE_VIDEO_WORKER !== 'false') {
  try {
    videoWorker = startVideoGenerationWorker()
  } catch (error) {
    console.warn('[Server] Video worker could not start (Redis may not be available):', error)
  }
}

// Handle graceful shutdown for workers
const gracefulShutdown = async (signal: string) => {
  console.info(`\n[Server] Received ${signal}, shutting down gracefully...`)
  if (videoWorker) {
    try {
      await videoWorker.close()
      console.info('[Server] Video worker closed successfully.')
    } catch (error) {
      console.error('[Server] Error closing video worker:', error)
    }
  }
  process.exit(0)
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

const PORT = process.env.PORT || 5000

console.info(`
\u001B[34m╔══════════════════════════════════════════════════════╗
║                  \u001B[1mAPI SERVER\u001B[0m\u001B[34m                       ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  \u001B[0m🚀 Server started successfully                   \u001B[34m║
║  \u001B[0m📡 Listening on: \u001B[36mhttp://localhost:${PORT}\u001B[34m        ║
║  \u001B[0m📚 API Docs: \u001B[36mhttp://localhost:${PORT}/docs\u001B[34m    ║
║  \u001B[0m📚 Auth Docs: \u001B[36mhttp://localhost:${PORT}/api/auth/reference\u001B[34m  ║
║                                                      ║
╚══════════════════════════════════════════════════════╝\u001B[0m
`)

export default app

serve({
  fetch: app.fetch,
  port: Number(PORT)
})
