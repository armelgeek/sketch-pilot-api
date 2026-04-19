import type { LLMService } from '../../services/llm'
import type { VimaxEvent, VimaxScene } from './types'

/**
 * VimaxSceneExtractor
 * Transforms event descriptions into structured screenplay scenes.
 * Ported from scene_extractor.py
 *
 * Strategy: Iterative / Auto-Regressive.
 * Unlike a one-shot generator, this extractor generates scenes one by one,
 * feeding previous context back into the LLM. This ensures high detail
 * and avoids truncation for long episodes.
 */
export class VimaxSceneExtractor {
  constructor(private llmService: LLMService) {}

  private getSystemPrompt(): string {
    return `
You are an expert scriptwriter specializing in adapting literary works into structured screenplay scenes.
Generate the next scene for a screenplay adaptation.

[Guidelines]
1. Environment: Slugline and detailed visual description.
2. Characters: List names with static (body/face) and dynamic (clothing) features.
3. Script: Action and dialogue in screenplay format.
4. Scale: Focus on 1-5 scenes per event.
5. Character Visibility: Track who is on screen.
6. Output MUST be JSON: { "index": 0, "slugline": "...", "description": "...", "characters": [...], "script": "...", "isLast": false }
`
  }

  public async extractScenes(event: VimaxEvent, contextFragments: string[]): Promise<VimaxScene[]> {
    const scenes: VimaxScene[] = []
    let isLast = false

    console.info(`[VimaxSceneExtractor] 🎬 Extracting scenes for event: ${event.id}`)

    while (!isLast) {
      const prompt = `
<EVENT_DESCRIPTION_START>
${event.description}
${event.processChain.join('\n')}
<EVENT_DESCRIPTION_END>

<CONTEXT_FRAGMENTS_START>
${contextFragments.map((f, i) => `<FRAGMENT_${i}_START>\n${f}\n<FRAGMENT_${i}_END>`).join('\n')}
<CONTEXT_FRAGMENTS_END>

<PREVIOUS_SCENES_START>
${scenes.map((s) => `Scene ${s.idx}: ${s.environment.slugline}`).join('\n')}
<PREVIOUS_SCENES_END>

Generate the next scene.
`
      const response = await this.llmService.generateContent(prompt, this.getSystemPrompt(), 'application/json')

      try {
        const raw = JSON.parse(response)
        // Normalize flat LLM response to VimaxScene shape
        const scene: VimaxScene = {
          idx: raw.idx ?? raw.index ?? scenes.length,
          isLast: raw.isLast ?? false,
          environment: raw.environment ?? {
            slugline: raw.slugline ?? '',
            description: raw.description ?? ''
          },
          characters: raw.characters ?? [],
          script: raw.script ?? ''
        }

        scenes.push(scene)
        console.info(`[VimaxSceneExtractor] Scene ${scene.idx} generated. isLast: ${scene.isLast}`)

        isLast = scene.isLast

        // Safety break to prevent infinite loops or excessive cost
        if (scenes.length > 5) {
          console.warn('[VimaxSceneExtractor] Max scenes reached (5). Breaking.')
          break
        }
      } catch (error) {
        console.error('[VimaxSceneExtractor] Extraction error:', error)
        break
      }
    }

    return scenes
  }
}
