import { IUseCase } from '@/domain/types/use-case.type'
import type { PermissionService } from '@/application/services/permission.service'

interface DeleteRoleResponse {
  success: boolean
}

export class DeleteRoleUseCase extends IUseCase<{ roleId: string; currentUserId: string }, DeleteRoleResponse> {
  constructor(private readonly permissionService: PermissionService) {
    super()
  }

  async execute(params: { roleId: string; currentUserId: string }): Promise<DeleteRoleResponse> {
    const { roleId } = params

    const role = await this.permissionService.getRoleById(roleId)
    if (!role) {
      throw new Error('Role not found')
    }

    if (role.name.toLowerCase() === 'admin') {
      throw new Error('Cannot delete super admin role')
    }

    await this.permissionService.deleteRole(roleId)

    return {
      success: true
    }
  }
}
