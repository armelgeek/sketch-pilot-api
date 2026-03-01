import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SystemConfigService } from '@/application/services/system-config.service'
import type { Child } from '@/domain/models/child.model'
import type { ChildRepositoryInterface } from '@/domain/repositories/child.repository.interface'
import type { SubscriptionPlanRepositoryInterface } from '@/domain/repositories/subscription-plan.repository.interface'
import type { UserRepositoryInterface } from '@/domain/repositories/user.repository.interface'
import { CreateChildUseCase } from './create-child.use-case'

vi.mock('@/application/services/system-config.service')

const makeChild = (overrides = {}): Child => ({
  id: 'child-1',
  parentId: 'parent-1',
  firstname: 'Test',
  lastname: 'Child',
  firstLogin: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
})

describe('CreateChildUseCase', () => {
  let childRepository: Partial<ChildRepositoryInterface>
  let userRepository: Partial<UserRepositoryInterface>
  let subscriptionPlanRepository: Partial<SubscriptionPlanRepositoryInterface>
  let useCase: CreateChildUseCase

  beforeEach(() => {
    childRepository = {
      countByParentId: vi.fn(),
      save: vi.fn()
    }
    userRepository = {
      findById: vi.fn()
    }
    subscriptionPlanRepository = {
      findById: vi.fn()
    }
    useCase = new CreateChildUseCase(
      childRepository as ChildRepositoryInterface,
      userRepository as UserRepositoryInterface,
      subscriptionPlanRepository as SubscriptionPlanRepositoryInterface
    )
    vi.resetAllMocks()
  })

  it('crée un enfant si limite non atteinte', async () => {
    ;(userRepository.findById as any).mockResolvedValue({ id: 'parent-1', planId: 'plan-1' })
    ;(childRepository.countByParentId as any).mockResolvedValue(1)
    ;(subscriptionPlanRepository.findById as any).mockResolvedValue({ childLimit: 3 })
    ;(SystemConfigService.getInstance as any).mockReturnValue({ isSubscriptionEnabled: () => Promise.resolve(true) })
    ;(childRepository.save as any).mockResolvedValue(makeChild())

    const result = await useCase.execute({ firstname: 'Test', lastname: 'Child', parentId: 'parent-1' })
    expect(result.success).toBe(true)
    expect(childRepository.save).toHaveBeenCalled()
  })

  it('refuse si limite atteinte', async () => {
    ;(userRepository.findById as any).mockResolvedValue({ id: 'parent-1', planId: 'plan-1' })
    ;(childRepository.countByParentId as any).mockResolvedValue(3)
    ;(subscriptionPlanRepository.findById as any).mockResolvedValue({ childLimit: 3 })
    ;(SystemConfigService.getInstance as any).mockReturnValue({ isSubscriptionEnabled: () => Promise.resolve(true) })

    await expect(useCase.execute({ firstname: 'Test', lastname: 'Child', parentId: 'parent-1' })).rejects.toThrow(
      new Error('Maximum number of children reached for your plan')
    )
  })

  it('ignore la limite si abonnement désactivé', async () => {
    ;(userRepository.findById as any).mockResolvedValue({ id: 'parent-1', planId: 'plan-1' })
    ;(childRepository.countByParentId as any).mockResolvedValue(99)
    ;(subscriptionPlanRepository.findById as any).mockResolvedValue({ childLimit: 3 })
    ;(SystemConfigService.getInstance as any).mockReturnValue({ isSubscriptionEnabled: () => Promise.resolve(false) })
    ;(childRepository.save as any).mockResolvedValue(makeChild())

    const result = await useCase.execute({ firstname: 'Test', lastname: 'Child', parentId: 'parent-1' })
    expect(result.success).toBe(true)
    expect(childRepository.save).toHaveBeenCalled()
  })

  it('utilise la valeur par défaut si pas de plan', async () => {
    ;(userRepository.findById as any).mockResolvedValue({ id: 'parent-1' })
    ;(childRepository.countByParentId as any).mockResolvedValue(2)
    ;(subscriptionPlanRepository.findById as any).mockResolvedValue(undefined)
    ;(SystemConfigService.getInstance as any).mockReturnValue({ isSubscriptionEnabled: () => Promise.resolve(true) })
    ;(childRepository.save as any).mockResolvedValue(makeChild())

    const result = await useCase.execute({ firstname: 'Test', lastname: 'Child', parentId: 'parent-1' })
    expect(result.success).toBe(true)
    expect(childRepository.save).toHaveBeenCalled()
  })

  it('refuse si parent inconnu', async () => {
    ;(userRepository.findById as any).mockResolvedValue(null)
    ;(SystemConfigService.getInstance as any).mockReturnValue({ isSubscriptionEnabled: () => Promise.resolve(true) })
    await expect(useCase.execute({ firstname: 'Test', lastname: 'Child', parentId: 'parent-1' })).rejects.toThrow(
      new Error('Parent not found')
    )
  })
})
