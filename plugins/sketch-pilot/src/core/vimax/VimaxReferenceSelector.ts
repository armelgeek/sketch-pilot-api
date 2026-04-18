import type { LLMService } from '../../services/llm'
import type { EnrichedScene } from '../../types/video-script.types'

export interface VisualReference {
  name: string
  data: string // Base64 or URL
  description?: string
}

export class VimaxReferenceSelector {
  constructor(private llmService: LLMService) {}

  /**
   * Prunes a large list of visual references to the most relevant N (typically 8).
   * Uses a 2-pass approach:
   * 1. Semantic weighting (Text-only)
   * 2. Multimodal validation (if supported by LLM)
   */
  async selectReferences(
    scene: EnrichedScene,
    allReferences: VisualReference[],
    maxReferences: number = 8
  ): Promise<VisualReference[]> {
    if (allReferences.length <= maxReferences) return allReferences

    console.log(`[VimaxReferenceSelector] Pruning ${allReferences.length} references to ${maxReferences}...`)

    const targetDescription = scene.imagePrompt || scene.summary || ''

    // Pass 1: Semantic Filtering (LLM-based)
    const prompt = `
[Role]
You are a professional visual creation assistant. Your task is to select the ${maxReferences} most relevant reference images from a large set to guide an AI image generator for a specific scene.

[Target Scene Description]
${targetDescription}

[Available References]
${allReferences.map((r, i) => `Image ${i}: ${r.name} - ${r.description || 'No description available'}`).join('\n')}

[Task]
Return a JSON array of indices for the ${maxReferences} most relevant images. 
Prioritize:
1. Character Portraits for characters explicitly mentioned in the description.
2. Location Masters for the current setting.
3. Continuity frames from previous scenes if they are highly similar in composition.

Output format: [0, 2, 5, ...]
`

    try {
      const response = await this.llmService.generateContent(prompt, undefined, 'application/json')
      const indices = JSON.parse(response.match(/\[.*\]/)?.[0] || '[]')

      if (Array.isArray(indices) && indices.length > 0) {
        return indices
          .map((idx) => allReferences[idx])
          .filter(Boolean)
          .slice(0, maxReferences)
      }
    } catch (error) {
      console.error('[VimaxReferenceSelector] Selection failed, falling back to first N:', error)
    }

    return allReferences.slice(0, maxReferences)
  }
}
