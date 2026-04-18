import type { LLMService } from '../../services/llm'

/**
 * VimaxScreenwriter
 * Expands ideas into stories and adapts stories into structured screenplay scripts.
 * Ported from screenwriter.py
 */
export class VimaxScreenwriter {
  constructor(private llmService: LLMService) {}

  private getStoryDevelopmentPrompt(): string {
    return `
[Role]
You are a seasoned creative story generation expert. 
Focus on Idea Expansion, Story Structure, Character Development, and Screenplay-Oriented Thinking.

[Guidelines]
- Idea-Centric: Foundation must be the user's core idea.
- Logical Consistency: Professional narrative rhythm and flow.
- Show, Don't Tell: Vivid actions and emotional subtext over flat narration.
`
  }

  private getScriptAdaptationPrompt(): string {
    return `
[Role]
You are a professional AI script adaptation assistant. 
Transform stories into screenplay scripts divided by scenes.

[Guidelines]
- Scene Division: New scene for every time or location change.
- Cinematic Quality: Descriptions must be "filmable". 
- Performance: Express internal states through concrete gestures and movements.
- Output MUST be JSON: { "script": ["SCENE 1...", "SCENE 2..."] }
`
  }

  public async developStory(idea: string, requirements?: string): Promise<string> {
    const prompt = `
<IDEA>
${idea}
</IDEA>

<USER_REQUIREMENT>
${requirements || 'Analyze genre and target audience naturally.'}
</USER_REQUIREMENT>
`
    return await this.llmService.generateContent(prompt, this.getStoryDevelopmentPrompt())
  }

  public async writeScript(story: string, requirements?: string): Promise<string[]> {
    const prompt = `
<STORY>
${story}
</STORY>

<USER_REQUIREMENT>
${requirements || ''}
</USER_REQUIREMENT>
`
    const response = await this.llmService.generateContent(prompt, this.getScriptAdaptationPrompt(), 'application/json')
    try {
      const parsed = JSON.parse(response)
      return Array.isArray(parsed.script) ? parsed.script : [response]
    } catch {
      return [response]
    }
  }
}
