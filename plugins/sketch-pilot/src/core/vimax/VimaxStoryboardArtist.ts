import { z } from 'zod'
import type { LLMService } from '@/application/services/llm.service'

export const shotBriefSchema = z.object({
  idx: z.number().describe('Shot index starting from 0'),
  camIdx: z.number().describe('Camera index starting from 0'),
  visualDesc: z.string().describe('Detailed visual description of the shot'),
  audioDesc: z.string().describe('Audio/dialogue description for the shot'),
  isLast: z.boolean().describe('Whether this is the last shot of the scene')
})

export type ShotBrief = z.infer<typeof shotBriefSchema>

const SYSTEM_PROMPT_STORYBOARD = `
[Role]
You are a professional storyboard artist. 

[Task]
Design a complete storyboard based on a script (one scene). 
Output visual elements and narrative flow for each shot.

[Guidelines]
- Assign cinematic shot types (close-up, wide, etc.).
- Reuse camera positions where possible (group shots by camIdx).
- Use <Name> for characters in visual descriptions.
- Describe spatial positions (left, center, right).
- Avoid unsafe content.
- One dialogue line max per character per shot.

{format_instructions}
`

/**
 * VimaxStoryboardArtist
 * Translated from agents/storyboard_artist.py
 */
export class VimaxStoryboardArtist {
  constructor(private readonly llmService: LLMService) {}

  async designStoryboard(script: string, characters: any[], userRequirement: string = ''): Promise<ShotBrief[]> {
    const charactersStr = characters.map((c, i) => `Character ${i}: ${JSON.stringify(c)}`).join('\n')

    const systemPrompt = `${SYSTEM_PROMPT_STORYBOARD}\n\nYou must return a valid JSON object following this JSON Schema:
{
  "type": "object",
  "properties": {
    "storyboard": {
      "type": "array",
      "items": { "type": "object" }
    }
  }
}`

    const humanPrompt = `
<SCRIPT>
${script}
</SCRIPT>

<CHARACTERS>
${charactersStr}
</CHARACTERS>

<USER_REQUIREMENT>
${userRequirement}
</USER_REQUIREMENT>
`

    const response = await this.llmService.generateContent(humanPrompt, systemPrompt, 'application/json')

    const parsed = JSON.parse(response)
    return (parsed.storyboard || []).map((s: any) => ({
      idx: s.idx,
      camIdx: s.camIdx ?? s.cam_idx,
      visualDesc: s.visualDesc ?? s.visual_desc,
      audioDesc: s.audioDesc ?? s.audio_desc,
      isLast: s.isLast ?? s.is_last
    }))
  }
}
