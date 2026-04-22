import { IUseCase } from '@/domain/types'
import { SeriesRepository } from '@/infrastructure/repositories/series.repository'
import type { SagaProductionService } from '../../../../plugins/sketch-pilot/src/plugins/vimax/services/saga-production.service'

type PrepareSagaEnrichParams = {
  userId: string
  seriesId: string
  script: string
}

export class PrepareSagaEnrichUseCase extends IUseCase<PrepareSagaEnrichParams, any> {
  private readonly seriesRepository = new SeriesRepository()

  constructor(private readonly sagaProductionService: SagaProductionService) {
    super()
  }

  async execute(params: PrepareSagaEnrichParams) {
    try {
      console.info(`[PrepareSagaEnrich] Enriching series ${params.seriesId}...`)
      const series = await this.seriesRepository.findById(params.seriesId)
      const agent = this.sagaProductionService.getAgent()

      const enrichment = await agent.planner.enrichSaga(params.script, {
        referenceStyleImage: series?.referenceStyleImage ?? undefined
      })

      // Map Vimax format to UI format
      const characterRegistry: Record<string, any> = {}
      for (const char of enrichment.characterRegistry || []) {
        characterRegistry[char.identifier] = {
          fullName: char.identifier.replace(/^@/, ''),
          description: `${char.physicalDescription || char.static_features}\n${char.personalityTraits?.join(', ') || ''}`,
          portraitPrompt: char.portrait_prompt || char.physicalDescription || char.static_features
        }
      }

      const locationRegistry: Record<string, any> = {}
      for (const loc of enrichment.locationRegistry || []) {
        locationRegistry[loc.id] = {
          name: loc.name,
          description: loc.atmosphere
        }
      }

      // Update series in database
      await this.seriesRepository.update(params.seriesId, {
        characterRegistry,
        locationRegistry,
        unresolvedThreads: enrichment.unresolvedThreads,
        roadmap: enrichment.roadmap,
        atmosphere: enrichment.atmosphere,
        visualEvolution: enrichment.visualEvolution,
        relationshipMap: enrichment.relationshipMap
      })

      return {
        success: true,
        seriesId: params.seriesId,
        characterRegistry,
        locationRegistry,
        atmosphere: enrichment.atmosphere
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to enrich saga'
      }
    }
  }
}
