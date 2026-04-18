import type { LLMService } from '../../services/llm'

export interface CharacterInScene {
  index: number
  identifier_in_scene: string
  static_features: string
  dynamic_features: string
}

/**
 * VimaxCharacterExtractor
 * Transforms raw script/novel text into visually detailed character profiles.
 * Ported from character_extractor.py
 */
export class VimaxCharacterExtractor {
  constructor(private llmService: LLMService) {}

  private getSystemPrompt(): string {
    return `
[Role]
You are a top-tier movie script analysis expert.

[Task]
Your task is to analyze the provided script and extract all relevant character information.

[Guidelines]
- Group all names referring to the same entity under one character. Select the most appropriate name as the character identifier. 
- If the character's name is not mentioned, use reasonable pronouns (e.g., "the young woman", "the barista").
- For background characters, you do not need to consider them.
- If features are missing, design plausible, vivid, and evocative visual traits based on context.
- [IMPORTANT] STATIC FEATURES: Describe physical appearance, physique, and unchanging traits (e.g., high nose bridge, long black hair).
- [IMPORTANT] DYNAMIC FEATURES: Describe attire, accessories, and changeable items (e.g., blue silk shirt, silver watch).
- DO NOT include personality, roles, or relationships in the features.
- Descriptions must be highly concrete and visual (colors, specific shapes).
- Output MUST be in valid JSON.
`
  }

  public async extractCharacters(script: string): Promise<CharacterInScene[]> {
    const prompt = `
<SCRIPT>
${script}
</SCRIPT>

Extract characters following the guidelines. Return a JSON object with a "characters" array.
Each character must have: "index", "identifier_in_scene", "static_features", "dynamic_features".
`

    const response = await this.llmService.generateContent(prompt, this.getSystemPrompt(), 'application/json')

    try {
      const parsed = JSON.parse(response)
      return parsed.characters || []
    } catch (error) {
      console.error('[VimaxCharacterExtractor] Failed to parse character JSON:', error)
      return []
    }
  }
}
