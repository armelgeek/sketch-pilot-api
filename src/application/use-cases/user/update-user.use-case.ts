import { eq } from 'drizzle-orm'
import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import { db } from '@/infrastructure/database/db'
import { userRoles } from '@/infrastructure/database/schema'
import type { PermissionService } from '@/application/services/permission.service'
import type { UserRepositoryInterface } from '@/domain/repositories/user.repository.interface'

type Params = {
  userId: string
  currentUserId: string
  name?: string
  firstname?: string
  lastname?: string
  email?: string
  roleIds?: string[]
}

type Response = {
  data: {
    id: string
    name: string
    firstname: string
    lastname: string
    email: string
    roles: Array<{ id: string; name: string }>
  } | null
  success: boolean
  error?: string
}

export class UpdateUserUseCase extends IUseCase<Params, Response> {
  constructor(
    private readonly userRepository: UserRepositoryInterface,
    private readonly permissionService: PermissionService
  ) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    try {
      const { userId, currentUserId, firstname, lastname, email, roleIds } = params

      // Vérifier que l'utilisateur à modifier existe
      const userToUpdate = await this.userRepository.findById(userId)
      if (!userToUpdate) {
        return {
          success: false,
          error: 'Utilisateur non trouvé',
          data: null
        }
      }

      // Empêcher la modification de son propre compte
      if (userId === currentUserId) {
        return {
          success: false,
          error: 'Vous ne pouvez pas modifier votre propre compte',
          data: null
        }
      }

      // Préparer les données de mise à jour
      const updateData: any = {}
      if (email !== undefined) {
        // Vérifier que l'email n'est pas déjà utilisé
        if (email !== userToUpdate.email) {
          const existingUser = await this.userRepository.findByEmail(email)
          if (existingUser && existingUser.id !== userId) {
            return {
              success: false,
              error: 'Cet email est déjà utilisé par un autre utilisateur',
              data: null
            }
          }
        }
        updateData.email = email
      }
      if (firstname !== undefined) updateData.firstname = firstname
      if (lastname !== undefined) updateData.lastname = lastname
      if (firstname !== undefined || lastname !== undefined) {
        updateData.name = `${firstname || ''} ${lastname || ''}`
      }
      // Mettre à jour les informations de base si nécessaire
      let updatedUser = userToUpdate
      if (Object.keys(updateData).length > 0) {
        updatedUser = await this.userRepository.update(userId, updateData)
      }

      // Gérer les rôles si fournis
      if (roleIds !== undefined) {
        // Supprimer tous les rôles existants
        await db.delete(userRoles).where(eq(userRoles.userId, userId))

        // Ajouter les nouveaux rôles
        if (roleIds.length > 0) {
          const now = new Date()
          const userRoleInserts = roleIds.map((roleId) => ({
            id: crypto.randomUUID(),
            userId,
            roleId,
            createdAt: now,
            updatedAt: now
          }))

          await db.insert(userRoles).values(userRoleInserts)
        }
      }

      // Récupérer les rôles mis à jour
      const userRolesWithPermissions = await this.permissionService.getUserRolesWithPermissions(userId)
      const roles = userRolesWithPermissions.reduce(
        (acc, role) => {
          if (role.roleId && role.roleName) {
            const existingRole = acc.find((r) => r.id === role.roleId)
            if (!existingRole) {
              acc.push({
                id: role.roleId,
                name: role.roleName
              })
            }
          }
          return acc
        },
        [] as Array<{ id: string; name: string }>
      )

      return {
        success: true,
        data: {
          id: updatedUser.id,
          firstname: updatedUser.firstname || '',
          lastname: updatedUser.lastname || '',
          name: `${updatedUser.firstname || ''} ${updatedUser.lastname || ''}`,
          email: updatedUser.email,
          roles
        }
      }
    } catch (error: any) {
      console.error('Error updating user:', error)
      return {
        success: false,
        error: error.message || "Erreur lors de la mise à jour de l'utilisateur",
        data: null
      }
    }
  }

  log(): ActivityType {
    return ActivityType.UPDATE_USER
  }
}
