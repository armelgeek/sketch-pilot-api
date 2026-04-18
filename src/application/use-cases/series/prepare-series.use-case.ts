import crypto from 'node:crypto'
import * as fs from 'node:fs'
import process from 'node:process'
import { LLMServiceFactory, type LLMServiceConfig } from '@sketch-pilot/services/llm'
import { PromptService } from '@/application/services/prompt.service'
import { VideoGenerationService } from '@/application/services/video-generation.service'
import { IUseCase } from '@/domain/types'

import { uploadBuffer } from '@/infrastructure/config/storage.config'
import { CREDIT_COSTS } from '@/infrastructure/config/video.config'
import { CharacterModelRepository } from '@/infrastructure/repositories/character-model.repository'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { PromptRepository } from '@/infrastructure/repositories/prompt.repository'
import { SeriesRepository } from '@/infrastructure/repositories/series.repository'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'
import { SeriesVideoGenerator } from '../../../../plugins/sketch-pilot/src/core/generators/series-video-generator'
import { VimaxCharacterExtractor } from '../../../../plugins/sketch-pilot/src/core/vimax/VimaxCharacterExtractor'
import { VimaxCharacterFusion } from '../../../../plugins/sketch-pilot/src/core/vimax/VimaxCharacterFusion'
import { VimaxCharacterPortraitGenerator } from '../../../../plugins/sketch-pilot/src/core/vimax/VimaxCharacterPortraitGenerator'

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
      sideThumbnailUrl?: string
      backThumbnailUrl?: string
      modelId?: string
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
  vimaxArc?: { intent: string; script: string }
  episode1Plan?: any
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
  characterModelId?: string
  styleSuffix?: string
  userCharacterAnchors?: Record<string, string> // Map of @Handle -> URL/B64
}

/* ---------------- UTILS ---------------- */

/* ---------------- USE CASE ---------------- */

export class PrepareSeriesUseCase extends IUseCase<PrepareSeriesParams, any> {
  private readonly promptService = new PromptService(new PromptRepository())
  private readonly creditsRepository = new CreditsRepository()
  private readonly seriesRepository = new SeriesRepository()
  private readonly videoRepository = new VideoRepository()
  private readonly characterModelRepository = new CharacterModelRepository()
  private readonly videoGenerationService = new VideoGenerationService()

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

  private async mergeRegistries(
    existing: Record<string, any>,
    incoming: Record<string, any>
  ): Promise<Record<string, any>> {
    const llmService = await this.videoGenerationService.getLlmService()
    const fusion = new VimaxCharacterFusion(llmService)

    // Convert to Vimax internal format for fusion
    const sceneCharacters = Object.entries(incoming).map(([name, data], idx) => ({
      index: idx,
      identifier_in_scene: name,
      static_features: data.description || '',
      dynamic_features: data.dynamic_features || ''
    }))

    const merged = { ...existing }
    const fusionResults = await fusion.mergeCharactersAcrossScenes([
      {
        idx: 0,
        script: 'Merge existing bible with new brainstorming',
        characters: sceneCharacters
      }
    ])

    for (const result of fusionResults) {
      const handle = result.identifier_in_event.replace(/^@/, '')
      const existingItem = SeriesVideoGenerator.findInRegistry(merged, handle)
      if (existingItem) {
        Object.assign(existingItem, {
          description: result.static_features,
          dynamic_features: result.dynamic_features
        })
      } else {
        merged[handle] = {
          fullName: result.identifier_in_event,
          description: result.static_features,
          dynamic_features: result.dynamic_features
        }
      }
    }
    return merged
  }

  /* ---------------- LLM CORE ---------------- */

  private async generateSeriesLLM(params: PrepareSeriesParams): Promise<SeriesBible> {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY')
    }

    const llmConfig: LLMServiceConfig = {
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY
    }

    const llmService = await LLMServiceFactory.create(llmConfig)
    const genre = params.videoGenre || 'À extrapoler'

    // 1. Resolve Spec
    const spec = params.promptId ? await this.promptService.resolveSpec(params.promptId) : null

