/**
 * Access control constants - mirrors the better-auth ac definition.
 * The actual permission enforcement is done by better-auth's admin plugin.
 * See: src/infrastructure/config/access-control.config.ts
 */
export const Roles = {
  ADMIN: 'admin',
  USER: 'user'
} as const

export const Subjects = {
  MODULE: 'module',
  CHAPTER: 'chapter',
  SUBSCRIPTION: 'subscription',
  PARENT: 'parent',
  ADMIN: 'admin',
  STAT: 'stat',
  ACTIVITY: 'activity'
} as const

export const Actions = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete'
} as const

export type Subject = (typeof Subjects)[keyof typeof Subjects]
export type Action = (typeof Actions)[keyof typeof Actions]
