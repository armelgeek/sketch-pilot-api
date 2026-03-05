import { IUseCase } from '@/domain/types/use-case.type'
import type { UserRepositoryInterface } from '@/domain/repositories/user.repository.interface'

type Params = {
  userId: string
  currentUserId: string
  name?: string
  firstname?: string
  lastname?: string
  email?: string
  role?: string
}

type Response = {
  data: {
    id: string
    name: string
    firstname: string
    lastname: string
    email: string
    role: string
  } | null
  success: boolean
  error?: string
}

export class UpdateUserUseCase extends IUseCase<Params, Response> {
  constructor(private readonly userRepository: UserRepositoryInterface) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    try {
      const { userId, currentUserId, firstname, lastname, email } = params

      const userToUpdate = await this.userRepository.findById(userId)
      if (!userToUpdate) {
        return { success: false, error: 'Utilisateur non trouvé', data: null }
      }

      if (userId === currentUserId) {
        return { success: false, error: 'Vous ne pouvez pas modifier votre propre compte', data: null }
      }

      const updateData: any = {}
      if (email !== undefined && email !== userToUpdate.email) {
        const existingUser = await this.userRepository.findByEmail(email)
        if (existingUser && existingUser.id !== userId) {
          return { success: false, error: 'Cet email est déjà utilisé par un autre utilisateur', data: null }
        }
        updateData.email = email
      }
      if (firstname !== undefined) updateData.firstname = firstname
      if (lastname !== undefined) updateData.lastname = lastname
      if (firstname !== undefined || lastname !== undefined) {
        updateData.name = `${firstname || ''} ${lastname || ''}`.trim()
      }

      const updatedUser = Object.keys(updateData).length > 0
        ? await this.userRepository.update(userId, updateData)
        : userToUpdate

      return {
        success: true,
        data: {
          id: updatedUser.id,
          firstname: updatedUser.firstname || '',
          lastname: updatedUser.lastname || '',
          name: updatedUser.name,
          email: updatedUser.email,
          role: (updatedUser as any).role || 'user'
        }
      }
    } catch (error: any) {
      return { success: false, error: error.message || "Erreur lors de la mise à jour de l'utilisateur", data: null }
    }
  }
}
