import process from 'node:process'
import { LLMServiceFactory, type LLMServiceConfig } from '@sketch-pilot/services/llm'
import { CREDIT_COSTS } from '@/infrastructure/config/video.config'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'

export interface SuggestSeriesConceptResponse {
  success: boolean
  title?: string
  videoGenre?: string
  description?: string
  insufficientCredits?: boolean
  error?: string
}

const creditsRepository = new CreditsRepository()

export class SuggestSeriesConceptUseCase {
  async execute(userId: string): Promise<SuggestSeriesConceptResponse> {
    try {
      const totalCost = CREDIT_COSTS.SAGA_CONCEPT_SUGGESTION
      const credits = await creditsRepository.ensureUserCredits(userId)
      const planLimit = await creditsRepository.getCurrentPlanLimit(userId)
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

      const systemPrompt = `Vous êtes un expert en narration transmédia et en création de sagas virales. 
Votre but est de suggérer un CONCEPT DE SAGA original, immersif et percutant qui servira de "Prompt" pour générer une série entière.
Répondez UNIQUEMENT en JSON avec les champs : title, videoGenre, description.`

      const userPrompt = `Générez un CONCEPT DE SAGA unique pour une série de vidéos courtes (Shorts/Reels).
Le concept doit être extrêmement intrigant et servir de base narrative solide.
L'idée peut être dans n'importe quel genre (Horreur, Science-Fiction, Histoire, Fantasy, Psychologique).

Format JSON :
{
  "title": "Un concept ou une accroche percutante qui servira de prompt",
  "videoGenre": "Genre précis",
  "description": "Une description de 2-3 phrases qui pose le concept et l'intrigue majeure."
}`

      const response = await llmService.generateContent(userPrompt, systemPrompt, 'application/json')
      const parsed = JSON.parse(response)

      // Deduct credits
      const { planConsumed, extraConsumed } = await creditsRepository.consumeCredits(userId, totalCost, planLimit)
      await creditsRepository.addTransaction({
        userId,
        type: 'consumption_saga_suggestion',
        amount: -totalCost,
        metadata: { planConsumed, extraConsumed }
      })

      return {
        success: true,
        title: parsed.title,
        videoGenre: parsed.videoGenre,
        description: parsed.description
      }
    } catch (error) {
      console.error('Error suggesting series concept:', error)
      return {
        success: false,
        title: "L'Ombre des Temps",
        videoGenre: 'Horreur Historique',
        description:
          'Un voyageur temporel se retrouve coincé dans une époque où les légendes sont réelles et mortelles.',
        error: 'Impossible de générer une idée en direct, voici une suggestion par défaut.'
      }
    }
  }
}
