import crypto from 'node:crypto'
import * as fs from 'node:fs'
import { VideoGenerationService } from '@/application/services/video-generation.service'
import { IUseCase } from '@/domain/types'

import { uploadBuffer } from '@/infrastructure/config/storage.config'
import { CREDIT_COSTS } from '@/infrastructure/config/video.config'
import { CharacterModelRepository } from '@/infrastructure/repositories/character-model.repository'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { SeriesRepository } from '@/infrastructure/repositories/series.repository'
import { SeriesVideoGenerator } from '../../../../plugins/sketch-pilot/src/core/generators/series-video-generator'
import type { SagaProductionService } from '../../../../plugins/sketch-pilot/src/plugins/vimax/services/saga-production.service'

/* ---------------- TYPES ---------------- */

type SeriesBible = {
  globalContext: string
  characterRegistry: Record<
    string,
    {
      fullName: string
      description: string
      portraitPrompt: string
      visualIdentity?: {
        age: string
        build: string
        colors: string[]
        signature: string
      }
      thumbnailUrl?: string
    }
  >
  locationRegistry: Record<
    string,
    {
      name: string
      description: string
      thumbnailUrl?: string
    }
  >
  videoGenre: string
  totalEpisodes: number
  suggestedTitles: string[]
  suggestedEpisodes: {
    number: number
    title: string
    hook: string
  }[]
}

type PrepareSeriesParams = {
  userId: string
  title: string
  seriesId?: string
  videoGenre?: string
  totalEpisodes?: number
  description?: string
  language?: string
  promptId?: string
  roadmapOnly?: boolean
  skipPortraits?: boolean
  aspectRatio?: string
  duration?: string
  characterModelId?: string
}

/* ---------------- UTILS ---------------- */

/* ---------------- USE CASE ---------------- */

export class PrepareSeriesUseCase extends IUseCase<PrepareSeriesParams, any> {
  private readonly creditsRepository = new CreditsRepository()
  private readonly seriesRepository = new SeriesRepository()
  private readonly characterModelRepository = new CharacterModelRepository()
  private readonly videoGenerationService = new VideoGenerationService()

  constructor(private readonly sagaProductionService: SagaProductionService) {
    super()
  }

  /* ---------------- HELPERS ---------------- */

  private normalizeRegistry(registry: Record<string, any>): Record<string, any> {
    const normalized: Record<string, any> = {}
    if (!registry) return normalized

    for (const [key, value] of Object.entries(registry)) {
      const normalizedKey = key.replace(/^@/, '')
      if (normalizedKey) {
        normalized[normalizedKey] = value
      }
    }
    return normalized
  }

  private mergeRegistries(existing: Record<string, any>, incoming: Record<string, any>): Record<string, any> {
    const merged = { ...existing }
    const normalizedIncoming = this.normalizeRegistry(incoming)

    for (const [key, value] of Object.entries(normalizedIncoming)) {
      const existingItem = SeriesVideoGenerator.findInRegistry(merged, key)
      if (existingItem) {
        // Merge LLM refinement but keep existing portrait/identity
        Object.assign(existingItem, value)
      } else {
        // Add new discovered entity
        merged[key] = value
      }
    }
    return merged
  }

  /* ---------------- LLM CORE ---------------- */

  private async generateSeriesLLM(params: PrepareSeriesParams): Promise<SeriesBible> {
    try {
      console.info('[PrepareSeries] Generating high-fidelity Bible using Vimax Agent...')

      const agent = this.sagaProductionService.getAgent()
      const idea = `Saga: ${params.title}. Description: ${params.description}`
      console.info('[IDEA]', idea)
      // Use the planner agent directly to get the structured result
      const sagaPlan = await agent.planner.planSaga(idea, {
        userId: params.userId,
        brainMode: 'stable', // Default to stable for bible preparation
        targetEpisodeCount: params.totalEpisodes
      })

      // Registries are already extracted by the planner agent
      const characterProfiles = sagaPlan.characterRegistry || []
      const locationStates = sagaPlan.locationRegistry || []

      console.info('[CHAR]', characterProfiles)
      console.info('[LOC]', locationStates)

      // Map Vimax format to the expected UI format
      const characterRegistry: Record<string, any> = {}
      for (const char of characterProfiles) {
        // Handle identifiers like @Elena or numerical fallbacks like @Personnage0
        const id = char.identifier || `@Personnage${char.index}`
        characterRegistry[id] = {
          fullName: id.replace(/^@/, ''),
          description: char.static_features || char.physicalDescription || '', // Support both formats
          portraitPrompt: char.portrait_prompt || char.static_features || char.physicalDescription || ''
        }
      }

      const locationRegistry: Record<string, any> = {}
      for (const loc of locationStates) {
        locationRegistry[loc.id] = {
          name: loc.name,
          description: loc.atmosphere
        }
      }

      // Map Vimax format to the expected UI format
      console.info('[SAGA PLAN]', sagaPlan)
      const result: SeriesBible = {
        globalContext: sagaPlan.script,
        characterRegistry: characterRegistry as any,
        locationRegistry: locationRegistry as any,
        suggestedEpisodes: (sagaPlan.episodes || []).map((ep: any, index: number) => ({
          number: index + 1,
          title: ep.title,
          hook: ep.summary
        })),
        suggestedTitles: (sagaPlan.episodes || []).map((ep: any) => ep.title),
        totalEpisodes: sagaPlan.episodes?.length || 5,
        videoGenre: (sagaPlan.intent as any)?.genre || 'cinematic'
      }

      return result
    } catch (error) {
      console.error('[PrepareSeries] ❌ Failed to generate saga bible:', error)
      throw error
    }
  }

