/**
 * Animation Service Interface and Factory
 *
 * This module provides an abstraction layer for animation services,
 * making it easy to switch between different animation providers.
 */

export interface AnimationService {
  animateImage: (
    imagePath: string,
    prompt: string,
    duration: number,
    outputPath: string,
    aspectRatio?: string
  ) => Promise<string>
}

export type AnimationProvider = 'grok' | 'veo'

export interface AnimationServiceConfig {
  provider: AnimationProvider
  apiKey?: string
}

/**
 * Factory for creating animation service instances
 */
export const AnimationServiceFactory = {
  /**
   * Create an animation service based on the configuration
   */
  async create(config: AnimationServiceConfig): Promise<AnimationService> {
    switch (config.provider) {
      case 'grok': {
        const { GrokAnimationService } = await import('./grok-animation.service')
        return new GrokAnimationService(config.apiKey)
      }
      case 'veo': {
        const { VeoAnimationService } = await import('./veo-animation.service')
        return new VeoAnimationService(config.apiKey)
      }
      default:
        throw new Error(`Unknown animation provider: ${config.provider}`)
    }
  },

  /**
   * Get available providers
   */
  getAvailableProviders(): AnimationProvider[] {
    return ['grok', 'veo']
  }
}
