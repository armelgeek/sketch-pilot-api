/**
 * EmailNotificationService
 * -------------------------
 * Listens to application events emitted by the EventBus and enqueues
 * the appropriate email jobs in the BullMQ email queue.
 *
 * Business rules:
 *  - user.created        → welcome (immediate) + onboarding1/2/3 (day 1/2/3 delay)
 *  - user.generated_video (videoCount === 1) → push_volume (immediate)
 *  - user.credits_low    → credits_low (immediate)
 *  - user.trial_started  → trial (immediate)
 *  - user.trial_ending   → trial_ending (immediate)
 *  - user.inactive       → inactive (immediate, caller decides cadence)
 *
 * Activation nudge (no video after 24 h) and re-engagement cadence
 * (J+3 / J+7 / J+14) are driven by the EmailScheduler cron jobs rather
 * than individual events, because they require a DB scan over all users.
 */

import { type EventPayload, eventBus } from '@/domain/events/event-bus'
import { type EmailJobData, getEmailQueue } from '@/infrastructure/config/email-queue.config'

const DAY_MS = 24 * 60 * 60 * 1000

type VideoEventPayload = EventPayload & { videoCount?: number }
type CreditsEventPayload = EventPayload & { creditsLeft?: number }
type TrialEventPayload = EventPayload & { daysLeft?: number }
type InactiveEventPayload = EventPayload & { daysSinceActive?: number }

async function enqueue(jobData: EmailJobData, opts: { delay?: number } = {}): Promise<void> {
  try {
    const queue = getEmailQueue()
    await queue.add(`${jobData.template}:${jobData.userId}`, jobData, {
      delay: opts.delay,
      jobId: `${jobData.template}:${jobData.userId}:${Date.now()}`
    })
  } catch (err) {
    console.error(`[EmailNotificationService] Failed to enqueue "${jobData.template}" for user ${jobData.userId}:`, err)
  }
}

export function registerEmailEventListeners(): void {
  // ── user.created ─────────────────────────────────────────────────────────
  eventBus.on<EventPayload>('user.created', async (payload) => {
    const base: Omit<EmailJobData, 'template'> = {
      userId: payload.userId,
      userEmail: payload.userEmail,
      userName: payload.userName
    }

    // J0 — Welcome (immediate)
    await enqueue({ ...base, template: 'welcome' })

    // J1 — Onboarding: styles (1 day)
    await enqueue({ ...base, template: 'onboarding1' }, { delay: DAY_MS })

    // J2 — Onboarding: viral structure (2 days)
    await enqueue({ ...base, template: 'onboarding2' }, { delay: 2 * DAY_MS })

    // J3 — Onboarding: distribution (3 days)
    await enqueue({ ...base, template: 'onboarding3' }, { delay: 3 * DAY_MS })
  })

  // ── user.generated_video ─────────────────────────────────────────────────
  eventBus.on<VideoEventPayload>('user.generated_video', async (payload) => {
    if (payload.videoCount === 1) {
      // First video ever → push to generate more
      await enqueue({
        userId: payload.userId,
        userEmail: payload.userEmail,
        userName: payload.userName,
        template: 'push_volume'
      })
    }
  })

  // ── user.credits_low ─────────────────────────────────────────────────────
  eventBus.on<CreditsEventPayload>('user.credits_low', async (payload) => {
    await enqueue({
      userId: payload.userId,
      userEmail: payload.userEmail,
      userName: payload.userName,
      template: 'credits_low',
      data: { creditsLeft: payload.creditsLeft ?? 1 }
    })
  })

  // ── user.trial_started ───────────────────────────────────────────────────
  eventBus.on<EventPayload>('user.trial_started', async (payload) => {
    await enqueue({
      userId: payload.userId,
      userEmail: payload.userEmail,
      userName: payload.userName,
      template: 'trial_started'
    })
  })

  // ── user.trial_ending ────────────────────────────────────────────────────
  eventBus.on<TrialEventPayload>('user.trial_ending', async (payload) => {
    await enqueue({
      userId: payload.userId,
      userEmail: payload.userEmail,
      userName: payload.userName,
      template: 'trial_ending',
      data: { daysLeft: payload.daysLeft ?? 3 }
    })
  })

  // ── user.inactive ────────────────────────────────────────────────────────
  eventBus.on<InactiveEventPayload>('user.inactive', async (payload) => {
    await enqueue({
      userId: payload.userId,
      userEmail: payload.userEmail,
      userName: payload.userName,
      template: 'inactive',
      data: { daysSinceActive: payload.daysSinceActive ?? 3 }
    })
  })

  console.info('[EmailNotificationService] Email event listeners registered')
}
