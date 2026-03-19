import { globalNarrativePlanSchema, type GlobalNarrativePlan } from '../types/video-script.types'
import type { LLMService } from '../services/llm'
import type { PromptManager } from './prompt-manager'

/**
 * DirectorPlanner
 *
 * The "Director" of the production. Its role is to analyze the generated script
 * structure BEFORE image prompts are built, to define a global visual strategy.
 */
export class DirectorPlanner {
  constructor(
    private readonly llmService: LLMService,
    private readonly promptManager: PromptManager
  ) {}

  /**
   * Analyzes the initial script structure and defines the global narrative plan.
   */
  async planGlobalExecution(
    topic: string,
    narration: string,
    scenes: any[],
    characterSheets: any[],
    options: import('../types/video-script.types').VideoGenerationOptions
  ): Promise<GlobalNarrativePlan> {
    console.log(`[DirectorPlanner] Thinking about the global visual arc for: "${topic}"`)

    const systemPrompt = this.buildDirectorSystemPrompt(options)
    const userPrompt = this.buildDirectorUserPrompt(topic, narration, scenes, characterSheets, options)

    const response = await this.llmService.generateContent(userPrompt, systemPrompt, 'application/json')

    try {
      const parsed = JSON.parse(response)
      return globalNarrativePlanSchema.parse(parsed)
    } catch (error) {
      console.warn('[DirectorPlanner] Failed to parse global plan, using default boring plan.', error)
      return this.getFallbackPlan()
    }
  }

  private buildDirectorSystemPrompt(options: import('../types/video-script.types').VideoGenerationOptions): string {
    const spec = this.promptManager.getEffectiveSpec(options)
    return `## ROLE
You are the Film Director and Cinematographer. Your task is to establish a cohesive visual and emotional "Director's Plan" for a ${spec.name || 'video'}.
Your role is: ${spec.role || 'Director'}

## CONTEXT
${spec.context || 'Produce a professional video.'}

## TASK
Analyze the provided narration and scene sequence to define:
1. THE VISUAL ARC: How lighting and color palette should evolve to support the message and tone.
2. RECURRING SYMBOLS: Identification of 1 - 3 visual objects that should appear consistently as anchors.
3. EMOTIONAL CURVE: Mapping the tension level and visual "vibe" across stages of the video.
4. FORESHADOWING: Identify key future elements and suggest subtle hints to introduce in earlier scenes.
5. VISUAL STORYTELLING (SILENT-READY): Define visual metaphors to represent abstract concepts.
6. CALLBACKS (VISUAL ECHOES): Identify 1-2 opportunities to reuse a composition or object from an earlier scene in a later scene to show evolution or thematic resonance.
7. PACING (RHYTHM): Define a global camera movement strategy and transition style that follows the emotional arc.

## CONSTRAINTS
    - Be precise.Avoid generic descriptions.
- The output MUST be a valid JSON object matching the requested schema.
- Visual Vibe should describe textures, line styles, or energetic qualities.
- SCENE REFERENCES: Use only the scene number (e.g. "1", "2") for all scene IDs or references in the JSON.

## OUTPUT FORMAT
JSON {
    "visualArc": { "lightingEvolution": "...", "colorPaletteShift": "...", "styleContinuity": "..." },
    "recurringSymbols": [{ "element": "...", "meaning": "...", "scenes": ["1", "2"] }],
    "emotionalCurve": [{ "stage": "...", "tension": 5, "visualVibe": "..." }],
    "foreshadowing": [{ "element": "...", "appearsInScenes": ["1"], "payoffSceneId": "5", "hintDescription": "..." }],
    "visualStorytelling": { "keyVisualMetaphors": ["..."], "clarityStrategy": "..." },
    "callbacks": [{ "element": "...", "originalSceneId": "1", "callbackSceneId": "10", "meaning": "..." }],
    "pacing": { "cameraMovementStrategy": "...", "transitionPulse": "..." }
} `
  }

  private buildDirectorUserPrompt(
    topic: string,
    narration: string,
    scenes: any[],
    characterSheets: any[],
    options: import('../types/video-script.types').VideoGenerationOptions
  ): string {
    const spec = this.promptManager.getEffectiveSpec(options)
    return `SUBJECT: ${topic}
FULL NARRATION:
${narration}

SCENES:
${scenes.map((s, i) => `Scene ${i + 1}: ${s.summary || s.narration.substring(0, 100)}...`).join('\n')}

CHARACTERS:
${characterSheets.map((c) => `- ${c.name}: ${c.role}`).join('\n')}

Generate the Global Narrative Plan for this ${spec.name || 'video'}. Use its specific style and rules to drive the visual arc.`
  }

  private getFallbackPlan(): GlobalNarrativePlan {
    return {
      visualArc: {
        lightingEvolution: 'Consistent soft lighting throughout.',
        colorPaletteShift: 'Stable corporate palette.',
        styleContinuity: 'Clean whiteboard lines.'
      },
      emotionalCurve: [
        { stage: 'Intro', tension: 3, visualVibe: 'Welcoming and calm' },
        { stage: 'Main Body', tension: 5, visualVibe: 'Informative and steady' },
        { stage: 'Conclusion', tension: 4, visualVibe: 'Resolved and confident' }
      ],
      foreshadowing: [],
      visualStorytelling: {
        keyVisualMetaphors: [],
        clarityStrategy: 'Maintain clear focus on subjects.'
      },
      callbacks: [],
      pacing: {
        cameraMovementStrategy: 'mostly static with subtle pans',
        transitionPulse: 'clean cuts'
      }
    }
  }
}
