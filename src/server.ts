import { App } from './app'
import {
  AdminActivityLogController,
  AdminBackupController,
  AdminGameController,
  AdminLessonController,
  AdminLessonGameOrderController,
  AdminModuleController,
  AdminModuleOrderController,
  AdminStatsController,
  AssistantController,
  AvatarController,
  ChildController,
  ChildProgressController,
  EmailCheckController,
  GameController,
  GameSessionController,
  PermissionController,
  SubscriptionController,
  SystemConfigController,
  UserController
} from './infrastructure/controllers'
import { AuthController } from './infrastructure/controllers/auth.controller'
import { SubscriptionPlanController } from './infrastructure/controllers/subscription-plan.controller'
import '@/infrastructure/schedulers'

const app = new App([
  new UserController(),
  new AuthController(),
  new ChildController(),
  new AvatarController(),
  new PermissionController(),
  new AdminModuleOrderController(),
  new AdminModuleController(),
  new AdminLessonController(),
  new AdminGameController(),
  new GameController(),
  new AdminActivityLogController(),
  new ChildProgressController(),
  new GameSessionController(),
  new EmailCheckController(),
  new AdminStatsController(),
  new AdminLessonGameOrderController(),
  new SubscriptionController(),
  new SubscriptionPlanController(),
  new SystemConfigController(),
  new AdminBackupController(),
  new AssistantController()
]).getApp()

const PORT = Bun.env.PORT || 3000

console.info(`
\u001B[34m╔══════════════════════════════════════════════════════╗
║               \u001B[1mMEKO ACADEMY API\u001B[0m\u001B[34m                ║
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
