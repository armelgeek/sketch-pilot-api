import { auth } from '../config/auth.config'
import { UnauthorizedError } from './error.middleware'
import type { Context, Next } from 'hono'

type AuthUser = {
  id: string
  email: string
  role: string
  isAdmin?: boolean
}

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser
  }
}

export async function authMiddleware(c: Context, next: Next) {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })

    if (!session) {
      throw new UnauthorizedError('Invalid session')
    }

    c.set('user', session.user as unknown as AuthUser)
    await next()
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error
    }
    throw new UnauthorizedError('Authentication failed')
  }
}
