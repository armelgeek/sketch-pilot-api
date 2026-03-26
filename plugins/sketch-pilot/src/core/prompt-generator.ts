import type { AnimationPrompt, EnrichedScene, ImagePrompt } from '../types/video-script.types'
import { PromptManager } from './prompt-manager'
import type { SceneMemory } from './scene-memory'

/**
 * Generates image and animation prompts from enriched scene descriptions.
 *
 * @deprecated All prompt logic has been centralised in PromptManager.
 * This class is kept as a thin facade for backward compatibility.
 * New code should use PromptManager directly.
 */
export class PromptGenerator {
  readonly manager: PromptManager

  constructor(manager?: PromptManager) {
    this.manager = manager ?? new PromptManager()
  }

  /**
   * Generate a single-string image prompt for a scene in the configured visual style.
   * When hasReferenceImages is true, reference image backgrounds are preserved.
   * @param aspectRatio - The aspect ratio string to append (e.g. '16:9', '9:16', '1:1')
   * @param imageStyle - Optional visual style override (stylePrefix + characterDescription)
   * @param memory - Optional inter-scene visual memory for narrative continuity
   */
  generateImagePrompt(
    scene: EnrichedScene,
    hasReferenceImages: boolean = false,
    aspectRatio: string = '16:9',
    imageStyle?: { stylePrefix?: string; characterDescription?: string },
    memory?: SceneMemory,
    characterSheets?: import('../types/video-script.types').CharacterSheet[]
  ): ImagePrompt {
    return this.manager.buildImagePrompt(scene, hasReferenceImages, aspectRatio, imageStyle, memory, characterSheets)
  }

  /**
   * Generate animation instructions for a scene
   * @param imageStyle - Optional visual style override (characterDescription)
   */
  generateAnimationPrompt(scene: EnrichedScene, imageStyle?: { characterDescription?: string }): AnimationPrompt {
    return this.manager.buildAnimationPrompt(scene, imageStyle)
  }
}
