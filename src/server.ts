import process from 'node:process'
import { startVideoGenerationWorker } from '@/infrastructure/workers/video-generation.worker'
import { startEmailWorker } from '@/infrastructure/workers/email.worker'

import { App } from './app'
import {
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
import { CharacterModelController } from './infrastructure/controllers/character-model.controller'
import './utils/polyfills'
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

let emailWorker: any = null
if (process.env.ENABLE_EMAIL_WORKER !== 'false') {
  try {
    emailWorker = startEmailWorker()
  } catch (error) {
    console.warn('[Server] Email worker could not start (Redis may not be available):', error)
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
  if (emailWorker) {
    try {
      await emailWorker.close()
      console.info('[Server] Email worker closed successfully.')
    } catch (error) {
      console.error('[Server] Error closing email worker:', error)
    }
  }
  process.exit(0)
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

const PORT = Bun.env.PORT || 5000

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
