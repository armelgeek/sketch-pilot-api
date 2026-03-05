import { IUseCase } from '@/domain/types/use-case.type'
import type { UserRepositoryInterface } from '@/domain/repositories/user.repository.interface'

type Params = {
  email: string
}

type Response = {
  exists: boolean
  success: boolean
  error?: string
}

export class CheckEmailExistsUseCase extends IUseCase<Params, Response> {
  constructor(private readonly userRepository: UserRepositoryInterface) {
    super()
  }

  async execute(params: Params): Promise<Response> {
    try {
      // Valider le format de l'email
      const emailRegex = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/
      if (!emailRegex.test(params.email)) {
        return {
          exists: false,
          success: false,
          error: 'Invalid email format'
        }
      }

      // Vérifier si l'email existe
      const user = await this.userRepository.findByEmail(params.email)

      return {
        exists: !!user,
        success: true
      }
    } catch (error: any) {
      return {
        exists: false,
        success: false,
        error: error.message || 'Failed to check email'
      }
    }
  }
}
