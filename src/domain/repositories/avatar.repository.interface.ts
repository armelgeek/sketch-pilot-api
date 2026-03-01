import type { Avatar } from '../models/avatar.model'

export interface AvatarRepositoryInterface {
  save: (avatar: { id: string; path: string }) => Promise<Avatar>
  findById: (id: string) => Promise<Avatar | null>
  delete: (id: string) => Promise<boolean>
  findAll: (pagination: { skip: number; limit: number }) => Promise<Avatar[]>
  count: () => Promise<number>
}
