import process from 'node:process'

import { stripe as stripePlugin } from '@better-auth/stripe'
import { betterAuth, type User } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin, openAPI } from 'better-auth/plugins'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import Stripe from 'stripe'
import { db } from '../database/db'
import { userCredits, users } from '../database/schema'
import { ac, adminRole, userRole } from './access-control.config'
import { sendChangeEmailVerification, sendResetPasswordEmail, sendVerificationEmail } from './mail.config'

const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-11-17.clover' as any
})

async function addCreditsToUser(userId: string, credits: number): Promise<void> {
  try {
    const existing = await db.query.userCredits?.findFirst?.({
      where: (t: any, { eq: eqFn }: any) => eqFn(t.userId, userId)
    })
    if (existing) {
      await db
        .update(userCredits)
        .set({ extraCredits: existing.extraCredits + credits, updatedAt: new Date() })
        .where(eq(userCredits.userId, userId))
    } else {
      await db.insert(userCredits).values({
        id: crypto.randomUUID(),
        userId,
        extraCredits: credits,
        resetDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
        updatedAt: new Date()
      })
    }
  } catch (error) {
    console.error('Error adding credits to user:', error)
  }
}

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
            name: 'starter',
            priceId: process.env.STRIPE_PRICE_STARTER_MONTHLY || 'price_1234567890',
            annualDiscountPriceId: process.env.STRIPE_PRICE_STARTER_YEARLY || 'price_1234567890',
            limits: {
              credits: 1000
            }
          }
        ],
        requireEmailVerification: false,
      },
      onEvent: async (event: Stripe.Event) => {
        if (event.type === 'checkout.session.completed') {
          const session = event.data.object as Stripe.Checkout.Session
          if (session.mode === 'payment' && session.metadata?.type === 'credit_topup') {
            const userId = session.metadata.userId
            const credits = Number.parseInt(session.metadata.creditsAmount || '0', 10)
            if (userId && credits > 0) {
              await addCreditsToUser(userId, credits)
              try {
                const { creditTransactions } = await import('../database/schema')
                await db.insert(creditTransactions).values({
                  id: crypto.randomUUID(),
                  userId,
                  type: 'topup',
                  amount: credits,
                  price: session.amount_total ? String(session.amount_total / 100) : null,
                  currency: session.currency || 'usd',
                  stripeSessionId: session.id,
                  packId: session.metadata.packId,
                  createdAt: new Date()
                })
              } catch (error) {
                console.error('Error recording credit transaction:', error)
              }
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
  database: drizzleAdapter(db, { provider: 'pg' }),
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
        await db.update(users).set({ lastLoginAt: now, updatedAt: now }).where(eq(users.id, data.user.id))
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
