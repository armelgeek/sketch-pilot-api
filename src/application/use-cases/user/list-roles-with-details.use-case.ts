import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { PermissionService } from '@/application/services/permission.service'

interface Params {
  // Optionally, you could add filters or pagination here
}

interface RoleWithDetails {
  id: string
  name: string
  description: string
  permissions: Array<{
    subject: string
    actions: string[]
  }>
  stats: {
    totalUsers: number
    users: Array<{
      id: string
      name: string
      email: string
      lastLoginAt: string | null
    }>
  }
}

interface Response {
  success: boolean
  data: RoleWithDetails[]
  error?: string
}

export class ListRolesWithDetailsUseCase extends IUseCase<Params, Response> {
  constructor(private readonly permissionService: PermissionService) {
    super()
  }

  async execute(): Promise<Response> {
    try {
      const roles = await this.permissionService.getAllRolesWithDetails()
      return {
        success: true,
        data: roles.map((role: any) => ({
          id: role.id,
          name: role.name,
          description: role.description || '',
          permissions: role.resources.map((resource: any) => ({
            subject: resource.resourceType,
            actions: resource.actions
          })),
          stats: {
            totalUsers: role.users.length,
            users: role.users
          }
        }))
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Internal server error',
        data: []
      }
    }
  }

  log(): ActivityType {
    return ActivityType.LIST_ROLES
  }
}
