import type { LLMService } from '../../services/llm'
import type { CharacterInScene } from './VimaxCharacterExtractor'

export interface CharacterInEvent extends CharacterInScene {
  identifier_in_event: string
  active_scenes: Record<number, string> // sceneIdx -> identifierInScene
}

/**
 * VimaxCharacterFusion
 * Handles semantic merging of character entities across different scenes and episodes.
 * Ported from global_information_planner.py
 */
export class VimaxCharacterFusion {
  constructor(private llmService: LLMService) {}

  private getMergeAcrossScenesPrompt(): string {
    return `
You are an expert script analysis and character fusion specialist.
Your task is to analyze characters across multiple scenes and merge them into a unified list.

**GUIDELINES**
1. Character Fusion: Determine if characters from different scenes are the same person (check dialogue style, role, features).
2. Unique Identifier: Assign a consistent, canonical name to each merged character.
3. Scene Mapping: For each character, list all scenes they appear in and the exact name used.
4. Completeness: Ensure ALL characters from all scenes are included.
5. Splitting: If a character changes significantly (e.g., child to adult), split them into separate actors/IDs.

Output MUST be in JSON:
{ "characters": [ { "index": 0, "identifier_in_event": "John", "active_scenes": { "0": "John", "1": "He" }, "static_features": "...", "dynamic_features": "..." } ] }
`
  }

  public async mergeCharactersAcrossScenes(
    scenes: { idx: number; script: string; characters: CharacterInScene[] }[]
  ): Promise<CharacterInEvent[]> {
    let scenesSequence = ''
    for (const scene of scenes) {
      scenesSequence += `<SCENE_${scene.idx}_START>\n`
      scenesSequence += `<SCRIPT_START>\n${scene.script}\n<SCRIPT_END>\n`
      scenesSequence += `<CHARACTERS_START>\n`
      for (const char of scene.characters) {
        scenesSequence += `<CHARACTER_${char.index}_START>\nName: ${char.identifier_in_scene}\nStatic: ${char.static_features}\nDynamic: ${char.dynamic_features}\n<CHARACTER_${char.index}_END>\n`
      }
      scenesSequence += `<CHARACTERS_END>\n<SCENE_${scene.idx}_END>\n`
    }

    const response = await this.llmService.generateContent(
      scenesSequence,
      this.getMergeAcrossScenesPrompt(),
      'application/json'
    )

    try {
      const parsed = JSON.parse(response)
      return parsed.characters || []
    } catch (error) {
      console.error('[VimaxCharacterFusion] Fusion failed:', error)
      return []
    }
  }
}
