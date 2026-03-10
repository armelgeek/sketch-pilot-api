import type { AnimationPrompt, EnrichedScene, ImagePrompt } from '../types/video-script.types'
import { PromptManager } from './prompt-manager'

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
   * Set the background color for prompts
   */
  setBackgroundColor(color: string) {
    this.manager.setBackgroundColor(color)
  }

  /**
   * Generate a single-string image prompt for a scene in the configured visual style.
   * When hasReferenceImages is true, reference image backgrounds are preserved.
   * @param aspectRatio - The aspect ratio string to append (e.g. '16:9', '9:16', '1:1')
   * @param imageStyle - Optional visual style override (stylePrefix + characterDescription)
   */
  generateImagePrompt(
    scene: EnrichedScene,
    hasReferenceImages: boolean = false,
    aspectRatio: string = '16:9',
    imageStyle?: { stylePrefix?: string; characterDescription?: string }
  ): ImagePrompt {
    return this.manager.buildImagePrompt(scene, hasReferenceImages, aspectRatio, imageStyle)
  }

  /**
   * Generate animation instructions for a scene
   * @param imageStyle - Optional visual style override (characterDescription)
   */
  generateAnimationPrompt(scene: EnrichedScene, imageStyle?: { characterDescription?: string }): AnimationPrompt {
    return this.manager.buildAnimationPrompt(scene, imageStyle)
  }
}
