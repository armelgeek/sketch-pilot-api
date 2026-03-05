import { eq } from 'drizzle-orm'
import { IUseCase } from '@/domain/types/use-case.type'
import { db } from '@/infrastructure/database/db'
import { accounts, sessions, users, verifications } from '@/infrastructure/database/schema'
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
  constructor(private readonly userRepository: UserRepositoryInterface) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    try {
      const { userId, currentUserId } = params

      const userToDelete = await this.userRepository.findById(userId)
      if (!userToDelete) {
        return { success: false, error: 'Utilisateur non trouvé' }
      }

      if (userId === currentUserId) {
        return { success: false, error: 'Vous ne pouvez pas supprimer votre propre compte' }
      }

      await db.delete(sessions).where(eq(sessions.userId, userId))
      await db.delete(verifications).where(eq(verifications.identifier, userId))
      await db.delete(accounts).where(eq(accounts.userId, userId))
      await db.delete(users).where(eq(users.id, userId))

      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message || "Erreur lors de la suppression de l'utilisateur" }
    }
  }
}
