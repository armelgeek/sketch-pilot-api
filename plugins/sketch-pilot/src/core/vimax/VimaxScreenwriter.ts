import { validateLLMOutput, type LLMScriptOutput } from '../generators/series/series-script.schema'
import type { LLMService } from '../../services/llm'

/**
 * VimaxScreenwriter (Pass 2)
 *
 * This agent takes a complete narration and splits it into logical scenes.
 * It enriches each scene with visual descriptions, cinematic directives,
 * and maintains narrative coherence.
 */
export class VimaxScreenwriter {
  constructor(private llm: LLMService) {}

  /**
   * Generates a structured screenplay from a full narration.
   *
   * @param narration The complete, unbroken narration script.
   * @param context Additional series context (characters, locations, past events).
   * @returns A validated LLMScriptOutput containing logical scenes.
   */
  async generateScreenplay(narration: string, context: any = {}): Promise<LLMScriptOutput> {
    const systemInstruction = this.getSystemPrompt()

    const prompt = `
<NARRATION>
${narration}
</NARRATION>

<SERIES_CONTEXT>
${JSON.stringify(context, null, 2)}
</SERIES_CONTEXT>

Task: Split the narration above into logical scenes. 
For each scene, provide all required attributes according to the specified schema.
Ensure visual and narrative continuity.
`

    const response = await this.llm.generateContent(prompt, systemInstruction, 'application/json')

    const validation = validateLLMOutput(response)
    if (!validation.success) {
      throw new Error(`[VimaxScreenwriter] Failed to validate screenplay: ${validation.error}`)
    }

    return validation.data
  }

  private getSystemPrompt(): string {
    return `
[ROLE]
You are a master Screenwriter and Visual Stylist for high-end AI episodic videos.
Your specialty is taking raw narration and transforming it into a cinematic, scene-by-scene screenplay.

[TASK]
Divide the provided <NARRATION> into a sequence of logical scenes.
A new scene MUST be created whenever there is a change in LOCATION or TIME.

For each scene, you must generate a JSON object following the STRICT rules below.

[CONSTRAINTS - ENUMS ONLY]
You MUST use ONLY the following values for these fields. Any other value will cause a system failure.

- **scenePurpose**: "reveal", "escalate", "misdirect", "stabilize", "collapse"
- **composition.shotType**: "CLOSEUP", "MEDIUM", "WIDE", "ESTABLISHING", "PANORAMIC", "POV", "OVERSHOULDER"
- **composition.layout**: "SINGLE", "MONTAGE", "SPLIT", "DIAGONAL"
- **cameraAction.type**: "none", "pan-left", "pan-right", "pan-up", "pan-down", "zoom-in", "zoom-out", "shake", "breathing", "snap-zoom", "dutch-tilt"
- **cameraAction.intensity**: "low", "medium", "high"
- **tensionState.type**: "build", "sustain", "spike", "release"

[FIELD DEFINITIONS]
1. **Narration**: The exact segment of the full narration that belongs to this scene. 
2. **Scene Delta**: The "causal change" or new information introduced.
3. **Visual Description (imagePrompt)**: A telegraphic, highly visual description for image generation. 
   - Focus on lighting, composition, and character actions.
   - Use @Name for characters (e.g., @Alexandre).
4. **Simulation Patch**: 
   - worldPatch: { weather, time, locks: [] }
   - charactersPatch: { "@Name": { status, evolution, location } }

[GUIDELINES]
- **Show, Don't Tell**: Visual descriptions should be actionable and filmable.
- **Continuity**: Ensure characters look and act consistently across scenes. 
- **Efficiency**: Aim for 4-8 scenes for a 30-60 second episode.
- **Format**: Return ONLY valid JSON.

[OUTPUT FORMAT]
{
  "seriesMetadata": {
    "episodeSummary": "string",
    "cliffhanger": { "type": "revelation|peril|choice|betrayal|unknown", "description": "string", "audienceQuestion": "string" },
    "characterContinuity": {
      "@Name": { "description": "string", "status": "alive" }
    },
    "locationContinuity": {
      "location-id": { "description": "string", "atmosphere": "string" }
    }
  },
  "titles": ["Title 1", "Title 2", "Title 3"],
  "scenes": [
    {
      "id": "scene-1",
      "sceneNumber": 1,
      "scenePurpose": "reveal",
      "sceneDelta": "string",
      "imagePrompt": "string",
      "charactersInScene": ["@Marcus"],
      "locationId": "enclave-7",
      "narration": "exact text from narration",
      "pacing": 5,
      "cameraAction": [{ "type": "zoom-in", "intensity": "medium" }],
      "composition": { "shotType": "MEDIUM", "lightingMood": "string", "layout": "SINGLE" },
      "tensionState": { "level": 5, "type": "build" },
      "simulationPatch": { "worldPatch": {}, "charactersPatch": {} }
    }
  ]
}
`.trim()
  }
}
