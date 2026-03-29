/* eslint-disable node/prefer-global/process */
import { LLMServiceFactory } from '@sketch-pilot/services/llm'
import { IUseCase } from '@/domain/types'
import { CREDIT_COSTS, PLAN_MONTHLY_LIMITS } from '@/infrastructure/config/video.config'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'

type GenerateScriptFromTitleParams = {
  userId: string
  planId?: string
  title: string
  options?: {
    language?: string
    duration?: number
    aspectRatio?: string
  }
}

type GenerateScriptFromTitleResponse = {
  success: boolean
  script?: string
  error?: string
  insufficientCredits?: boolean
}

const creditsRepository = new CreditsRepository()

export class GenerateScriptFromTitleUseCase extends IUseCase<
  GenerateScriptFromTitleParams,
  GenerateScriptFromTitleResponse
> {
  async execute({
    userId,
    planId,
    title,
    options
  }: GenerateScriptFromTitleParams): Promise<GenerateScriptFromTitleResponse> {
    try {
      const cost = (CREDIT_COSTS as any).GENERATE_SCRIPT || 5

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
        type: 'generate_script_from_title',
        amount: -cost,
        metadata: { planConsumed, extraConsumed, title, options }
      })

      // 3. Generate script using Gemini
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
      if (!apiKey) throw new Error('GEMINI_API_KEY is not configured')

      const llm = await LLMServiceFactory.create({ provider: 'gemini', apiKey })

      const videoDuration = options?.duration || 60
      const pointCount =
        videoDuration <= 15 ? '2 to 3' : videoDuration <= 30 ? '3 to 5' : videoDuration <= 60 ? '5 to 7' : '8 to 10'

      const prompt = `Generate a viral YouTube/Shorts script (format ${options?.aspectRatio || '9:16'}, target duration: ${videoDuration}s) for the specific video title: "${title}".

CRITICAL INSTRUCTIONS:
1. The script must hook the viewer in the first 5 seconds using instantly recognizable real-life examples related to the title.
2. Script structure:
   - Intro: 2-3 punchy sentences + Visual description.
   - Center: exactly ${pointCount} key points. Each point: 1-2 line explanation + Visual description.
   - Outro: 2-3 sentences leaving a memorable final reflection + Visual description.
3. VISUAL DESCRIPTIONS: For each part, provide a 1-sentence "Visual:" instruction. These must describe dense, realistic B&W settings with 5+ objects, focused on a single character @Name.
4. TONE: Create tension → reveal psychological insight → turn the mirror on the viewer.
5. STRICTLY AVOID internal system words like "Prompt", "Template", "System", or repeating the title too often.
6. TEXT ONLY: no Markdown, no symbols, no headings. Plain text with line breaks.

Format for the script (plain text, no Markdown):
Intro
[hook sentences]

Center
Point 1: [Title]
  [Relatable 1-2 line explanation]

Point 2: [Title]
  [Relatable 1-2 line explanation]

Outro
[memorable reflection]

Return ONLY a valid JSON object with a 'script' key:
{ "script": "Intro\\n...\\nCenter\\nPoint 1: ...\\n  ...\\n\\nOutro\\n..." }`

      const response = await llm.generateContent(
        prompt,
        'You are an expert in viral content creation and storytelling.',
        'application/json'
      )

      const cleanJson = response.replaceAll(/```json\n?|\n?```/g, '').trim()
      const parsed = JSON.parse(cleanJson)
      const script = typeof parsed.script === 'string' ? parsed.script : ''

      return { success: true, script }
    } catch (error) {
      console.error('[GenerateScriptFromTitleUseCase] Error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Failed to generate script from title' }
    }
  }
}
