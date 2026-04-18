import type { LLMService } from '../../services/llm'

/**
 * VimaxScriptEnhancer
 * Refines scripts with sensory details, consistent terminology, and cinematic specificity.
 * Ported from script_enhancer.py
 */
export class VimaxScriptEnhancer {
  constructor(private llmService: LLMService) {}

  private getRefinementPrompt(): string {
    return `
[Role]
You are a senior screenplay polishing and continuity expert.

[Task]
Enhance the planned script by adding sensory details, tightening continuity, and clarifying transitions.

[Guidelines]
1. Visual Specificity: Lighting, textures, weather, time-of-day.
2. Consistency: Names, ages, and locations MUST be exact.
3. Dialogue: Concise, purposeful, and in quotes.
4. Ambiguity: Re-state important objects/actors often to remove ambiguity.
5. NO Camera Jargon (cut to, close-up). NO Metaphors.
6. Roles & Positions: Always specify who is where and what they are doing.
7. Output MUST be JSON: { "enhanced_script": "..." }
`
  }

  public async enhance(script: string): Promise<string> {
    const prompt = `
<PLANNED_SCRIPT_START>
${script}
<PLANNED_SCRIPT_END>
`
    const response = await this.llmService.generateContent(prompt, this.getRefinementPrompt(), 'application/json')
    try {
      const parsed = JSON.parse(response)
      return parsed.enhanced_script || response
    } catch {
      return response
    }
  }
}
