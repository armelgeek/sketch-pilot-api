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
  characterModelId?: string
}

/* ---------------- UTILS ---------------- */

function safeJsonParse(text: string): SeriesBible {
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Invalid JSON response from LLM')
    return JSON.parse(match[0])
  }
}

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
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY')
    }

    const llmConfig: LLMServiceConfig = {
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY
    }

    const llmService = await LLMServiceFactory.create(llmConfig)

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

    // 1.7. Visual Style Models removed for pure image-anchoring experiment.

    // 1.8. Explicit Style Guides removed.

    // 2. Resolve Saga Context (if extension)
    let extensionContext = ''
    let startEpisode = 1
    let existingCharacters = ''

    if (params.seriesId) {
      const seriesData = await this.seriesRepository.getSeriesContext(params.seriesId)
      if (seriesData) {
        startEpisode = seriesData.lastEpisodeNumber + 1
        existingCharacters = Object.entries(seriesData.characterRegistry)
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

    /* ---------------- PROMPT V2 ---------------- */

    const systemPrompt = `
Tu es un moteur de génération de séries automatisé.
${params.seriesId ? 'INTERDICTION : Ne réinventez pas la série. Vous générez une EXTENSION de la roadmap existante.' : ''}

MISSION :
Créer une Bible de série STRUCTURÉE, COHÉRENTE et EXPLOITABLE.

RÈGLES :
- JSON STRICT UNIQUEMENT
- AUCUN texte hors JSON
- FORMAT RESPECTÉ

PROCESSUS :
1. Génération
2. Auto-validation + correction

PERSONNAGES :
- 3 à 5 personnages
- FULL BODY SHOT obligatoire
- cohérence visuelle totale
- IDENTIFIANT UNIQUE OBLIGATOIRE : La clé du registre DOIT être un handle commençant par @ (ex: "@Victor").
- LIEUX : Registre des lieux avec handle unique @ obligatoire (ex: "@Maison_Victor").

LANGUE : ${params.language || 'fr'}
${params.roadmapOnly ? 'MISSION SPECIFIQUE : RÉGÉNÉRER UNIQUEMENT LE PLANNING DES ÉPISODES (suggestedTitles et suggestedEpisodes). Gardez le même univers.' : ''}
`

    const epCount = params.totalEpisodes || 5
    const genre = params.videoGenre || 'À extrapoler'

    const userPrompt = `
CONCEPT : "${params.title}"
GENRE : "${genre}"
NOMBRE D'ÉPISODES À GÉNÉRER : ${epCount}
DESCRIPTION : ${params.description || 'À extrapoler'}
${specContext}
${extensionContext}

FORMAT JSON :

{
  "globalContext": "string (Description globale de l'univers)",

  "characterRegistry": {
    "@Handle": {
      "fullName": "Prénom Nom",
      "description": "string",
      "portraitPrompt": "FULL BODY SHOT...",
      "visualIdentity": {
        "age": "string",
        "build": "string",
        "colors": ["string"],
        "signature": "string"
      }
    }
  },

  "locationRegistry": {
    "@LocationID": {
      "name": "Nom du lieu",
      "description": "Description visuelle DÉTAILLÉE servant de Master Background (matériaux, couleurs, éclairage, objets clés)"
    }
  },

  "videoGenre": "${genre}",
  "totalEpisodes": ${params.seriesId ? 'Laissez le total actuel' : epCount},

  "suggestedTitles": ["Titre Episode ${startEpisode}", "Titre Episode ${startEpisode + 1}", ...],

  "suggestedEpisodes": [
    { "number": ${startEpisode}, "title": "string", "hook": "string" },
    { "number": ${startEpisode + 1}, "title": "string", "hook": "string" },
    ...
  ]
}

RÈGLES NARRATIVES ROADMAP :
- JSON valide obligatoire
- Générez EXACTEMENT ${epCount} épisodes dans "suggestedEpisodes" en commençant à l'épisode ${startEpisode}
- Générez EXACTEMENT ${epCount} titres dans "suggestedTitles"
- ${params.seriesId ? 'RÉUTILISEZ les personnages de la liste "PERSONNAGES ÉTABLIS" ci-dessus dans le registre. N\'en inventez de nouveaux que si nécessaire.' : '3 à 5 personnages dans "characterRegistry"'}
- Le "hook" doit être une description précise, INTRIGANTE et ATMOSPHÉRIQUE du tournant narratif de l'épisode.
- 🚨 INTERDICTION FORMELLE : Les hooks ne doivent PAS être des résumés secs (ex: "Le héros arrive"). 
- 🎬 STYLE : Favorisez le "In Media Res", les dilemmes moraux ou les découvertes sensorielles (ex: "L'odeur de soufre sature l'air alors que Victor découvre...").
`

    const response = await llmService.generateContent(userPrompt, systemPrompt, 'application/json')

    return safeJsonParse(response.replaceAll(/```json|```/g, '').trim())
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
      if (params.seriesId) {
        const current = await this.seriesRepository.findById(params.seriesId)
        if (current) {
          existingChars = (current.characterRegistry as Record<string, any>) || {}
          existingLocs = (current.locationRegistry as Record<string, any>) || {}
        }
      }

      const characterRegistry = this.mergeRegistries(existingChars, parsed.characterRegistry || {})
      const locationRegistry = this.mergeRegistries(existingLocs, parsed.locationRegistry || {})

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

          let completedChars = 0
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
            completedChars++
          }
        }
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
