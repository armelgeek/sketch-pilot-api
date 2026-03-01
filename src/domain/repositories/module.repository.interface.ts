import type { Module } from '../models/module.model'

export interface ModuleRepositoryInterface {
  findById: (id: string) => Promise<Module | null>
  findAll: (pagination?: { skip: number; limit: number }) => Promise<Module[]>
  findWithSearch: (search?: string, pagination?: { skip: number; limit: number }) => Promise<Module[]>
  findWithSearchWithActiveStatus: (
    search?: string,
    isActive?: boolean,
    pagination?: { skip: number; limit: number }
  ) => Promise<Module[]>
  countWithSearchWithActiveStatus: (search?: string, isActive?: boolean) => Promise<number>
  countWithSearch: (search?: string) => Promise<number>
  create: (data: Omit<Module, 'id' | 'position' | 'createdAt' | 'updatedAt'>) => Promise<Module>
  update: (id: string, data: Partial<Omit<Module, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<Module>
  delete: (id: string) => Promise<boolean>
  updateStatus: (id: string, isActive: boolean) => Promise<Module>
  count: () => Promise<number>
}
