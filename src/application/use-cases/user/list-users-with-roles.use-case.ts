import { IUseCase } from '@/domain/types/use-case.type'
import type { PermissionService } from '@/application/services/permission.service'
import type { UserRepositoryInterface } from '@/domain/repositories/user.repository.interface'

interface Params {
  page?: number
  limit?: number
  search?: string
}

interface UserWithRoles {
  id: string
  name: string
  email: string
  firstname?: string
  lastname?: string
  lastLoginAt: string | null
  roles: Array<{
    id: string
    name: string
    permissions: Array<{
      subject: string
      actions: string[]
    }>
  }>
}

interface Response {
  success: boolean
  data: {
    users: UserWithRoles[]
    total: number
    page: number
    limit: number
  }
  error?: string
}

export class ListUsersWithRolesUseCase extends IUseCase<Params, Response> {
  constructor(
    private readonly userRepository: UserRepositoryInterface,
    private readonly permissionService: PermissionService
  ) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    try {
      const result = await this.userRepository.findPaginatedUsers({
        page: params.page,
        limit: params.limit,
        search: params.search,
        role: 'not_user'
      })

      const usersWithRoles = await Promise.all(
        result.users.map(async (user: any) => {
          const rolesWithPermissions = await this.permissionService.getUserRolesWithPermissions(user.id)
          const roles = rolesWithPermissions.reduce((acc: any[], role: any) => {
            const existingRole = acc.find((r) => r.id === role.roleId)
            if (existingRole) {
              existingRole.permissions.push({
                subject: role.resourceType ?? '',
                actions: role.actions ?? []
              })
            } else {
              acc.push({
                id: role.roleId || '',
                name: role.roleName || '',
                permissions: [
                  {
                    subject: role.resourceType ?? '',
                    actions: role.actions ?? []
                  }
                ]
              })
            }
            return acc
          }, [])
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            firstname: user.firstname || '',
            lastname: user.lastname || '',
            lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
            roles
          }
        })
      )

      return {
        success: true,
        data: {
          users: usersWithRoles,
          total: result.total,
          page: result.page,
          limit: result.limit
        }
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Internal server error',
        data: {
          users: [],
          total: 0,
          page: params.page || 1,
          limit: params.limit || 10
        }
      }
    }
  }
}
