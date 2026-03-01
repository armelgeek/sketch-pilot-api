export const Roles = {
  ADMIN: 'admin',
  USER: 'user'
} as const
export const Permission = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete'
}
export const Subjects = {
  MODULE: 'module',
  CHAPTER: 'chapter',
  SUBSCRIPTION: 'subscription',
  PARENT: 'parent',
  ADMIN: 'admin',
  STAT: 'stat',
  AVATAR: 'avatar',
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

export interface RoleResource {
  id: string
  roleId: string
  resourceType: Subject
  actions: Action[]
  createdAt: Date
  updatedAt: Date
}

export interface Role {
  id: string
  name: string
  description?: string
  resources?: RoleResource[]
  createdAt: Date
  updatedAt: Date
}

export interface UserRole {
  id: string
  userId: string
  roleId: string
  createdAt: Date
  updatedAt: Date
}
