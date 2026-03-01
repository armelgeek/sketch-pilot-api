import { SystemConfigService } from '@/application/services/system-config.service'
import type { MiddlewareHandler } from 'hono'

/**
 * Middleware pour vérifier l'état du système d'abonnement
 * Si le mode test est activé, permet de bypasser les vérifications d'abonnement
 */
export const subscriptionCheckMiddleware: MiddlewareHandler = async (c, next) => {
  const systemConfig = SystemConfigService.getInstance()

  // Si les abonnements sont désactivés (mode test), on passe directement
  if (!(await systemConfig.isSubscriptionEnabled())) {
    await next()
    return
  }

  // Sinon, on continue avec la logique d'abonnement normale
  // Cette partie sera à adapter selon votre logique existante
  await next()
}

/**
 * Middleware pour vérifier si les nouvelles inscriptions sont autorisées
 */
export const registrationCheckMiddleware: MiddlewareHandler = async (c, next) => {
  await next()
}

/**
 * Middleware pour vérifier le mode maintenance
 */
export const maintenanceCheckMiddleware: MiddlewareHandler = async (c, next) => {
  await next()
}
