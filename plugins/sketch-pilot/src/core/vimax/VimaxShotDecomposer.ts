import { z } from 'zod'
import type { LLMService } from '@/application/services/llm.service'

export const shotDecompositionSchema = z.object({
  ffDesc: z.string().describe('Static description of the first frame snapshot'),
  ffVisCharIdxs: z.array(z.number()).describe('Indices of characters visible in the first frame'),
  lfDesc: z.string().describe('Static description of the last frame snapshot'),
  lfVisCharIdxs: z.array(z.number()).describe('Indices of characters visible in the last frame'),
  motionDesc: z.string().describe('Description of movement between FF and LF'),
  variationType: z.enum(['large', 'medium', 'small']).describe('Degree of change between FF and LF'),
  variationReason: z.string().describe('Reason for the variation type')
})

export type ShotDecomposition = z.infer<typeof shotDecompositionSchema>

const SYSTEM_PROMPT_DECOMPOSE = `
[Role]
You are a professional visual text analyst. 

[Task]
Deconstruct a shot description into three core components: 
1. Static First Frame (Composition, character posture, lighting)
2. Static Last Frame (Final state after motion)
3. Dynamic Motion (Camera movement and element movement)

[Guidelines]
- FF and LF must be pure "SNAPSHOTS" (no ongoing actions).
- Distinction between camera movement and on-screen movement.
- Do NOT use names in motionDesc; use visible features (e.g., "short hair, green dress").
- 'large' variation: significant change in composition (Wide -> Close-up).
- 'medium' variation: new character entry or 180-degree turn.
- 'small' variation: expression changes, walking, simple pan.

{format_instructions}
`

/**
 * VimaxShotDecomposer
 * Translated from agents/storyboard_artist.py (decompose_visual_description)
 */
export class VimaxShotDecomposer {
  constructor(private readonly llmService: LLMService) {}

  async decomposeShot(visualDesc: string, characters: any[]): Promise<ShotDecomposition> {
    const charactersStr = characters
      .map((c, i) => `${c.name || i}: (static) ${c.staticFeatures || ''}; (dynamic) ${c.dynamicFeatures || ''}`)
      .join('\n')

    const systemPrompt = `${SYSTEM_PROMPT_DECOMPOSE}\n\nYou must return a valid JSON object with the fields: ffDesc, ffVisCharIdxs, lfDesc, lfVisCharIdxs, motionDesc, variationType, variationReason.`

    const humanPrompt = `
<VISUAL_DESC>
${visualDesc}
</VISUAL_DESC>

<CHARACTERS>
${charactersStr}
</CHARACTERS>
`

    const response = await this.llmService.generateContent(humanPrompt, systemPrompt, 'application/json')

    const s = JSON.parse(response)
    return {
      ffDesc: s.ffDesc ?? s.ff_desc,
      ffVisCharIdxs: s.ffVisCharIdxs ?? s.ff_vis_char_idxs ?? [],
      lfDesc: s.lfDesc ?? s.lf_desc,
      lfVisCharIdxs: s.lfVisCharIdxs ?? s.lf_vis_char_idxs ?? [],
      motionDesc: s.motionDesc ?? s.motion_desc,
      variationType: s.variationType ?? s.variation_type,
      variationReason: s.variationReason ?? s.variation_reason
    }
  }
}
