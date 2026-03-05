import { App } from './app'
import {
  EmailCheckController,
  SubscriptionController,
  UserController,
  CreditsController,
  VideosController,
  ScriptsController,
  ConfigController,
  VideoAdminController
} from './infrastructure/controllers'
import { AuthController } from './infrastructure/controllers/auth.controller'
import { SubscriptionPlanController } from './infrastructure/controllers/subscription-plan.controller'
import '@/infrastructure/schedulers'
import { startVideoGenerationWorker } from '@/infrastructure/workers/video-generation.worker'

const app = new App([
  new UserController(),
  new AuthController(),
  new EmailCheckController(),
  new SubscriptionController(),
  new SubscriptionPlanController(),
  new CreditsController(),
  new VideosController(),
  new ScriptsController(),
  new ConfigController(),
  new VideoAdminController()
]).getApp()

if (process.env.ENABLE_VIDEO_WORKER !== 'false') {
  try {
    startVideoGenerationWorker()
  } catch (err) {
    console.warn('[Server] Video worker could not start (Redis may not be available):', err)
  }
}

const PORT = Bun.env.PORT || 3000

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
