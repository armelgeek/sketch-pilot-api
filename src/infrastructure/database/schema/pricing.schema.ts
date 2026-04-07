import { boolean, integer, jsonb, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const subscriptionPlans = pgTable('subscription_plans', {
  id: text('id').primaryKey(), // matches plan id or stripe product id
  name: text('name').notNull(),
  description: text('description'),
  monthlyLimit: integer('monthly_limit').notNull().default(0), // -1 for unlimited
  priceMonthlyId: text('price_monthly_id'), // Stripe price ID
  priceYearlyId: text('price_yearly_id'), // Stripe price ID
  priceMonthlyAmount: numeric('price_monthly_amount', { precision: 10, scale: 2 }),
  priceYearlyAmount: numeric('price_yearly_amount', { precision: 10, scale: 2 }),
  currency: text('currency').default('usd'),
  isDefault: boolean('is_default').notNull().default(false),
  isFeatured: boolean('is_featured').notNull().default(false),
  features: jsonb('features').$type<string[]>(), // Array of feature strings
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

export const creditPacks = pgTable('credit_packs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  credits: integer('credits').notNull(),
  priceAmount: numeric('price_amount', { precision: 10, scale: 2 }),
  currency: text('currency').default('usd'),
  stripePriceId: text('stripe_price_id').notNull(),
  isFeatured: boolean('is_featured').notNull().default(false),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})
