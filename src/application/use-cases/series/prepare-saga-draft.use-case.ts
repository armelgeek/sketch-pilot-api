import crypto from 'node:crypto'
import { IUseCase } from '@/domain/types'
import { CREDIT_COSTS } from '@/infrastructure/config/video.config'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { SeriesRepository } from '@/infrastructure/repositories/series.repository'
import type { SagaProductionService } from '../../../../plugins/sketch-pilot/src/plugins/vimax/services/saga-production.service'

type PrepareSagaDraftParams = {
  userId: string
  title: string
  seriesId?: string
  description?: string
  language?: string
  totalEpisodes?: number
  referenceStyleImage?: string
}

export class PrepareSagaDraftUseCase extends IUseCase<PrepareSagaDraftParams, any> {
  private readonly creditsRepository = new CreditsRepository()
  private readonly seriesRepository = new SeriesRepository()

  constructor(private readonly sagaProductionService: SagaProductionService) {
    super()
  }

  async execute(params: PrepareSagaDraftParams) {
    try {
      const totalCost = Math.ceil(CREDIT_COSTS.SAGA_PREPARATION / 2) // Partial cost for draft phase

      const credits = await this.creditsRepository.ensureUserCredits(params.userId)
      const planLimit = await this.creditsRepository.getCurrentPlanLimit(params.userId)
      const totalAvailable = (credits?.extraCredits || 0) + Math.max(0, planLimit - (credits?.videosThisMonth || 0))

      if (totalAvailable < totalCost) {
        return { success: false, insufficientCredits: true }
      }

      console.info('[PrepareSagaDraft] Generating draft narrative...')
      const agent = this.sagaProductionService.getAgent()
      const idea = `Saga: ${params.title}. Description: ${params.description || ''}`

      // If seriesId is provided, we might want to extend it
      // For now, let's just generate the draft
      const draft = await agent.planner.draftSaga(idea, {
        userId: params.userId,
        targetEpisodeCount: params.totalEpisodes,
        referenceStyleImage: params.referenceStyleImage
      })

      // Create or Update series entry
      let seriesId = params.seriesId
      const seriesData = {
        title: params.title,
        description: params.description,
        globalContext: draft.script,
        plannedEpisodes: draft.episodes.map((ep: any, index: number) => ({
          number: index + 1,
          title: ep.title,
          hook: ep.summary
        })),
        language: params.language || 'fr',
        totalEpisodes: String(draft.episodes.length),
        referenceStyleImage: params.referenceStyleImage,
        status: 'draft' as const
      }

      if (seriesId) {
        await this.seriesRepository.update(seriesId, seriesData)
      } else {
        seriesId = crypto.randomUUID()
        await this.seriesRepository.create({
          id: seriesId,
          userId: params.userId,
          ...seriesData
        })
      }

      await this.creditsRepository.consumeCredits(params.userId, totalCost, planLimit)

      return {
        success: true,
        seriesId,
        intent: draft.intent,
        script: draft.script,
        episodes: draft.episodes.map((ep: any, index: number) => ({
          number: index + 1,
          title: ep.title,
          hook: ep.summary
        }))
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate draft'
      }
    }
  }
}
