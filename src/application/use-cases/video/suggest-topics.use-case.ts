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
    duration?: number
  }
}

type VideoIdea = {
  title: string
  script: string
}

type SuggestTopicsResponse = {
  success: boolean
  topics?: VideoIdea[]
  error?: string
  insufficientCredits?: boolean
}

const creditsRepository = new CreditsRepository()

export class SuggestTopicsUseCase extends IUseCase<SuggestTopicsParams, SuggestTopicsResponse> {
  async execute({ userId, planId, options }: SuggestTopicsParams): Promise<SuggestTopicsResponse> {
    try {
      const cost = (CREDIT_COSTS as any).SUGGEST_TOPIC || 5

      // 1. Check available credits
      const credits = await creditsRepository.ensureUserCredits(userId)
      const subscription = await creditsRepository.getActiveSubscription(userId)
      const currentPlan = subscription?.plan || planId || 'free'
      const planLimit = PLAN_MONTHLY_LIMITS[currentPlan] ?? PLAN_MONTHLY_LIMITS.free

      const usedThisMonth = credits?.videosThisMonth ?? 0
      const extraCredits = credits?.extraCredits ?? 0

      const availablePlanCredits = planLimit === -1 ? Infinity : Math.max(0, planLimit - usedThisMonth)
      const totalAvailableCredits = availablePlanCredits + extraCredits

      if (totalAvailableCredits < cost) {
        return {
          success: false,
          insufficientCredits: true,
          error: `Insufficient credits. This action requires ${cost} credits. You have ${totalAvailableCredits}.`
        }
      }

      // 2. Consume credits
      const { planConsumed, extraConsumed } = await creditsRepository.consumeCredits(userId, cost, planLimit)
      await creditsRepository.addTransaction({
        userId,
        type: 'suggest_topic',
        amount: -cost,
        metadata: { planConsumed, extraConsumed, options }
      })

      // 3. Generate topics using LLM
      const apiKey = process.env.OPENAI_API_KEY || ''
      if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')

      const llm = LLMServiceFactory.create({ provider: 'openai', apiKey })

      const language = options.language || 'en-US'
      const type = options.videoType || 'general'
      const genre = options.videoGenre || 'storytelling'
      const themeName = options.themeName || type
      const themeDescription = options.themeDescription || ''
      const goals = options.goals && options.goals.length > 0 ? options.goals.join(', ') : ''

      const videoDuration = options.duration || 60
      const pointCount =
        videoDuration <= 15 ? '2 to 3' : videoDuration <= 30 ? '3 to 5' : videoDuration <= 60 ? '5 to 7' : '8 to 10'

      const prompt = `Generate 3 viral YouTube/Shorts scripts (format ${options.aspectRatio || '9:16'}, target duration: ${videoDuration}s) based on the theme:
Theme Name: "${themeName}"
Theme Description: "${themeDescription}"
Goals/Concepts: "${goals}"
Content Type: "${type}"
Genre: "${genre}"
Language: ${language}

CRITICAL INSTRUCTIONS:
1. Each script must hook the viewer in the first 5 seconds using instantly recognizable real-life examples.
2. Script structure:
   - Intro: 2-3 punchy sentences + Visual description.
   - Center: exactly ${pointCount} key points. Each point: 1-2 line explanation + Visual description.
   - Outro: 2-3 sentences + Visual description.
3. Scripts must create tension → reveal psychological insight → turn the mirror on the viewer.
4. STRICTLY AVOID internal system words like "${themeName}", "Prompt", "Template", "System" in titles or scripts.
5. TEXT ONLY: no Markdown, no symbols, no headings. Plain text with line breaks.
6. Each of the 3 scripts must have a unique angle: list, story, paradox, personal reflection, or psychological twist.

    Format for each script (plain text, no Markdown):
    Intro
    [hook sentences]

    Center
    Point 1: [Title]
      [Relatable 1-2 line explanation]

    Point 2: [Title]
      [Relatable 1-2 line explanation]

    Outro
    [memorable reflection]

Return ONLY a valid JSON object with a 'topics' key containing an array of 3 objects:
{ "topics": [{ "title": "Catchy Title", "script": "Intro\\n...\\nVisual: ...\\n\\nCenter\\nPoint 1: ...\\n  ...\\n  Visual: ...\\n\\nOutro\\n...\\nVisual: ..." }] }`

      const response = await llm.generateContent(
        prompt,
        'You are an expert in viral content creation and storytelling.',
        'application/json'
      )

      const cleanJson = response.replaceAll(/```json\n?|\n?```/g, '').trim()
      const parsed = JSON.parse(cleanJson)
      const topics = Array.isArray(parsed) ? parsed : parsed.topics || parsed.data || []

      return { success: true, topics: Array.isArray(topics) ? topics : [] }
    } catch (error) {
      console.error('[SuggestTopicsUseCase] Error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Failed to suggest topics' }
    }
  }
}
