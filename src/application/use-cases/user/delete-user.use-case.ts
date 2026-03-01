import { eq } from 'drizzle-orm'
import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import { db } from '@/infrastructure/database/db'
import { accounts, sessions, userRoles, users, verifications } from '@/infrastructure/database/schema'
import type { PermissionService } from '@/application/services/permission.service'
import type { UserRepositoryInterface } from '@/domain/repositories/user.repository.interface'

type Params = {
  userId: string
  currentUserId: string
}

type Response = {
  success: boolean
  error?: string
}

export class DeleteUserUseCase extends IUseCase<Params, Response> {
  constructor(
    private readonly userRepository: UserRepositoryInterface,
    private readonly permissionService: PermissionService
  ) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    try {
      const { userId, currentUserId } = params

      const userToDelete = await this.userRepository.findById(userId)
      if (!userToDelete) {
        return {
          success: false,
          error: 'Utilisateur non trouvé'
        }
      }

      if (userId === currentUserId) {
        return {
          success: false,
          error: 'Vous ne pouvez pas supprimer votre propre compte'
        }
      }

      // Supprimer les sessions Better Auth liées à l'utilisateur
      await db.delete(sessions).where(eq(sessions.userId, userId))

      // Supprimer les tokens Better Auth liés à l'utilisateur
      await db.delete(verifications).where(eq(verifications.identifier, userId))

      // Supprimer d'abord les comptes Better Auth liés à l'utilisateur
      await db.delete(accounts).where(eq(accounts.userId, userId))

      // Supprimer les rôles
      await db.delete(userRoles).where(eq(userRoles.userId, userId))

      // Supprimer l'utilisateur
      await db.delete(users).where(eq(users.id, userId))

      return {
        success: true
      }
    } catch (error: any) {
      console.error('Error deleting user:', error)
      return {
        success: false,
        error: error.message || "Erreur lors de la suppression de l'utilisateur"
      }
    }
  }

  log(): ActivityType {
    return ActivityType.DELETE_ACCOUNT
  }
}
