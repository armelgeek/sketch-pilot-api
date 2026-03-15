/* eslint-disable node/prefer-global/process */
import { LLMServiceFactory } from '@sketch-pilot/services/llm'
import { IUseCase } from '@/domain/types'
import { CREDIT_COSTS, PLAN_MONTHLY_LIMITS } from '@/infrastructure/config/video.config'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'

type SuggestTopicsParams = {
  userId: string
  planId?: string
  options: {
    language?: string
    videoType?: string
    videoGenre?: string
    aspectRatio?: string
    themeName?: string
    themeDescription?: string
    goals?: string[]
  }
}

type SuggestTopicsResponse = {
  success: boolean
  topics?: string[]
  error?: string
  insufficientCredits?: boolean
}

const creditsRepository = new CreditsRepository()

export class SuggestTopicsUseCase extends IUseCase<SuggestTopicsParams, SuggestTopicsResponse> {
  async execute({ userId, planId, options }: SuggestTopicsParams): Promise<SuggestTopicsResponse> {
    try {
      const cost = (CREDIT_COSTS as any).SUGGEST_TOPIC || 5

      // 1. Check credits
      const credits = await creditsRepository.ensureUserCredits(userId)
      const sub = await creditsRepository.getActiveSubscription(userId)
      const actualPlan = sub?.plan || planId || 'free'
      const planLimit = PLAN_MONTHLY_LIMITS[actualPlan] ?? PLAN_MONTHLY_LIMITS.free

      const consumedThisMonth = credits?.videosThisMonth ?? 0
      const extraCredits = credits?.extraCredits ?? 0

      const availablePlanCredits = planLimit === -1 ? Infinity : Math.max(0, planLimit - consumedThisMonth)
      const totalAvailable = availablePlanCredits + extraCredits

      if (totalAvailable < cost) {
        return {
          success: false,
          insufficientCredits: true,
          error: `Crédits insuffisants. Cette action requiert ${cost} crédits. Vous en avez ${totalAvailable}.`
        }
      }

      // 2. Consume credits
      const { planConsumed, extraConsumed } = await creditsRepository.consumeCredits(userId, cost, planLimit)

      await creditsRepository.addTransaction({
        userId,
        type: 'suggest_topic',
        amount: -cost,
        metadata: {
          planConsumed,
          extraConsumed,
          options
        }
      })

      // 3. Generate topics using LLM
      const apiKey = process.env.GEMINI_API_KEY || ''
      if (!apiKey) throw new Error('GEMINI_API_KEY not configured')

      const llm = LLMServiceFactory.create({
        provider: 'gemini',
        apiKey
      })

      const language = options.language || 'fr-FR'
      const type = options.videoType || 'général'
      const genre = options.videoGenre || 'storytelling'
      const themeName = options.themeName || type
      const themeDescription = options.themeDescription || ''
      const goals = options.goals && options.goals.length > 0 ? options.goals.join(', ') : ''

      const prompt = `Crée 3 idées de sujets de vidéos courtes (format ${options.aspectRatio || '9:16'}) basées sur le thème suivant :
      Nom du Thème : "${themeName}"
      Description du Thème : "${themeDescription}"
      Objectifs/Concept : "${goals}"
      Type de Contenu : "${type}"
      Genre : "${genre}"
      Langue : ${language}
      
      Instructions CRITIQUES :
      1. Les sujets doivent être parfaitement alignés avec l'univers et le style du thème "${themeName}".
      2. Le ton doit correspondre au genre "${genre}".
      3. **INTERDICTION FORMELLE** : Ne reprends JAMAIS de termes techniques, noms de fichiers ou identifiants internes comme "${themeName}", "Narrative System", "Prompt", "Template" ou "System" dans les titres suggérés. Ces noms sont des métadonnées techniques.
      4. À la place, utilise les "Objectifs/Concept" (${goals}) et la "Description" (${themeDescription}) pour créer des titres qui parlent aux humains.
      5. Sois créatif, accrocheur (format Shorts/TikTok/Reels) et varie les angles d'approche.
      
      Renvoie UNIQUEMENT un tableau JSON de 3 chaînes de caractères.
      Chaque chaîne doit être un titre ou sujet "prêt à l'emploi".
      Exemple: ["Comment survivre à la fin du monde", "3 secrets pour un café parfait", "L'histoire oubliée de la Lune"]`

      const response = await llm.generateContent(
        prompt,
        'Tu es un expert en création de contenu viral et en storytelling.',
        'application/json'
      )

      // Clean up response (sometimes LLM wraps it in markdown blocks)
      const cleanJson = response.replaceAll(/```json\n?|\n?```/g, '').trim()
      const topics = JSON.parse(cleanJson)

      return {
        success: true,
        topics
      }
    } catch (error) {
      console.error('[SuggestTopicsUseCase] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to suggest topics'
      }
    }
  }
}
