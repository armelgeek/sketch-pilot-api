import { SystemConfigService } from '@/application/services/system-config.service'
import { CheckTrialStatusUseCase } from '@/application/use-cases/subscription/check-trial-status.use-case'
import { GetUserSubscriptionByUserUseCase } from '@/application/use-cases/subscription/get-subscription-by-user.use-case'
import type { Context, Next } from 'hono'

export const checkTrialStatus = async (c: Context, next: Next) => {
  const user = c.get('user')
  const ipAddress =
    c.req.header('x-forwarded-for') ||
    c.req.header('x-real-ip') ||
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-client-ip') ||
    c.req.header('x-remote-addr') ||
    c.req.header('remote-addr') ||
    undefined
  if (user) {
    const checkTrialStatusUseCase = new CheckTrialStatusUseCase()
    await checkTrialStatusUseCase.run({
      userId: user.id,
      currentUserId: user.id,
      ipAddress
    })
  }

  await next()
}

export const requireActiveSubscription = async (c: Context, next: Next) => {
  const systemConfig = SystemConfigService.getInstance()

  // Si le système d'abonnement est désactivé (mode test), on passe
  if (!(await systemConfig.isSubscriptionEnabled())) {
    console.info("🧪 Mode test actif - Vérification d'abonnement ignorée")
    await next()
    return
  }

  const user = c.get('user')

  if (!user) {
    return c.json({ success: false, error: 'Unauthorized' }, 401)
  }
  const ipAddress =
    c.req.header('x-forwarded-for') ||
    c.req.header('x-real-ip') ||
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-client-ip') ||
    c.req.header('x-remote-addr') ||
    c.req.header('remote-addr') ||
    undefined
  try {
    const getUserSubscriptionByUserUseCase = new GetUserSubscriptionByUserUseCase()
    await getUserSubscriptionByUserUseCase.run({
      userId: user.id,
      currentUserId: user.id,
      ipAddress
    })
  } catch {
    return c.json(
      {
        success: false,
        error: 'Active subscription required',
        needsSubscription: true
      },
      403
    )
  }

  await next()
}

export default { checkTrialStatus, requireActiveSubscription }
