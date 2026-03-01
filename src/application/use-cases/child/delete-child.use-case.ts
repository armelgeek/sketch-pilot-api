import { randomInt } from 'node:crypto'
import { IUseCase } from '@/domain/types/use-case.type'
import { ActivityType } from '@/infrastructure/config/activity.config'
import type { ChildRepositoryInterface } from '@/domain/repositories/child.repository.interface'
import type { UserRepositoryInterface } from '@/domain/repositories/user.repository.interface'

type Params = {
  id: string
  parentId: string
  verificationCode: string
  storedVerificationCode: string
}

type Response = {
  success: boolean
  error?: string
}

export class DeleteChildUseCase extends IUseCase<Params, Response> {
  constructor(
    private readonly childRepository: ChildRepositoryInterface,
    private readonly userRepository: UserRepositoryInterface
  ) {
    super()
  }

  static generateVerificationCode(): string {
    return randomInt(100000, 999999).toString()
  }

  async execute(params: Params): Promise<Response> {
    const { id, parentId, verificationCode, storedVerificationCode } = params

    const parent = await this.userRepository.findById(parentId)
    if (!parent) {
      return {
        success: false,
        error: 'Parent not found'
      }
    }

    const child = await this.childRepository.findById(id)
    if (!child) {
      return {
        success: false,
        error: 'Child not found'
      }
    }

    if (child.parentId !== parentId) {
      return {
        success: false,
        error: 'Not authorized to delete this child profile'
      }
    }

    if (verificationCode !== storedVerificationCode) {
      return {
        success: false,
        error: 'Invalid verification code'
      }
    }

    await this.childRepository.remove(id)

    return {
      success: true
    }
  }

  log(): ActivityType {
    return ActivityType.DELETE_CHILD
  }
}
