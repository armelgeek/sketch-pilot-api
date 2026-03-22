// Trial and subscription expiry are handled by the @better-auth/stripe plugin.
// Email-related cron jobs (activation nudge, re-engagement, newsletter, etc.)
// are managed by the EmailScheduler below.
import { startEmailScheduler } from './email.scheduler'
import { registerEmailEventListeners } from '@/application/services/email-notification.service'

registerEmailEventListeners()
startEmailScheduler()
