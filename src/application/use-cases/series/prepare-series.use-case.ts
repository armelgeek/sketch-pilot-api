import process from 'node:process'
import { LLMServiceFactory, type LLMServiceConfig } from '@sketch-pilot/services/llm'
import pLimit from 'p-limit'
import { PromptService } from '@/application/services/prompt.service'
import { GenerateCharacterImageUseCase } from '@/application/use-cases/character-model/generate-character-image.use-case'
import { IUseCase } from '@/domain/types'
import { CREDIT_COSTS } from '@/infrastructure/config/video.config'

import { CharacterModelRepository } from '@/infrastructure/repositories/character-model.repository'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { PromptRepository } from '@/infrastructure/repositories/prompt.repository'
import { SeriesRepository } from '@/infrastructure/repositories/series.repository'
import { SeriesVideoGenerator } from '../../../../plugins/sketch-pilot/src/core/generators/series-video-generator'
import { GenerateLocationImageUseCase } from './generate-location-image.use-case'

/* ---------------- TYPES ---------------- */

type SeriesBible = {
  globalContext: string
  visualStyleGuide: string
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
  visualStyleModelId?: string
  skipPortraits?: boolean
  roadmapOnly?: boolean
  aspectRatio?: string
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
  private readonly generateCharacterImageUseCase = new GenerateCharacterImageUseCase()
  private readonly generateLocationImageUseCase = new GenerateLocationImageUseCase()
  private readonly seriesRepository = new SeriesRepository()
  private readonly characterModelRepository = new CharacterModelRepository()

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

    // 1.7. Resolve Visual Style Model Context
    let styleContext = ''
    if (params.visualStyleModelId) {
      const styleModel = await this.characterModelRepository.findById(params.visualStyleModelId)
      if (styleModel) {
        styleContext = `
        --- 🎨 DIRECTIVES DE STYLE VISUEL (${styleModel.name}) ---
        DESCRIPTION DU STYLE : ${styleModel.description || 'Style visuel cohérent.'}
        DIRECTIVES GÉNÉRALES : Vous DEVEZ décrire les personnages et les lieux en respectant STRICTEMENT ce style visuel. 
        Si le style est par exemple "Stickman", décrivez les personnages comme des bonshommes allumettes.
        `
      }
    }

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
${specContext}
${styleContext}
`

    const epCount = params.totalEpisodes || 5
    const genre = params.videoGenre || 'À extrapoler'

    const userPrompt = `
CONCEPT : "${params.title}"
GENRE : "${genre}"
NOMBRE D'ÉPISODES À GÉNÉRER : ${epCount}
DESCRIPTION : ${params.description || 'À extrapoler'}
${extensionContext}

FORMAT JSON :

{
  "globalContext": "string (Description globale de l'univers)",
  "visualStyleGuide": "string (Directives visuelles pour l'IA)",

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

      /* 🔥 PARALLEL IMAGE GEN (Characters & Locations) */
      if (!params.skipPortraits && params.visualStyleModelId && (parsed.characterRegistry || parsed.locationRegistry)) {
        const limit = pLimit(2)
        const generationTasks = []

        // 1. Characters
        if (parsed.characterRegistry) {
          generationTasks.push(
            ...Object.entries(parsed.characterRegistry).map(([, char]) =>
              limit(async () => {
                if (!char.portraitPrompt) return
                const result = await this.generateCharacterImageUseCase.execute({
                  userId: params.userId,
                  baseModelId: params.visualStyleModelId!,
                  prompt: char.portraitPrompt,
                  visualStyleGuide: parsed.visualStyleGuide
                })
                if (result.success && result.imageUrl) {
                  char.thumbnailUrl = result.imageUrl
                }
              })
            )
          )
        }

        // 2. Locations
        if (parsed.locationRegistry) {
          generationTasks.push(
            ...Object.entries(parsed.locationRegistry).map(([name, loc]) =>
              limit(async () => {
                if (!loc.description) return
                // Mock seriesId for now if it doesn't exist yet, but we'll have it soon
                // Better pass 'system' to bypass credit check if we already deducted SAGA_PREPARATION credits
                const result = await this.generateLocationImageUseCase.execute({
                  userId: 'system', // Bypass individual credit check
                  seriesId: params.seriesId || 'temp-id', // Will be updated later if needed
                  locationName: name,
                  visualStyleGuide: parsed.visualStyleGuide,
                  visualStyleModelId: params.visualStyleModelId,
                  videoGenre: parsed.videoGenre || params.videoGenre
                })

                if (result.success && result.thumbnailUrl) {
                  loc.thumbnailUrl = result.thumbnailUrl
                }
              })
            )
          )
        }

        await Promise.all(generationTasks)
      }

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
        visualStyleModelId: params.visualStyleModelId,
        visualStyleGuide: parsed.visualStyleGuide,
        thumbnailUrl: Object.values(characterRegistry || {})[0]?.thumbnailUrl,
        aspectRatio: params.aspectRatio || '9:16',
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

      yield { type: 'progress', data: { status: 'generating_characters', progress: 60 } }

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
        visualStyleModelId: params.visualStyleModelId,
        visualStyleGuide: parsed.visualStyleGuide,
        thumbnailUrl: Object.values(characterRegistry || {})[0]?.thumbnailUrl,
        aspectRatio: params.aspectRatio || '9:16',
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

      if (!params.skipPortraits && params.visualStyleModelId && (parsed.characterRegistry || parsed.locationRegistry)) {
        // 1. Characters
        if (parsed.characterRegistry) {
          for (const [name, char] of Object.entries(parsed.characterRegistry)) {
            if (!char.portraitPrompt) continue

            const result = await this.generateCharacterImageUseCase.execute({
              userId: params.userId,
              baseModelId: params.visualStyleModelId!,
              prompt: char.portraitPrompt,
              visualStyleGuide: parsed.visualStyleGuide
            })

            if (result.success && result.imageUrl) {
              char.thumbnailUrl = result.imageUrl
              yield { type: 'character_portrait', data: { name, imageUrl: result.imageUrl } }
            }
          }
        }

        // 2. Locations
        if (parsed.locationRegistry) {
          for (const [name, loc] of Object.entries(parsed.locationRegistry)) {
            if (!loc.description) continue

            const result = await this.generateLocationImageUseCase.execute({
              userId: 'system',
              seriesId: seriesId!,
              locationName: name,
              visualStyleGuide: parsed.visualStyleGuide,
              visualStyleModelId: params.visualStyleModelId,
              videoGenre: parsed.videoGenre || params.videoGenre
            })

            if (result.success && result.thumbnailUrl) {
              loc.thumbnailUrl = result.thumbnailUrl
              yield { type: 'location_portrait', data: { name, imageUrl: result.thumbnailUrl } }
            }
          }
        }
      }

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