    let specContext = ''
    if (spec) {
      const sections = []
      if (spec.role) sections.push(`🎨 RÔLE :\n${spec.role}`)
      if (spec.context) sections.push(`🌍 CONTEXTE :\n${spec.context}`)
      if (spec.task) sections.push(`🎯 TÂCHE :\n${spec.task}`)
      if (spec.goals?.length > 0) sections.push(`🏁 OBJECTIFS :\n${(spec.goals as string[]).join('\n')}`)
      if (spec.structure?.length > 0) {
        const struct = Array.isArray(spec.structure) ? spec.structure.join(' → ') : spec.structure
        sections.push(`🏗️ STRUCTURE :\n${struct}`)
      }
      if (spec.rules?.length > 0)
        sections.push(`📜 RÈGLES :\n${(spec.rules as string[]).map((r) => `- ${r}`).join('\n')}`)
      if (spec.visualRules?.length > 0)
        sections.push(`👁️ RÈGLES VISUELLES :\n${(spec.visualRules as string[]).map((r) => `- ${r}`).join('\n')}`)
      if (spec.characterDescription) sections.push(`👤 DESCRIPTION PERSONNAGES :\n${spec.characterDescription}`)
      if (spec.instructions?.length > 0)
        sections.push(`💡 INSTRUCTIONS :\n${(spec.instructions as string[]).map((i) => `- ${i}`).join('\n')}`)

      specContext = `\n--- 📘 SPÉCIFICATION NARRATIVE SUR MESURE (${spec.name}) ---\n${sections.join('\n\n')}\n`
    }

    // 2. Resolve Saga Context (if extension)
    let extensionContext = ''
    let startEpisode = 1

    if (params.seriesId) {
      const seriesData = await this.seriesRepository.getSeriesContext(params.seriesId)
      if (seriesData) {
        startEpisode = seriesData.lastEpisodeNumber + 1
        const existingCharacters = Object.entries(seriesData.characterRegistry)
          .map(([name, data]) => `- ${name}: ${(data as any).description}`)
          .join('\n')

        extensionContext = `
        --- 🔄 CONTINUITÉ DE LA SAGA (EXTENSION) ---
        HISTOIRE JUSQU'ICI :
        ${seriesData.previousEpisodesContext || 'N/A'}

        SITUATION ACTUELLE (CLIFFHANGER ÉPISODE ${seriesData.lastEpisodeNumber}) :
        ${seriesData.lastCliffhanger ? (seriesData.lastCliffhanger as any).description : "Le démon s'est libéré et menace le village."}

        PERSONNAGES ÉTABLIS :
        ${existingCharacters}

        VOTRE MISSION : Brainstormer la SUITE (Saison 2 / Arc Suivant) en commençant DIRECTEMENT là où le suspens nous a laissé.
        L'épisode ${startEpisode} doit résoudre ou intensifier immédiatement le cliffhanger précédent.
        `
      }
    }

    // 3. Vimax Pass 0: Saga Planning via SeriesVideoGenerator
    const idea = `${params.title}\n${params.description || ''}${specContext}${extensionContext}`
    const dummyCtx = { seriesId: params.seriesId, userId: params.userId } as any
    const generator = new SeriesVideoGenerator({ apiKey: process.env.OPENAI_API_KEY } as any, dummyCtx)
    const seriesArc = await generator.generateSeriesArc(idea, llmService)

    console.info('✅ Arc Generated:', `${seriesArc.bible.slice(0, 200)}...`)
    console.info('📋 Roadmap:', seriesArc.roadmap.map((r: any) => `Ep ${r.episodeNumber}: ${r.title}`).join(', '))

    // 4. Vimax Character Extraction (Agentic)
    const charExtractor = new VimaxCharacterExtractor(llmService)
    const extractedChars = await charExtractor.extractCharacters(seriesArc.bible)

    // 5. Programmatic Assembly
    const characterRegistry: Record<string, any> = {}
    for (const char of extractedChars) {
      const handle = char.identifier_in_scene.replace(/^@/, '')
      characterRegistry[handle] = {
        fullName: char.identifier_in_scene,
        description: '',
        dynamic_features: '',
        portraitPrompt: `A high-quality cinematic portrait of ${char.identifier_in_scene}`
      }
    }

