import { IUseCase } from '@/domain/types/use-case.type'
import type { PermissionService } from '@/application/services/permission.service'

interface RoleDetailResponse {
  success: boolean
  data: {
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
      }>
    }
  } | null
  error?: string
}

export class GetRoleDetailsByIdUseCase extends IUseCase<{ roleId: string }, RoleDetailResponse> {
  constructor(private readonly permissionService: PermissionService) {
    super()
  }

  async execute(params: { roleId: string }): Promise<RoleDetailResponse> {
    const { roleId } = params
    const role = await this.permissionService.getRoleWithDetailsById(roleId)
    if (!role) {
      return { success: false, data: null, error: 'Role not found' }
    }
    return {
      success: true,
      data: {
        id: role.id,
        name: role.name,
        description: role.description || '',
        permissions:
          role.resources?.map((resource: any) => ({
            subject: resource.resourceType,
            actions: resource.actions
          })) || [],
        stats: {
          totalUsers: role.users?.length || 0,
          users:
            role.users?.map((user: any) => ({
              id: user.id,
              name: user.name,
              email: user.email,
              lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : null
            })) || []
        }
      }
    }
  }
}
