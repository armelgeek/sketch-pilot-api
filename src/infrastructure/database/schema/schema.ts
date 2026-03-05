import { boolean, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import type { Action, Subject } from '../../../domain/types/permission.type'
import { subscriptionPlans } from './subscription-plan.schema'

export const systemConfig = pgTable('system_config', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull()
})

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  firstname: text('firstname'),
  lastname: text('lastname'),
  email: text('email').notNull().unique(),
  lastLoginAt: timestamp('last_login_at'),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),
  role: text('role').notNull().default('user'),
  banned: boolean('banned').notNull().default(false),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires'),
  isAdmin: boolean('is_admin').notNull().default(false),
  isTrialActive: boolean('is_trial_active').notNull().default(false),
  hasTrialUsed: boolean('has_trial_used').notNull().default(false),
  trialCanceled: boolean('trial_canceled').notNull().default(false),
  trialStartDate: timestamp('trial_start_date'),
  trialEndDate: timestamp('trial_end_date'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  planId: text('plan_id').references(() => subscriptionPlans.id),
  stripeCurrentPeriodEnd: timestamp('stripe_current_period_end'),
  subscriptionInterval: text('subscription_interval'),
  lastTrialReminderDate: timestamp('last_trial_reminder_date'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull()
})

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  impersonatedBy: text('impersonated_by').references(() => users.id)
})

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull()
})

export const verifications = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
})

export const avatars = pgTable('avatars', {
  id: text('id').primaryKey(),
  image: text('image').notNull()
})

export const roles = pgTable('roles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull()
})

export const roleResources = pgTable('role_resources', {
  id: text('id').primaryKey(),
  roleId: text('role_id')
    .notNull()
    .references(() => roles.id, { onDelete: 'cascade' }),
  resourceType: text('resource_type').notNull().$type<Subject>(),
  actions: jsonb('actions').notNull().$type<Action[]>(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull()
})

export const userRoles = pgTable('user_roles', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  roleId: text('role_id')
    .notNull()
    .references(() => roles.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull()
})

export const subscriptionHistory = pgTable('subscription_history', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  oldPlan: text('old_plan'),
  newPlan: text('new_plan'),
  amount: text('amount'),
  currency: text('currency'),
  adjustmentType: text('adjustment_type'),
  status: text('status').notNull(),
  stripeInvoiceUrl: text('stripe_invoice_url'),
  interval: text('interval'),
  timestamp: timestamp('timestamp').notNull().defaultNow()
})
