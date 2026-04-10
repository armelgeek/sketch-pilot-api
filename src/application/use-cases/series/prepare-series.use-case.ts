import process from 'node:process'
import { LLMServiceFactory, type LLMServiceConfig } from '@sketch-pilot/services/llm'
import { PromptService } from '@/application/services/prompt.service'
import { IUseCase } from '@/domain/types'
import { CREDIT_COSTS } from '@/infrastructure/config/video.config'
import { CharacterModelRepository } from '@/infrastructure/repositories/character-model.repository'

import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { PromptRepository } from '@/infrastructure/repositories/prompt.repository'

type PrepareSeriesParams = {
  userId: string
  title: string
  description?: string
  language?: string
  promptId?: string
}

type PrepareSeriesResponse = {
  success: boolean
  globalContext?: string
  characterRegistry?: Record<string, { description: string; modelId?: string; portraitPrompt?: string }>
  videoGenre?: string
  totalEpisodes?: number
  suggestedTitles?: string[]
  suggestedEpisodes?: { number: number; title: string; hook: string }[]
  insufficientCredits?: boolean
  error?: string
}

export class PrepareSeriesUseCase extends IUseCase<PrepareSeriesParams, PrepareSeriesResponse> {
  private readonly promptService = new PromptService(new PromptRepository())
  private readonly modelRepository = new CharacterModelRepository()

  private readonly creditsRepository = new CreditsRepository()

  async execute({
    userId,
    title,
    description,
    language = 'fr',
    promptId
  }: PrepareSeriesParams): Promise<PrepareSeriesResponse> {
    try {
      const totalCost = CREDIT_COSTS.SAGA_PREPARATION
      const credits = await this.creditsRepository.ensureUserCredits(userId)
      const planLimit = await this.creditsRepository.getCurrentPlanLimit(userId)
      const totalAvailable = (credits?.extraCredits || 0) + Math.max(0, planLimit - (credits?.videosThisMonth || 0))

      if (totalAvailable < totalCost) {
        return {
          success: false,
          insufficientCredits: true,
          error: `Credits insuffisants. Requis: ${totalCost}, Disponible: ${totalAvailable}`
        }
      }

      const llmConfig: LLMServiceConfig = {
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY || ''
      }

      if (!llmConfig.apiKey) {
        throw new Error('AI API Key not configured.')
      }

      const llmService = await LLMServiceFactory.create(llmConfig)

      // Resolve Spec if promptId is provided
      const spec = promptId ? await this.promptService.resolveSpec(promptId) : null
      const specContext = spec
        ? `\nRÈGLES DE STYLE/GENRE (Spécification: ${spec.name}) :\n${spec.instructions.join('\n')}\n${spec.context || ''}`
        : ''

      const systemPrompt = `Vous êtes un expert en narration cinématographique et en "Sagas" transmédias.
            Votre tâche est de créer les fondations narratives (Bible) d'une nouvelle série à partir de son titre.
            Le contenu doit être inspirant, structuré et propice à une génération d'épisodes riche en suspense.
            ${specContext}

            RÈGLES :
            1. Langue : ${language}.
            2. Répondez exclusivement au format JSON.
            3. Le bloc "globalContext" doit décrire l'univers, le ton, les enjeux et les règles du monde.
            4. Le bloc "characterRegistry" doit contenir 3-5 personnages principaux fascinants.
            5. Décrivez précisément chaque personnage par son rôle et sa personnalité.
            6. Fournissez un "portraitPrompt" consistant (description physique détaillée pour génération d'image) pour chaque personnage.
            7. Le bloc "videoGenre" doit suggérer une niche/genre précis.
            8. Le bloc "totalEpisodes" doit suggérer un nombre total d'épisodes pour cette saga (entre 6 et 12).
            9. Le bloc "suggestedTitles" doit proposer 5 titres alternatifs percutants adaptés au genre et à la spécification.
            10. Le bloc "suggestedEpisodes" doit proposer les 5 premiers épisodes (Titre, Accroche narrative).`

      const userPrompt = `Titre actuel de la Saga : "${title}"
            Description initiale : ${description || 'À inventer'}

            Générez la Bible narrative complète au format JSON :
            {
            "globalContext": "...",
            "characterRegistry": {
                "Nom Personnage": { 
                "description": "...", 
                "portraitPrompt": "Description physique pour IA..." 
                }
            },
            "videoGenre": "...",
            "totalEpisodes": 10,
            "suggestedTitles": ["...", "...", "...", "...", "..."],
            "suggestedEpisodes": [
                { "number": 1, "title": "...", "hook": "..." }
            ]
            }`

      const response = await llmService.generateContent(userPrompt, systemPrompt, 'application/json')
      const parsed = JSON.parse(response.replaceAll(/```json|```/g, '').trim())

      // Deduct credits
      const { planConsumed, extraConsumed } = await this.creditsRepository.consumeCredits(userId, totalCost, planLimit)
      await this.creditsRepository.addTransaction({
        userId,
        type: 'consumption_saga_preparation',
        amount: -totalCost,
        metadata: { planConsumed, extraConsumed }
      })

      return {
        success: true,
        globalContext: parsed.globalContext,
        characterRegistry: parsed.characterRegistry,
        videoGenre: parsed.videoGenre,
        totalEpisodes: parsed.totalEpisodes,
        suggestedTitles: parsed.suggestedTitles,
        suggestedEpisodes: parsed.suggestedEpisodes
      }
    } catch (error) {
      console.error('[PrepareSeriesUseCase] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to prepare series context'
      }
    }
  }

