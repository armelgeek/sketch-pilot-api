import { createAccessControl } from 'better-auth/plugins/access'

/**
 * Access control definition using better-auth's built-in RBAC.
 * Replaces the old custom roles/permissions DB tables.
 */
export const ac = createAccessControl({
  user: ['create', 'read', 'update', 'delete'] as const,
  video: ['create', 'read', 'update', 'delete'] as const,
  subscription: ['create', 'read', 'update', 'delete'] as const,
  stat: ['read'] as const
})

export const adminRole = ac.newRole({
  user: ['create', 'read', 'update', 'delete'],
  video: ['create', 'read', 'update', 'delete'],
  subscription: ['create', 'read', 'update', 'delete'],
  stat: ['read']
})

export const userRole = ac.newRole({
  video: ['create', 'read'],
  subscription: ['read']
})
