import type { EnrichedScene, VideoGenerationOptions } from '../../types/video-script.types'
import type { VideoGenerator } from '../generators/video-generator.abstract'

export class DirectorAgent {
  constructor(private readonly promptManager: VideoGenerator) {}

  /**
   * Translates narration into a shot-by-shot storyboard (Pass 3 / Projection).
   */
  async projectScenes(
    narration: string,
    topic: string,
    options: VideoGenerationOptions,
    llmService: any
  ): Promise<any> {
    const prompts = (this.promptManager as any).buildPass2Prompts(narration, topic, options)
    const response = await llmService.generateContent(prompts.user, prompts.system, 'application/json')
    return JSON.parse(response)
  }

  /**
   * Builds the exact technical prompt for image generation.
   */
  async buildImagePrompt(scene: EnrichedScene, hasRefs: boolean, aspectRatio: string): Promise<any> {
    return await (this.promptManager as any).buildImagePrompt(scene, hasRefs, aspectRatio)
  }

  /**
   * Directs the animation style and parameters.
   */
  async buildAnimationPrompt(scene: EnrichedScene): Promise<string> {
    return scene.animationPrompt || ''
  }
}