    const bible: SeriesBible = {
      globalContext: seriesArc.bible,
      characterRegistry,
      locationRegistry: {}, // Locations can be extracted later JIT if needed, or we could add a VimaxLocationExtractor
      videoGenre: genre,
      totalEpisodes: seriesArc.totalEpisodes,
      suggestedTitles: [],
      suggestedEpisodes: seriesArc.roadmap.map((r: any) => ({
        number: r.episodeNumber,
        title: r.title,
        hook: r.hook || ''
      }))
    }

    return {
      ...bible,
      vimaxArc: seriesArc
    }
  }

  /* ---------------- EXECUTE ---------------- */

  public async execute(params: PrepareSeriesParams) {
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
      if (params.seriesId) {
        const current = await this.seriesRepository.findById(params.seriesId)
        if (current) {
          existingChars = (current.characterRegistry as Record<string, any>) || {}
          existingLocs = (current.locationRegistry as Record<string, any>) || {}
        }
      }
      const characterRegistry = await this.mergeRegistries(existingChars, parsed.characterRegistry || {})
      const locationRegistry = await this.mergeRegistries(existingLocs, parsed.locationRegistry || {})

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
        characterModelId: params.characterModelId,
        roadmap: {
          arc: parsed.vimaxArc
        },
        status: 'draft' as const
      }

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

      if (params.roadmapOnly) {
        return {
          success: true,
          seriesId,
          suggestedTitles: parsed.suggestedTitles,
          suggestedEpisodes: parsed.suggestedEpisodes
        }
      }

      return { success: true, seriesId, ...parsed }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed'
      }
    }
  }

  /* ---------------- STREAM ---------------- */

  async *streamExecute(params: PrepareSeriesParams): AsyncIterable<any> {
    try {
      const totalCost = CREDIT_COSTS.SAGA_PREPARATION
      const credits = await this.creditsRepository.ensureUserCredits(params.userId)
      const planLimit = await this.creditsRepository.getCurrentPlanLimit(params.userId)
      const totalAvailable = (credits?.extraCredits || 0) + Math.max(0, planLimit - (credits?.videosThisMonth || 0))

      if (totalAvailable < totalCost) {
        yield { type: 'error', data: { error: 'Insufficient credits', insufficientCredits: true } }
        return
      }

      yield { type: 'progress', data: { status: 'analyzing', progress: 10 } }

      const parsed = await this.generateSeriesLLM(params)
      await this.creditsRepository.consumeCredits(params.userId, totalCost, planLimit)

      yield {
        type: 'progress',
        data: { status: params.skipPortraits ? 'finalizing' : 'generating_characters', progress: 60 }
      }

      // 🔄 SAGA BIBLE MERGE: Fetch existing context if extension
      let existingChars: Record<string, any> = {}
      let existingLocs: Record<string, any> = {}

      if (params.seriesId) {
        const current = await this.seriesRepository.findById(params.seriesId)
        if (current) {
          existingChars = (current.characterRegistry as Record<string, any>) || {}
          existingLocs = (current.locationRegistry as Record<string, any>) || {}
        }
      }
      const characterRegistry = await this.mergeRegistries(existingChars, parsed.characterRegistry || {})
      const locationRegistry = await this.mergeRegistries(existingLocs, parsed.locationRegistry || {})

      // --- [V50] AUTOMATED CHARACTER PORTRAITS ---
      if (!params.skipPortraits && !params.roadmapOnly) {
        // Inject user anchors into registry before generation
        if (params.userCharacterAnchors) {
          for (const [handle, url] of Object.entries(params.userCharacterAnchors)) {
            const normalizedHandle = handle.replace(/^@/, '')
            const charData = characterRegistry[normalizedHandle] || characterRegistry[handle]
            if (charData) {
              console.info(`[PrepareSeries] ⚓ AutoCameo: Anchoring ${handle} with user photo.`)
              charData.thumbnailUrl = url
            }
          }
        }

        const charactersToGenerate = Object.entries(characterRegistry).filter(
          ([, data]: [string, any]) => !data.thumbnailUrl
        )

        if (charactersToGenerate.length > 0) {
          console.info(`[PrepareSeries] 🎭 Generating ${charactersToGenerate.length} character portraits...`)
          const standardModels = await this.characterModelRepository.findAllStandard()
          const baseModelId = params.characterModelId || standardModels[0]?.id || 'default-model'

          let completedChars = 0
          const imageService = await this.videoGenerationService.getImageService({
            characterModelId: baseModelId
          })
          const portraitGenerator = new VimaxCharacterPortraitGenerator(imageService)

          for (const [name, data] of charactersToGenerate) {
            const charData = data as any
            try {
              yield {
                type: 'progress',
                data: {
                  status: 'generating_characters',
                  progress: 60 + Math.round((completedChars / charactersToGenerate.length) * 20),
                  message: `Génération du portrait de ${name}...`
                }
              }

              const portraitPrompt = charData.description || name
              const modelSheet = await portraitGenerator.generateModelSheet(
                name,
                portraitPrompt,
                params.styleSuffix || '',
                () => {
                  // Optional: emit sub-progress inside the stream if needed
                },
                charData.cameoPhotoUrl // [V52] AutoCameo
              )

              // Upload all 3 views
              const safeName = name.replaceAll(/\s+/g, '-').replaceAll(/[^\w-]/g, '')
              const timestamp = Date.now()

              // 1. Front
              if (modelSheet.front.startsWith('http')) {
                charData.thumbnailUrl = modelSheet.front
                charData.visualDNA = `[AUTOCAMEO] Character must match reference: ${modelSheet.front}`
              } else {
                const frontBuffer = fs.readFileSync(modelSheet.front)
                const frontUrl = await uploadBuffer(
                  `series/previews/characters/${safeName}-front-${timestamp}.webp`,
                  frontBuffer,
                  'image/webp'
                )
                charData.thumbnailUrl = frontUrl
                fs.unlinkSync(modelSheet.front)
              }

              // 2. Side
              const sideBuffer = fs.readFileSync(modelSheet.side)
              const sideUrl = await uploadBuffer(
                `series/previews/characters/${safeName}-side-${timestamp}.webp`,
                sideBuffer,
                'image/webp'
              )
              charData.sideThumbnailUrl = sideUrl
              fs.unlinkSync(modelSheet.side)

              // 3. Back
              const backBuffer = fs.readFileSync(modelSheet.back)
              const backUrl = await uploadBuffer(
                `series/previews/characters/${safeName}-back-${timestamp}.webp`,
                backBuffer,
                'image/webp'
              )
              charData.backThumbnailUrl = backUrl
              fs.unlinkSync(modelSheet.back)

              charData.modelId = baseModelId
              console.info(`[PrepareSeries] ✓ Model sheet generated for ${name}`)
            } catch (error) {
              console.error(`[PrepareSeries] ❌ Failed to generate portrait for ${name}:`, error)
            }
            completedChars++
          }
        }
      }

      // --- [V51] AUTOMATED LOCATION MASTERS ---
      if (!params.roadmapOnly) {
        Object.entries(locationRegistry).filter(([, data]: [string, any]) => !data.thumbnailUrl)
      }

      // Persist Draft
      const seriesData = {
        title: params.title,
        description: params.description,
        globalContext: parsed.globalContext,
        characterRegistry,
        locationRegistry,
        plannedEpisodes: parsed.suggestedEpisodes,
        language: params.language || 'fr',
        videoGenre: parsed.videoGenre || params.videoGenre,
        totalEpisodes: String(parsed.totalEpisodes),
        aspectRatio: params.aspectRatio || '9:16',
        characterModelId: params.characterModelId,
        roadmap: {
          arc: parsed.vimaxArc
        },
        status: 'draft' as const
      }

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

      yield { type: 'series_id', data: { id: seriesId } }

      yield { type: 'progress', data: { status: 'finalizing', progress: 90 } }
      if (params.roadmapOnly) {
        yield {
          type: 'final',
          data: { suggestedTitles: parsed.suggestedTitles, suggestedEpisodes: parsed.suggestedEpisodes }
        }
      } else {
        yield { type: 'final', data: parsed }
      }
    } catch (error) {
      yield {
        type: 'error',
        data: { error: error instanceof Error ? error.message : 'Streaming failed' }
      }
    }
  }
}
