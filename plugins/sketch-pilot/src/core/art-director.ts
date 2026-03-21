import type { LLMService } from '../services/llm'
import type { VideoGenerationOptions } from '../types/video-script.types'
import type { VideoTypeSpecification } from './prompt-maker.types'
import type { PromptManager } from './prompt-manager'

/**
 * ArtDirector
 *
 * Specialized actor for visual identity, style consistency, and aesthetics.
 * Defines the "look and feel" parameters that apply to all scenes.
 */
export class ArtDirector {
  constructor(
    private readonly llmService: LLMService,
    private readonly promptManager: PromptManager
  ) {}

  async defineVisualIdentity(topic: string, narration: string, options: VideoGenerationOptions): Promise<any> {
    const spec = this.promptManager.getEffectiveSpec(options)
    console.log(`[ArtDirector] Defining visual identity for: "${topic}"`)

    const systemPrompt = this.buildArtDirectorSystemPrompt(spec, options)
    const userPrompt = this.buildArtDirectorUserPrompt(topic, narration)

    const response = await this.llmService.generateContent(userPrompt, systemPrompt, 'application/json')

    try {
      const cleaned = response
        .replace(/^```json/, '')
        .replace(/```$/, '')
        .trim()
      return JSON.parse(cleaned)
    } catch (error) {
      console.warn('[ArtDirector] Failed to parse artistic style, using default.', error)
      return this.getFallbackStyle()
    }
  }

  private buildArtDirectorSystemPrompt(spec: VideoTypeSpecification, options: VideoGenerationOptions): string {
    const styleLower = spec.name?.toLowerCase() || ''
    const stylePrefix = options?.imageStyle?.stylePrefix?.toLowerCase() || ''
    const isMinimalist =
      styleLower.includes('whiteboard') ||
      styleLower.includes('stick') ||
      styleLower.includes('chalk') ||
      styleLower.includes('monochrome') ||
      stylePrefix.includes('whiteboard') ||
      stylePrefix.includes('stick') ||
      stylePrefix.includes('chalk') ||
      stylePrefix.includes('monochrome')

    const colorConstraint = isMinimalist
      ? `IMPORTANT: The project style requirements include "${spec.name}" and "${stylePrefix}". Since this involves strict minimalism: "Monochrome Black and White only, ink on pure white background, no other colors, STRICTLY MINIMALIST, high white space, low line count".`
      : ''

    return `## ROLE
You are the Art Director for a premium video production. Your task is to establish a unique and consistent VISUAL IDENTITY for a ${spec.name} project.

## TASK
Define the "Visual Soul" of the project:
1. TEXTURE & GRAIN: The tactile quality of the image.
2. LINE QUALITY: The personality of the drawing or edges.
3. COLOR HARMONY: A specific color strategy that supports the tone.
   ${colorConstraint}

## CONSTRAINTS
- Stay consistent with the niche: ${spec.name}.
- Avoid generic descriptions like "clean". Be artistic (e.g. "high-contrast charcoal", "vibrant pastel triadic").
- Output MUST be a JSON object with "textureAndGrain", "lineQuality", and "colorHarmonyStrategy".

## OUTPUT FORMAT
JSON {
  "textureAndGrain": "...",
  "lineQuality": "...",
  "colorHarmonyStrategy": "..."
}`
  }

  private buildArtDirectorUserPrompt(topic: string, narration: string): string {
    return `TOPIC: ${topic}
NARRATION EXCERPT:
${narration.substring(0, 500)}...

Define the global artistic identity.`
  }

  private getFallbackStyle() {
    return {
      textureAndGrain: 'Clean digital surface',
      lineQuality: 'Precise uniform lines',
      colorHarmonyStrategy: 'Balanced professional palette'
    }
  }
}
