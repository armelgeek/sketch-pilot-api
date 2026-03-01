import { boolean, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const subscriptionPlans = pgTable('subscription_plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  childLimit: numeric('child_limit', { precision: 4, scale: 0 }),
  priceMonthly: numeric('price_monthly', { precision: 10, scale: 2 }).notNull(),
  priceYearly: numeric('price_yearly', { precision: 10, scale: 2 }).notNull(),
  displayedYearly: numeric('displayed_yearly', { precision: 10, scale: 2 }).notNull(),
  displayedMonthly: numeric('displayed_monthly', { precision: 10, scale: 2 }).notNull(),
  displayedYearlyBar: numeric('displayed_yearly_bar', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').notNull(),
  stripePriceIdMonthly: text('stripe_price_id_monthly'),
  stripePriceIdYearly: text('stripe_price_id_yearly'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
})
