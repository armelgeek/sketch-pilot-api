import type { LLMService } from '../../services/llm'

/**
 * VimaxNarrationAgent (Pass 1)
 *
 * This agent is responsible for generating the raw story/narration for an episode.
 * it focuses on narrative depth, character evolution, and maintaining tension.
 */
export class VimaxNarrationAgent {
  constructor(private llm: LLMService) {}

  /**
   * Generates a raw narration script for an episode.
   *
   * @param topic The main topic or pitch for the episode.
   * @param context Detailed series context (Bible, previous episodes, registries).
   * @returns The raw narration text.
   */
  async generateNarration(topic: string, context: any = {}): Promise<string> {
    const systemPrompt = this.getSystemPrompt(context)
    const userPrompt = `
DÉTAILS DE L'ÉPISODE : 
${topic}

TÂCHE : Générez une narration percutante, visuelle et émotionnelle pour cet épisode. Focus : Action immédiate, AUCUN dialogue, et respect strict de la continuité. L'histoire doit être portée par les gestes, les regards et l'environnement.
`

    const response = await this.llm.generateContent(userPrompt, systemPrompt)
    return response.trim()
  }

  private getSystemPrompt(ctx: any): string {
    return `
[ROLE]
You are a world-class episodic screenwriter specialized in high-tension, cinematic sagas.
Your goal is to write the RAW NARRATION for an episode.

[SERIES BIBLE & CONTEXT]
${JSON.stringify(ctx, null, 2)}

[RULES]
1. NO METAPHORS: Use literal, physical, and sensory descriptions.
2. ACTION-DRIVEN: Focus on what characters do and feel, not exposition.
3. NO DIALOGUE: This is a silent or purely narrative episode. Focus entirely on actions, expressions, and atmosphere.
4. CONTINUITY: Respect the character registry (traits, status) and location registry.
5. MOMENTUM: Start "In Media Res" and end on a high-stakes cliffhanger.
6. LENGTH: Target approximately 300-500 words for a 60-second episode.

[NARRATIVE STYLE]
- Punchy, short sentences.
- Heavy focus on atmospheric details (sounds, lighting, textures).
- Psychological depth without internal monologues.
`.trim()
  }
}
