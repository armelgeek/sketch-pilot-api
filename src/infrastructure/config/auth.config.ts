import { betterAuth, type User } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin, customSession, emailOTP, openAPI } from 'better-auth/plugins'
import { stripe as stripePlugin } from '@better-auth/stripe'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import Stripe from 'stripe'
import { PermissionService } from '@/application/services/permission.service'
import { db } from '../database/db'
import { users, userCredits } from '../database/schema'
import {
  emailTemplates,
  sendChangeEmailVerification,
  sendEmail,
  sendResetPasswordEmail,
  sendVerificationEmail
} from './mail.config'

const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-03-31.basil' as any
})

async function addCreditsToUser(userId: string, credits: number): Promise<void> {
  try {
    const existing = await db.query.userCredits?.findFirst?.({ where: (t: any, { eq: eqFn }: any) => eqFn(t.userId, userId) })
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
        videosThisMonth: 0,
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
    emailOTP({
      expiresIn: 600,
      otpLength: 4,
      async sendVerificationOTP({ email, otp }) {
        const template = await emailTemplates.otpLogin(otp)
        await sendEmail({
          to: email,
          ...template
        })
      }
    }),
    stripePlugin({
      stripeClient,
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
      createCustomerOnSignUp: true,
      onEvent: async (event: Stripe.Event) => {
        if (event.type === 'checkout.session.completed') {
          const session = event.data.object as Stripe.Checkout.Session
          if (session.mode === 'payment' && session.metadata?.type === 'credit_topup') {
            const userId = session.metadata.userId
            const credits = parseInt(session.metadata.creditsAmount || '0', 10)
            if (userId && credits > 0) {
              await addCreditsToUser(userId, credits)
              // Record the transaction
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
              } catch (err) {
                console.error('Error recording credit transaction:', err)
              }
            }
          }
        }
      },
      subscription: {
        enabled: true,
        plans: [
          { name: 'creator', priceId: process.env.STRIPE_PRICE_CREATOR || '', limits: { videosPerMonth: 30 } },
          { name: 'professional', priceId: process.env.STRIPE_PRICE_PROFESSIONAL || '', limits: { videosPerMonth: 100 } },
          { name: 'business', priceId: process.env.STRIPE_PRICE_BUSINESS || '', limits: { videosPerMonth: 300 } },
          { name: 'enterprise', priceId: process.env.STRIPE_PRICE_ENTERPRISE || '', limits: { videosPerMonth: -1 } }
        ]
      }
    }) as any,
    customSession(async ({ user, session }) => {
      if (!user?.id) {
        return {
          user,
          session
        }
      }

      try {
        const permissionService = new PermissionService()
        const rolesWithPermissions = await permissionService.getUserRolesWithPermissions(user.id)

        const permissionMap = new Map<string, Set<string>>()
        const roles: Array<{ id: string; name: string }> = []
        const roleIds = new Set<string>()

        for (const role of rolesWithPermissions) {
          if (role.roleId && role.roleName && !roleIds.has(role.roleId)) {
            roles.push({
              id: role.roleId,
              name: role.roleName
            })
            roleIds.add(role.roleId)
          }

          if (role.resourceType && Array.isArray(role.actions)) {
            if (!permissionMap.has(role.resourceType)) {
              permissionMap.set(role.resourceType, new Set())
            }

            role.actions
              .filter((action) => action !== null && action !== undefined)
              .forEach((action) => {
                if (role.resourceType) {
                  permissionMap.get(role.resourceType)?.add(action)
                }
              })
          }
        }

        const permissions = Array.from(permissionMap.entries()).map(([subject, actionsSet]) => ({
          subject,
          actions: Array.from(actionsSet)
        }))

        return {
          roles,
          permissions,
          user: {
            ...user,
            roles,
            permissions
          },
          session
        }
      } catch (error) {
        console.error('Error enriching session with roles and permissions:', error)

        return {
          roles: [],
          permissions: [],
          user: {
            ...user,
            roles: [],
            permissions: []
          },
          session
        }
      }
    }),
    admin({
      adminRoles: ['admin'],
      impersonationSessionDuration: 60 * 60 * 24
    })
  ],
  database: drizzleAdapter(db, {
    provider: 'pg'
  }),
  baseURL: Bun.env.BETTER_AUTH_URL || 'http://localhost:3000',
  trustedOrigins:
    Bun.env.NODE_ENV === 'production'
      ? [Bun.env.PRODUCTION_URL || 'http://localhost:3000', Bun.env.REACT_APP_URL || 'http://localhost:5173']
      : [Bun.env.BETTER_AUTH_URL || 'http://localhost:3000', Bun.env.REACT_APP_URL || 'http://localhost:5173'],
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
      isTrialActive: { type: 'boolean' },
      trialStartDate: { type: 'date' },
      trialEndDate: { type: 'date' },
      stripeCustomerId: { type: 'string' },
      stripeSubscriptionId: { type: 'string' },
      planId: { type: 'string' },
      stripeCurrentPeriodEnd: { type: 'date' },
      subscriptionInterval: { type: 'string' }
    },
    changeEmail: {
      enabled: true,
      sendChangeEmailVerification: async ({ newEmail, token }) => {
        await sendChangeEmailVerification({
          email: newEmail,
          verificationUrl: token
        })
      }
    },
    deleteUser: {
      enabled: true
    }
  },
  session: {
    modelName: 'sessions',
    additionalFields: {
      impersonatedBy: { type: 'string', default: null, returned: true }
    }
  },
  account: {
    modelName: 'accounts'
  },
  verification: {
    modelName: 'verifications'
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
    requireEmailVerification: false,
    emailVerification: {
      sendVerificationEmail: async ({ user, token }: { user: User; token: string }) => {
        await sendVerificationEmail({
          email: user.email,
          verificationUrl: token
        })
      },
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 3600 // 1 hour
    },
    sendResetPassword: async ({ user, token }) => {
      await sendResetPasswordEmail({
        email: user.email,
        verificationUrl: token
      })
    }
  }
})

const router = new Hono({
  strict: false
})

router.on(['POST', 'GET'], '/auth/*', async (c) => {
  const path = c.req.path
  const response = await auth.handler(c.req.raw)

  if (c.req.method === 'POST' && (path === '/api/auth/sign-in/email' || path === '/api/auth/sign-in/email-otp')) {
    try {
      const body = await response.text()
      const data = JSON.parse(body)
      if (data?.user?.id) {
        const now = new Date()
        await db
          .update(users)
          .set({
            lastLoginAt: now,
            updatedAt: now
          })
          .where(eq(users.id, data.user.id))
          .returning({ lastLoginAt: users.lastLoginAt })
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
