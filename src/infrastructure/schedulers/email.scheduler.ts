/**
 * EmailScheduler
 * ---------------
 * Periodic cron jobs that scan the database and emit events (or enqueue
 * email jobs directly) for time-based triggers that cannot be derived from
 * a single user action.
 *
 * Schedule overview:
 *  - Every day at 08:00 → activation nudge (no video in first 24 h)
 *  - Every day at 09:00 → re-engagement (inactive J+3 / J+7 / J+14)
 *  - Every day at 10:00 → trial-ending warning (≤ 3 days left)
 *  - Every Monday at 07:00 → weekly newsletter
 */

import cron from 'node-cron'
import { and, eq, lt, sql } from 'drizzle-orm'
import { db } from '@/infrastructure/database/db'
import { users, subscriptions } from '@/infrastructure/database/schema'
import { videos, userCredits } from '@/infrastructure/database/schema'
import { type EmailJobData, getEmailQueue } from '@/infrastructure/config/email-queue.config'

const LOW_CREDITS_THRESHOLD = 2

async function enqueueEmail(jobData: EmailJobData): Promise<void> {
  try {
    const queue = getEmailQueue()
    await queue.add(`${jobData.template}:${jobData.userId}`, jobData, {
      jobId: `${jobData.template}:${jobData.userId}:${new Date().toISOString().slice(0, 10)}`
    })
  } catch (err) {
    console.error(`[EmailScheduler] Failed to enqueue "${jobData.template}" for user ${jobData.userId}:`, err)
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

function daysFromNow(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}

// ── Activation nudge: users registered > 24 h ago with 0 completed videos ──

async function runActivationNudge(): Promise<void> {
  console.info('[EmailScheduler] Running activation nudge check')
  try {
    const cutoff = daysAgo(1)

    // Users created more than 24 h ago
    const candidates = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(and(lt(users.createdAt, cutoff), eq(users.isAdmin, false), eq(users.banned, false)))

    for (const user of candidates) {
      // Check if the user has any completed video
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(videos)
        .where(and(eq(videos.userId, user.id), eq(videos.status, 'completed')))

      if ((result?.count ?? 0) === 0) {
        await enqueueEmail({
          template: 'nudge',
          userId: user.id,
          userEmail: user.email,
          userName: user.name
        })
      }
    }
  } catch (err) {
    console.error('[EmailScheduler] Activation nudge error:', err)
  }
}

// ── Re-engagement: inactive users at J+3, J+7, J+14 ────────────────────────

async function runReengagement(): Promise<void> {
  console.info('[EmailScheduler] Running re-engagement check')
  try {
    const thresholds = [
      { days: 3, template: 'inactive' },
      { days: 7, template: 'inactive' },
      { days: 14, template: 'inactive' }
    ] as const

    for (const { days, template } of thresholds) {
      const upperBound = daysAgo(days)
      const lowerBound = daysAgo(days + 1)

      // Users whose lastLoginAt is exactly in the target day window
      const candidates = await db
        .select({ id: users.id, email: users.email, name: users.name, lastLoginAt: users.lastLoginAt })
        .from(users)
        .where(
          and(
            eq(users.isAdmin, false),
            eq(users.banned, false),
            sql`${users.lastLoginAt} >= ${lowerBound} AND ${users.lastLoginAt} < ${upperBound}`
          )
        )

      for (const user of candidates) {
        await enqueueEmail({
          template,
          userId: user.id,
          userEmail: user.email,
          userName: user.name,
          data: { daysSinceActive: days }
        })
      }
    }
  } catch (err) {
    console.error('[EmailScheduler] Re-engagement error:', err)
  }
}

// ── Trial ending: subscriptions expiring within 3 days ──────────────────────

async function runTrialEnding(): Promise<void> {
  console.info('[EmailScheduler] Running trial-ending check')
  try {
    const today = new Date()
    const in3Days = daysFromNow(3)

    const trialSubs = await db
      .select({
        referenceId: subscriptions.referenceId,
        trialEnd: subscriptions.trialEnd
      })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.status, 'trialing'),
          sql`${subscriptions.trialEnd} > ${today} AND ${subscriptions.trialEnd} <= ${in3Days}`
        )
      )

    for (const sub of trialSubs) {
      if (!sub.trialEnd) continue
      const msLeft = sub.trialEnd.getTime() - Date.now()
      const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000))

      // Fetch user details
      const [user] = await db
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, sub.referenceId))

      if (!user) continue

      await enqueueEmail({
        template: 'trial_ending',
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        data: { daysLeft }
      })
    }
  } catch (err) {
    console.error('[EmailScheduler] Trial-ending error:', err)
  }
}

// ── Credits low: users with very few credits ─────────────────────────────────

async function runCreditsLowCheck(): Promise<void> {
  console.info('[EmailScheduler] Running credits-low check')
  try {
    const lowCreditRows = await db
      .select({
        userId: userCredits.userId,
        extraCredits: userCredits.extraCredits,
        videosThisMonth: userCredits.videosThisMonth
      })
      .from(userCredits)
      .where(lt(userCredits.extraCredits, LOW_CREDITS_THRESHOLD))

    for (const row of lowCreditRows) {
      const [user] = await db
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(and(eq(users.id, row.userId), eq(users.isAdmin, false), eq(users.banned, false)))

      if (!user) continue

      await enqueueEmail({
        template: 'credits_low',
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        data: { creditsLeft: row.extraCredits }
      })
    }
  } catch (err) {
    console.error('[EmailScheduler] Credits-low check error:', err)
  }
}

// ── Weekly newsletter ─────────────────────────────────────────────────────────

async function runWeeklyNewsletter(): Promise<void> {
  console.info('[EmailScheduler] Running weekly newsletter')
  try {
    const activeUsers = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(and(eq(users.isAdmin, false), eq(users.banned, false), eq(users.emailVerified, true)))

    for (const user of activeUsers) {
      await enqueueEmail({
        template: 'newsletter',
        userId: user.id,
        userEmail: user.email,
        userName: user.name
      })
    }
    console.info(`[EmailScheduler] Newsletter queued for ${activeUsers.length} users`)
  } catch (err) {
    console.error('[EmailScheduler] Weekly newsletter error:', err)
  }
}

// ── Register all cron jobs ────────────────────────────────────────────────────

export function startEmailScheduler(): void {
  // Activation nudge — daily at 08:00
  cron.schedule('0 8 * * *', runActivationNudge, { timezone: 'UTC' })

  // Re-engagement — daily at 09:00
  cron.schedule('0 9 * * *', runReengagement, { timezone: 'UTC' })

  // Trial ending — daily at 10:00
  cron.schedule('0 10 * * *', runTrialEnding, { timezone: 'UTC' })

  // Credits low — daily at 11:00
  cron.schedule('0 11 * * *', runCreditsLowCheck, { timezone: 'UTC' })

  // Weekly newsletter — every Monday at 07:00
  cron.schedule('0 7 * * 1', runWeeklyNewsletter, { timezone: 'UTC' })

  console.info('[EmailScheduler] All email cron jobs registered')
}
