import type { LLMService } from '../services/llm'
import type { VideoGenerationOptions } from '../types/video-script.types'
import type { VideoTypeSpecification } from './prompt-maker.types'
import type { PromptManager } from './prompt-manager'

/**
 * ScriptDoctor
 *
 * An expert pass that refines the initial script based on the specific niche/spec.
 * It ensures terminology, tone, and visual metaphors are professional and high-impact.
 */
export class ScriptDoctor {
  constructor(
    private readonly llmService: LLMService,
    private readonly promptManager: PromptManager
  ) {}

  /**
   * refines the raw script structure based on the audience and niche expertise.
   */
  async doctorScript(topic: string, rawScript: any, options: VideoGenerationOptions): Promise<any> {
    const spec = this.promptManager.getEffectiveSpec(options)
    console.log(`[ScriptDoctor] Refining script for niche: "${spec.name || 'General'}"`)

    const systemPrompt = this.buildDoctorSystemPrompt(spec)
    const userPrompt = this.buildDoctorUserPrompt(topic, rawScript)

    const response = await this.llmService.generateContent(userPrompt, systemPrompt, 'application/json')

    try {
      // Clean the response from potential markdown blocks
      const cleaned = response
        .replace(/^```json/, '')
        .replace(/```$/, '')
        .trim()
      const parsed = JSON.parse(cleaned)

      // Basic sanity check: ensure we still have scenes
      if (!parsed.scenes || !Array.isArray(parsed.scenes)) {
        throw new Error('Refined script is missing scenes array.')
      }

      return parsed
    } catch (error) {
      console.warn('[ScriptDoctor] Failed to parse refined script, using original.', error)
      return rawScript
    }
  }

  private buildDoctorSystemPrompt(spec: VideoTypeSpecification): string {
    const goals = spec.goals?.map((g) => `- ${g}`).join('\n') || 'N/A'
    const rules = spec.rules?.map((r) => `- ${r}`).join('\n') || 'N/A'

    return `## ROLE
You are a Content Expert and Script Doctor specialized in the following niche: ${spec.name}.
Your job is to take a draft video script and refine it to sound authoritative, engaging, and professional for the target audience.

## TASK
Analyze the provided JSON script and improve:
1. NARRATION: Use high-impact terminology relevant to ${spec.name}. Ensure the tone matches the "${spec.role}" persona.
2. HOOK & CLIMAX: Sharpen the opening hook and the concluding summary to maximize engagement.
4. VISUAL PROPS: Suggest better props or visual summaries that resonate with experts in this field.

## CONSTRAINTS & SPECIFICATIONS
- **Role**: ${spec.role}
- **Context**: ${spec.context}
- **Target Audience**: ${spec.audienceDefault}
- **Goals**:
${goals}
- **Strict Rules**:
${rules}

## OUTPUT FORMAT
You MUST return the COMPLETE JSON object provided in input, but with the "fullNarration" and each item in the "scenes" array refined. 
KEEP the number of scenes identical. Do NOT change ID fields.
ONLY refine the text content (narration, summary, expression, background, etc.).

JSON structure to maintain:
{
  "titles": [...],
  "fullNarration": "...",
  "scenes": [
    { 
      "id": "...", 
      "narration": "...", 
      "summary": "...", 
      "expression": "...", 
      "actions": [...], 
      "background": "...",
      ... 
    }
  ],
  "characterSheets": [...]
}`
  }

  private buildDoctorUserPrompt(topic: string, rawScript: any): string {
    return `TOPIC: ${topic}

ORIGINAL DRAFT SCRIPT (JSON):
${JSON.stringify(rawScript, null, 2)}

Refine this script for maximum authority and niche relevance.`
  }
}