  async *streamExecute({
    userId,
    title,
    description,
    language = 'fr',
    promptId
  }: PrepareSeriesParams): AsyncIterable<{ type: string; data: any }> {
    try {
      const totalCost = CREDIT_COSTS.SAGA_PREPARATION
      const credits = await this.creditsRepository.ensureUserCredits(userId)
      const planLimit = await this.creditsRepository.getCurrentPlanLimit(userId)
      const totalAvailable = (credits?.extraCredits || 0) + Math.max(0, planLimit - (credits?.videosThisMonth || 0))

      if (totalAvailable < totalCost) {
        yield { type: 'error', data: { error: 'Credits insuffisants', insufficientCredits: true } }
        return
      }

      yield { type: 'progress', data: { status: 'analyzing', progress: 10, message: 'Analyse de la thématique...' } }

      const llmConfig: LLMServiceConfig = {
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY || ''
      }

      const llmService = await LLMServiceFactory.create(llmConfig)
      const spec = promptId ? await this.promptService.resolveSpec(promptId) : null
      const specContext = spec
        ? `\nRÈGLES DE STYLE/GENRE (Spécification: ${spec.name}) :\n${spec.instructions.join('\n')}\n${spec.context || ''}`
        : ''

      yield {
        type: 'progress',
        data: { status: 'creating_bible', progress: 30, message: 'Rédaction de la Bible Narrative...' }
      }

      const systemPrompt = `Vous êtes un expert en narration cinématographique. 
            Répondez exclusivement au format JSON.
            ${specContext}`

      const userPrompt = `Titre actuel de la Saga : "${title}"
            Description initiale : ${description || 'À inventer'}
            Langue : ${language}.

            Générez la Bible narrative complète au format JSON suivant :
            {
              "globalContext": "...",
              "characterRegistry": { "Name": { "description": "...", "portraitPrompt": "..." } },
              "videoGenre": "...",
              "totalEpisodes": 10,
              "suggestedTitles": ["...", "..."],
              "suggestedEpisodes": [{ "number": 1, "title": "...", "hook": "..." }]
            }`

      const response = await llmService.generateContent(userPrompt, systemPrompt, 'application/json')

      yield {
        type: 'progress',
        data: { status: 'finalizing', progress: 90, message: 'Finalisation du casting et de la roadmap...' }
      }

      const cleanJson = response.replaceAll(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleanJson)

      // Deduct credits at the end of successful generation
      const { planConsumed, extraConsumed } = await this.creditsRepository.consumeCredits(userId, totalCost, planLimit)
      await this.creditsRepository.addTransaction({
        userId,
        type: 'consumption_saga_preparation',
        amount: -totalCost,
        metadata: { planConsumed, extraConsumed }
      })

      yield { type: 'final', data: parsed }
    } catch (error) {
      console.error('[PrepareSeriesUseCase] Stream error:', error)
      yield { type: 'error', data: { error: error instanceof Error ? error.message : 'Streaming failed' } }
    }
  }
}
