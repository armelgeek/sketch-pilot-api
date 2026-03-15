import type { User } from '../models/user.model'
import type { z } from 'zod'

export interface UserFilter {
  role?: string
  excludeRole?: string
  search?: string
  page?: number
  limit?: number
}
export interface PaginatedUsers {
  users: z.infer<typeof User>[]
  total: number
  page: number
  limit: number
}

export interface UserRepositoryInterface {
  findById: (id: string) => Promise<z.infer<typeof User> | null>
  findAll: () => Promise<z.infer<typeof User>[]>
  findPaginatedUsers: (filter: UserFilter) => Promise<PaginatedUsers>
  findByEmail: (email: string) => Promise<z.infer<typeof User> | null>
  update: (id: string, data: Partial<z.infer<typeof User>>) => Promise<z.infer<typeof User>>
  banUser: (id: string, reason?: string, expires?: Date) => Promise<void>
  unbanUser: (id: string) => Promise<void>
}
