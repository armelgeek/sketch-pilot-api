import process from 'node:process'

import { stripe as stripePlugin } from '@better-auth/stripe'
import { betterAuth, type User } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin, openAPI } from 'better-auth/plugins'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import Stripe from 'stripe'
import { db } from '../database/db'
import * as schema from '../database/schema'
import { CreditsRepository } from '../repositories/credits.repository'
import { ac, adminRole, userRole } from './access-control.config'
import { sendChangeEmailVerification, sendResetPasswordEmail, sendVerificationEmail } from './mail.config'

const creditsRepository = new CreditsRepository()

const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-11-17.clover' as any
})

export const auth = betterAuth({
  plugins: [
    openAPI(),
    stripePlugin({
      stripeClient,
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
      createCustomerOnSignUp: true,
      subscription: {
        enabled: true,
        plans: [
          {
            name: 'plan_starter',
            priceId: process.env.STRIPE_PRICE_STARTER_MONTHLY || 'price_starter_monthly',
            annualDiscountPriceId: process.env.STRIPE_PRICE_STARTER_YEARLY || 'price_starter_yearly'
          },
          {
            name: 'creator',
            priceId: process.env.STRIPE_PRICE_CREATOR_MONTHLY || 'price_creator_monthly',
            annualDiscountPriceId: process.env.STRIPE_PRICE_CREATOR_YEARLY || 'price_creator_yearly'
          }
        ],

        requireEmailVerification: false
      },
      onEvent: async (event: Stripe.Event) => {
        console.info(`[Stripe Webhook] Received event: ${event.type}`)

        if (event.type === 'checkout.session.completed') {
          const session = event.data.object as Stripe.Checkout.Session
          console.info(`[Stripe Webhook] Checkout session completed: ${session.id}`, {
            mode: session.mode,
            type: session.metadata?.type,
            userId: session.metadata?.userId
          })

          if (session.mode === 'payment' && session.metadata?.type === 'credit_topup') {
            const userId = session.metadata.userId
            const credits = Number.parseInt(session.metadata.creditsAmount || '0', 10)

            if (userId && credits > 0) {
              console.info(`[Stripe Webhook] Processing credit topup for user ${userId}: ${credits} credits`)

              try {
                await creditsRepository.addExtraCredits(userId, credits)
                await creditsRepository.addTransaction({
                  userId,
                  type: 'topup',
                  amount: credits,
                  price: session.amount_total ? String(session.amount_total / 100) : null,
                  currency: session.currency || 'usd',
                  stripeSessionId: session.id,
                  packId: session.metadata.packId
                })
                console.info(`[Stripe Webhook] Successfully fulfilled credit topup for user ${userId}`)
              } catch (error) {
                console.error('[Stripe Webhook] Error fulfilling credits in database:', error)
              }
            } else {
              console.warn('[Stripe Webhook] Invalid userId or creditsAmount in metadata', session.metadata)
            }
          }
        }
      }
    }) as any,
    admin({
      adminRoles: ['admin'],
      ac,
      roles: { admin: adminRole, user: userRole },
      impersonationSessionDuration: 60 * 60 * 24
    })
  ],
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:5000',
  trustedOrigins:
    process.env.NODE_ENV === 'production'
      ? [process.env.PRODUCTION_URL || 'http://localhost:3000', process.env.REACT_APP_URL || 'http://localhost:5173']
      : [process.env.BETTER_AUTH_URL || 'http://localhost:3000', process.env.REACT_APP_URL || 'http://localhost:5173'],
  user: {
    modelName: 'users',
    additionalFields: {
      firstname: { type: 'string' },
      lastname: { type: 'string' },
      isAdmin: { type: 'boolean' },
      lastLoginAt: { type: 'date' },
      role: { type: 'string' },
      banned: { type: 'boolean' },
      banReason: { type: 'string' },
      banExpires: { type: 'date' },
      stripeCustomerId: { type: 'string' }
    },
    changeEmail: {
      enabled: true,
      sendChangeEmailVerification: async ({ newEmail, token }: { newEmail: string; token: string }) => {
        await sendChangeEmailVerification({ email: newEmail, verificationUrl: token })
      }
    },
    deleteUser: { enabled: true }
  },
  subscription: { modelName: 'subscriptions' },
  session: {
    modelName: 'sessions',
    additionalFields: {
      impersonatedBy: { type: 'string', default: null, returned: true }
    }
  },
  account: { modelName: 'accounts' },
  verification: { modelName: 'verifications' },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
    requireEmailVerification: false,
    emailVerification: {
      sendVerificationEmail: async ({ user, token }: { user: User; token: string }) => {
        await sendVerificationEmail({ email: user.email, verificationUrl: token })
      },
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 3600
    },
    sendResetPassword: async ({ user, token }) => {
      await sendResetPasswordEmail({ email: user.email, verificationUrl: token })
    }
  }
})

const router = new Hono({ strict: false })

router.on(['POST', 'GET'], '/auth/*', async (c) => {
  const path = c.req.path
  const response = await auth.handler(c.req.raw)

  if (c.req.method === 'POST' && (path === '/api/auth/sign-in/email' || path === '/api/auth/sign-in/email-otp')) {
    try {
      const body = await response.text()
      const data = JSON.parse(body)
      if (data?.user?.id) {
        const now = new Date()
        await db.update(schema.users).set({ lastLoginAt: now, updatedAt: now }).where(eq(schema.users.id, data.user.id))
      }
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      })
    } catch (error) {
      console.error('Failed to update last login date:', error)
    }
  }

  return response
})

export default router
