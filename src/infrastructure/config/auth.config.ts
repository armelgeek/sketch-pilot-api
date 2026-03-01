import { betterAuth, type User } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin, customSession, emailOTP, openAPI } from 'better-auth/plugins'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { PermissionService } from '@/application/services/permission.service'
import { db } from '../database/db'
import { users } from '../database/schema'
import {
  emailTemplates,
  sendChangeEmailVerification,
  sendEmail,
  sendResetPasswordEmail,
  sendVerificationEmail
} from './mail.config'

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
