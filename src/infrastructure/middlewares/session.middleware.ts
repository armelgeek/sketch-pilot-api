import { PermissionService } from '../../application/services/permission.service'
import { auth } from '../config/auth.config'
import type { Action } from '../../domain/types/permission.type'
import type { Context, Next } from 'hono'

const addSession = async (c: Context, next: Next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })

  if (!session) {
    c.set('user', null as unknown as { id: string; email: string; permissions: []; isAdmin?: boolean })
    c.set('session', null)
    return next()
  }

  const permissionService = new PermissionService()

  let permissions: Array<{ subject: string; actions: string[] }> = []
  try {
    const rolesWithPermissions = await permissionService.getUserRolesWithPermissions(session.user.id)
    const permissionMap = new Map<string, Set<string>>()
    for (const role of rolesWithPermissions) {
      if (role.resourceType && Array.isArray(role.actions)) {
        if (!permissionMap.has(role.resourceType)) {
          permissionMap.set(role.resourceType, new Set())
        }
        ;(role.actions ?? [])
          .filter((action): action is Action => typeof action === 'string' && action !== null && action !== undefined)
          .forEach((action) => {
            if (role.resourceType) {
              const actionSet = permissionMap.get(role.resourceType)
              if (actionSet) {
                actionSet.add(action)
              }
            }
          })
      }
    }
    permissions = Array.from(permissionMap.entries()).map(([subject, actionsSet]) => ({
      subject,
      actions: Array.from(actionsSet)
    }))
  } catch {
    permissions = []
  }

  const authUser = {
    ...session.user,
    id: session.user.id,
    permissions
  } as any
  c.set('user', authUser)
  c.set('session', session.session)

  return next()
}

export default addSession
