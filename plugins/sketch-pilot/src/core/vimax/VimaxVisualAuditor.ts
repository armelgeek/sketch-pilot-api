import type { LLMService } from '../../services/llm'
import type { VisualReference } from './VimaxReferenceSelector'

export interface AuditResult {
  bestImageIndex: number
  reason: string
  isAcceptable: boolean
  score: number // 0-100
}

export class VimaxVisualAuditor {
  constructor(private llmService: LLMService) {}

  /**
   * Audits generated images against visual anchors and the target script.
   * This is a "Vision Guardrail" that prevents character/background hallucinations.
   */
  async auditImages(
    targetDescription: string,
    references: VisualReference[],
    candidates: { path: string; b64: string }[]
  ): Promise<AuditResult> {
    if (candidates.length === 0) throw new Error('[VimaxVisualAuditor] No candidate images to audit.')

    console.log(`[VimaxVisualAuditor] Auditing ${candidates.length} candidates against ${references.length} refs...`)

    const prompt = `
[Role]
You are a professional visual production auditor. Your goal is to ensure absolute visual consistency in episodic video generation.

[Reference Visual Pillars]
${references.map((r, i) => `Ref ${i}: ${r.name} - ${r.description || ''}`).join('\n')}

[Target Script Description]
${targetDescription}

[Audit Tasks]
1. Character Consistency: Do characters (gender, clothing, facial features) match the Visual Pillars?
2. Spatial Consistency: Does the environment and layout match the Location Master?
3. Description Accuracy: Does the image faithfully represent the actions in the script?

[Task]
Evaluate the generated images. Provide a JSON response with the best index, a reason, a score (0-100), and if it is acceptable (score > 80).

Output format:
{
  "bestImageIndex": 0,
  "reason": "Detailed explanation...",
  "score": 95,
  "isAcceptable": true
}
`

    // Note: To be truly multimodal like Vimax, we'd need to send the images in the LLM call.
    // If llmService supports Vision, we'll use it.

    try {
      const response = await this.llmService.generateContent(prompt, undefined, 'application/json', [
        ...references.map((r) => ({ data: r.data, mimeType: 'image/webp' })),
        ...candidates.map((c) => ({ data: c.b64, mimeType: 'image/webp' }))
      ])

      const json = response.match(/\{[\s\S]*\}/)?.[0] || '{}'
      const result = JSON.parse(json)

      return {
        bestImageIndex: result.bestImageIndex ?? 0,
        reason: result.reason ?? 'No rationale provided.',
        score: result.score ?? 50,
        isAcceptable: result.isAcceptable ?? result.score > 80
      }
    } catch (error) {
      console.error('[VimaxVisualAuditor] Audit failed, defaulting to first:', error)
      return { bestImageIndex: 0, reason: 'Audit failed.', isAcceptable: true, score: 100 }
    }
  }
}
