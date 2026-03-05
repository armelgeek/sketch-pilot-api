import type { Context, Next } from 'hono'

/**
 * Middleware: requires the authenticated user to have the 'admin' role.
 * Replaces the old custom RBAC checkPermission middleware.
 */
export async function requireAdmin(c: Context, next: Next): Promise<void | Response> {
  const user = c.get('user') as any
  if (!user) {
    return c.json({ success: false, error: 'Unauthorized' }, 401)
  }
  if (user.role !== 'admin') {
    return c.json({ success: false, error: 'Forbidden: admin access required' }, 403)
  }
  return next()
}
