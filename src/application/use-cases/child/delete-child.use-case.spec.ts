import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChildRepositoryInterface } from '@/domain/repositories/child.repository.interface'
import type { UserRepositoryInterface } from '@/domain/repositories/user.repository.interface'
import { DeleteChildUseCase } from './delete-child.use-case'

const makeChild = (overrides = {}) => ({
  id: 'child-1',
  parentId: 'parent-1',
  firstname: 'Test',
  lastname: 'Child',
  firstLogin: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
})

describe('DeleteChildUseCase', () => {
  let childRepository: Partial<ChildRepositoryInterface>
  let userRepository: Partial<UserRepositoryInterface>
  let useCase: DeleteChildUseCase

  beforeEach(() => {
    childRepository = {
      findById: vi.fn(),
      remove: vi.fn()
    }
    userRepository = {
      findById: vi.fn()
    }
    useCase = new DeleteChildUseCase(
      childRepository as ChildRepositoryInterface,
      userRepository as UserRepositoryInterface
    )
    vi.resetAllMocks()
  })

  it('supprime un enfant avec succès', async () => {
    ;(userRepository.findById as any).mockResolvedValue({ id: 'parent-1' })
    ;(childRepository.findById as any).mockResolvedValue(makeChild())
    ;(childRepository.remove as any).mockResolvedValue(true)
    const params = {
      id: 'child-1',
      parentId: 'parent-1',
      verificationCode: '123456',
      storedVerificationCode: '123456'
    }
    const result = await useCase.execute(params)
    expect(result.success).toBe(true)
    expect(childRepository.remove).toHaveBeenCalledWith('child-1')
  })

  it('retourne une erreur si parent non trouvé', async () => {
    ;(userRepository.findById as any).mockResolvedValue(null)
    const params = {
      id: 'child-1',
      parentId: 'parent-1',
      verificationCode: '123456',
      storedVerificationCode: '123456'
    }
    const result = await useCase.execute(params)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Parent not found')
  })

  it('retourne une erreur si enfant non trouvé', async () => {
    ;(userRepository.findById as any).mockResolvedValue({ id: 'parent-1' })
    ;(childRepository.findById as any).mockResolvedValue(null)
    const params = {
      id: 'child-1',
      parentId: 'parent-1',
      verificationCode: '123456',
      storedVerificationCode: '123456'
    }
    const result = await useCase.execute(params)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Child not found')
  })

  it('refuse si parent non autorisé', async () => {
    ;(userRepository.findById as any).mockResolvedValue({ id: 'parent-2' })
    ;(childRepository.findById as any).mockResolvedValue(makeChild({ parentId: 'parent-1' }))
    const params = {
      id: 'child-1',
      parentId: 'parent-2',
      verificationCode: '123456',
      storedVerificationCode: '123456'
    }
    const result = await useCase.execute(params)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Not authorized to delete this child profile')
  })

  it('refuse si code de vérification invalide', async () => {
    ;(userRepository.findById as any).mockResolvedValue({ id: 'parent-1' })
    ;(childRepository.findById as any).mockResolvedValue(makeChild())
    const params = {
      id: 'child-1',
      parentId: 'parent-1',
      verificationCode: '000000',
      storedVerificationCode: '123456'
    }
    const result = await useCase.execute(params)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid verification code')
  })
})
