import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Subscription table used by the @better-auth/stripe plugin.
 * This replaces the old manual subscription tracking on the users table.
 */
export const subscription = pgTable('subscription', {
  id: text('id').primaryKey(),
  plan: text('plan').notNull(),
  referenceId: text('reference_id').notNull(),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  status: text('status').notNull().default('incomplete'),
  periodStart: timestamp('period_start'),
  periodEnd: timestamp('period_end'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
  cancelAt: timestamp('cancel_at'),
  canceledAt: timestamp('canceled_at'),
  endedAt: timestamp('ended_at'),
  seats: integer('seats'),
  billingInterval: text('billing_interval'),
  trialStart: timestamp('trial_start'),
  trialEnd: timestamp('trial_end'),
  stripeScheduleId: text('stripe_schedule_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})
