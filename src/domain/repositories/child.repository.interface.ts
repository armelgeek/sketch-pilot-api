import type { Child } from '../models/child.model'

export interface ChildRepositoryInterface {
  findById: (id: string) => Promise<Child | null>
  findByParentId: (parentId: string) => Promise<Child[]>
  save: (child: Child) => Promise<Child>
  update: (id: string, child: Partial<Child>) => Promise<Child>
  remove: (id: string) => Promise<boolean>
  countByParentId: (parentId: string) => Promise<number>
}
