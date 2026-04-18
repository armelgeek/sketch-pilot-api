import type { LLMService } from '../../services/llm'

export type SagaIntent = 'narrative' | 'motion' | 'montage'

export interface SagaPlanningResponse {
  planned_script: string
}

/**
 * VimaxSagaPlanner
 * Intent-routed scriptwriting agent.
 * Ported from script_planner.py
 */
export class VimaxSagaPlanner {
  constructor(private llmService: LLMService) {}

  private getIntentRouterPrompt(): string {
    return `
You are an intent router for script planning. Classify the user's basic idea into one of the following intents:

- narrative: The idea centers on character, plot, themes, dialogue, or broad storytelling beats.
- motion: The idea centers on action, speed, vehicles, combat, choreography, sports, or any kinetic sequence where precise, technical motion description is primary.
- montage: The idea centers on a series of shots that convey an emotional arc through imagery, pacing, and juxtaposition.

Respond using the following JSON format:
{ "intent": "narrative" | "motion" | "montage", "rationale": "short reason" }
`
  }

  private getSPECIALIZEDPrompt(intent: SagaIntent): string {
    switch (intent) {
      case 'motion':
        return `
[ROLE: Motion & Speed Immersion Expert]
Task: Transform the idea into a kinetic, technically accurate script.
- NO metaphors. Minimal dialogue.
- Focus on VECTORS, SPEED, and SPATIAL orientation.
- Technically explicit (name types of vehicles, stances, strikes).
- Sequence action beats that can be storyboarded step-by-step.
- Use cinematic language that emphasizes force and motion blur.
`
      case 'montage':
        return `
[ROLE: Montage & Emotion Expert]
Task: Transform the idea into an emotion-driven montage. 
- NO metaphors. Pure paragraph format.
- Convey meaning through shot progression, rhythm, and visual juxtaposition.
- Focus on internal states, expressive visuals, and reactions.
- Pacing should reflect the emotional arc (tempo rise, breath presence).
`
      case 'narrative':
      default:
        return `
[ROLE: World-Class Screenwriter]
Task: Transform the idea into a rich narrative script.
- Three-act structure: setup, confrontation, resolution.
- Compelling character arcs and natural dialogue.
- Cinematic language emphasizing visual elements over exposition.
- Maintain genre consistency and thematic depth.
- No metaphors allowed in the visual descriptions.
`
    }
  }

  public async planSaga(basicIdea: string): Promise<{ intent: SagaIntent; script: string }> {
    // 1. Route Intent
    const routerResponse = await this.llmService.generateContent(
      `<BASIC_IDEA_START>\n${basicIdea}\n<BASIC_IDEA_END>`,
      this.getIntentRouterPrompt(),
      'application/json'
    )

    let intent: SagaIntent = 'narrative'
    try {
      const parsed = JSON.parse(routerResponse)
      intent = parsed.intent
    } catch (error) {
      console.warn('[VimaxSagaPlanner] Routing failed, defaulting to narrative.', error)
    }

    // 2. Generate Specialized Script
    const planningPrompt = `
<BASIC_IDEA_START>
${basicIdea}
<BASIC_IDEA_END>

Expand this idea into a full script following the specialized guidelines. 
Return a JSON object: { "planned_script": "..." }
`

    const scriptResponse = await this.llmService.generateContent(
      planningPrompt,
      this.getSPECIALIZEDPrompt(intent),
      'application/json'
    )

    try {
      const parsed = JSON.parse(scriptResponse)
      return { intent, script: parsed.planned_script }
    } catch (error) {
      console.error('[VimaxSagaPlanner] Script parsing failed:', error)
      return { intent, script: basicIdea }
    }
  }
}