  /* ---------------- EXECUTE ---------------- */

  async execute(params: PrepareSeriesParams) {
    try {
      const totalCost = CREDIT_COSTS.SAGA_PREPARATION

      const credits = await this.creditsRepository.ensureUserCredits(params.userId)
      const planLimit = await this.creditsRepository.getCurrentPlanLimit(params.userId)

      const totalAvailable = (credits?.extraCredits || 0) + Math.max(0, planLimit - (credits?.videosThisMonth || 0))

      if (totalAvailable < totalCost) {
        return { success: false, insufficientCredits: true }
      }
      const parsed = await this.generateSeriesLLM(params)

      await this.creditsRepository.consumeCredits(params.userId, totalCost, planLimit)

      // 🔄 NON-DESTRUCTIVE SYNC: Fetch existing context if extension
      let existingChars = {}
      let existingLocs = {}
      let seriesReferenceImage: string | undefined = undefined

      if (params.seriesId) {
        const current = await this.seriesRepository.findById(params.seriesId)
        if (current) {
          existingChars = (current.characterRegistry as Record<string, any>) || {}
          existingLocs = (current.locationRegistry as Record<string, any>) || {}
          seriesReferenceImage = current.thumbnailUrl || undefined
        }
      }

      const characterRegistry = this.mergeRegistries(existingChars, parsed.characterRegistry || {})
      const locationRegistry = this.mergeRegistries(existingLocs, parsed.locationRegistry || {})

      // --- [V50] AUTOMATED CHARACTER PORTRAITS ---
      if (!params.skipPortraits && !params.roadmapOnly) {
        const charactersToGenerate = Object.entries(characterRegistry).filter(
          ([, data]: [string, any]) => !data.thumbnailUrl
        )

        if (charactersToGenerate.length > 0) {
          console.info(`[PrepareSeries] 🎭 Generating ${charactersToGenerate.length} character portraits...`)
          const standardModels = await this.characterModelRepository.findAllStandard()
          const baseModelId = params.characterModelId || standardModels[0]?.id || 'default-model'

          for (const [name, data] of charactersToGenerate) {
            const charData = data as any
            try {
              // Build a strong descriptive prompt for the portrait
              const portraitPrompt = charData.description || name
              const imagePath = await this.videoGenerationService.generateCharacterImage({
                prompt: portraitPrompt,
                baseModelId,
                // Inject series global thumbnail for style consistency if it exists
                referenceImages: seriesReferenceImage ? [{ name: 'series-style', data: seriesReferenceImage }] : []
              })

              if (imagePath && fs.existsSync(imagePath)) {
                // Upload to MinIO
                const buffer = fs.readFileSync(imagePath)
                const safeName = name.replaceAll(/\s+/g, '-').replaceAll(/[^\w-]/g, '')
                const storagePath = `series/previews/characters/${safeName}-${Date.now()}.webp`
                const url = await uploadBuffer(storagePath, buffer, 'image/webp')

                charData.thumbnailUrl = url
                console.info(`[PrepareSeries] ✓ Portrait generated for ${name}: ${url}`)

                // Cleanup
                fs.unlinkSync(imagePath)
              }
            } catch (error) {
              console.error(`[PrepareSeries] ❌ Failed to generate portrait for ${name}:`, error)
            }
          }
        }
      }

      const seriesData = {
        title: params.title,
        description: params.description,
        globalContext: parsed.globalContext,
        characterRegistry,
        locationRegistry,
        plannedEpisodes: parsed.suggestedEpisodes,
        language: params.language || 'fr',
        videoGenre: parsed.videoGenre || params.videoGenre,
        totalEpisodes: String(parsed.totalEpisodes || params.totalEpisodes || 5),
        thumbnailUrl: Object.values(characterRegistry || {})[0]?.thumbnailUrl,
        aspectRatio: params.aspectRatio || '9:16',
        duration: params.duration || '60',
        characterModelId: params.characterModelId,
        status: 'draft' as const
      }
      console.info('[SERIE DATA]', seriesData)

      let seriesId = params.seriesId
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

      const finalResult = {
        ...parsed,
        characterRegistry,
        locationRegistry,
        seriesId
      }

      if (params.roadmapOnly) {
        return {
          success: true,
          seriesId,
          suggestedTitles: parsed.suggestedTitles,
          suggestedEpisodes: parsed.suggestedEpisodes
        }
      }

      return { success: true, ...finalResult }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed'
      }
    }
  }
}
