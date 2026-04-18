import type { LLMService } from '../../services/llm'

export interface ImageCandidate {
  index: number
  data: string // Base64 or URL
  description?: string
}

/**
 * VimaxBestImageSelector
 * Evaluates multiple generated images against a reference and description to select the best one.
 * Ported from best_image_selector.py
 */
export class VimaxBestImageSelector {
  constructor(private llmService: LLMService) {}

  private getSystemPrompt(): string {
    return `
[Role]
You are a professional visual assessment expert. Your expertise includes identifying Character Consistency, Spatial Consistency, and Description Accuracy.

[Task]
Evaluate candidate images against the reference image and target description. Select the index of the best image.

[Guidelines]
- Character Consistency: Features (gender, ethnicity, age, hair, body) must match reference.
- Spatial Consistency: Relative positions and perspective must align with reference.
- Description Accuracy: Must reflect the target description.
- Quality: Prioritize images without artifacts, borders, or weird framing.
- Output MUST be JSON: { "best_image_index": 0, "reason": "..." }
`
  }

  public async selectBestImage(
    references: { data: string; description: string }[],
    targetDescription: string,
    candidates: string[]
  ): Promise<{ index: number; reason: string }> {
    if (candidates.length === 0) throw new Error('No candidate images to evaluate.')

    let prompt = `<TARGET_DESCRIPTION_START>\n${targetDescription}\n<TARGET_DESCRIPTION_END>\n\n`

    references.forEach((ref, idx) => {
      prompt += `Reference Image ${idx}: ${ref.description}\n`
    })

    candidates.forEach((_, idx) => {
      prompt += `Candidate Image ${idx}\n`
    })

    // Prepare images for Gemini Vision
    const imagePayloads = [
      ...references.map((ref) => ({ data: ref.data, mimeType: 'image/webp' })),
      ...candidates.map((data) => ({ data, mimeType: 'image/webp' }))
    ]

    const response = await this.llmService.generateContent(
      prompt,
      this.getSystemPrompt(),
      'application/json',
      imagePayloads
    )

    try {
      const parsed = JSON.parse(response)
      const index = parsed.best_image_index
      return {
        index: typeof index === 'number' && index >= 0 && index < candidates.length ? index : 0,
        reason: parsed.reason || 'No reason provided.'
      }
    } catch (error) {
      console.error('[VimaxBestImageSelector] Evaluation failed:', error)
      return { index: 0, reason: 'Parsing error, defaulted to first image.' }
    }
  }
}
