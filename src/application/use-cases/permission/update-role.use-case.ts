import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { PermissionService } from '@/application/services/permission.service'
import type { Action, Subject } from '@/domain/types/permission.type'

interface UpdateRoleResponse {
  success: boolean
  data: {
    id: string
  }
}

export class UpdateRoleUseCase extends IUseCase<
  {
    roleId: string
    currentUserId: string
    name?: string
    description?: string
    permissions?: Array<{
      subject: Subject
      actions: Action[]
    }>
  },
  UpdateRoleResponse
> {
  constructor(private readonly permissionService: PermissionService) {
    super()
  }

  async execute(params: {
    roleId: string
    currentUserId: string
    name?: string
    description?: string
    permissions?: Array<{
      subject: Subject
      actions: Action[]
    }>
  }): Promise<UpdateRoleResponse> {
    const { roleId, name, description, permissions } = params

    const result = await this.permissionService.updateRole(roleId, {
      name,
      description,
      resources: permissions?.map((p) => ({
        resourceType: p.subject,
        actions: p.actions
      }))
    })

    return {
      success: true,
      data: {
        id: result.id
      }
    }
  }

  log(): ActivityType {
    return ActivityType.UPDATE_ROLE
  }
}
