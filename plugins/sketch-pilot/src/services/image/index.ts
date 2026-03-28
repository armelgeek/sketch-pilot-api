/**
 * Image Service Interface and Factory
 */

export interface ImageService {
  generateImage: (
    prompt: string,
    filename: string,
    options?: {
      aspectRatio?: string
      removeBackground?: boolean
      skipTrim?: boolean
      referenceImages?: (string | { name?: string; data: string })[]
      systemInstruction?: string
      /** Quality level: 'ultra-low' (20%→20x cheaper, 'low' (40%)→10x cheaper, 'medium' (60%), 'high' (100%=default) */
      quality?: 'ultra-low' | 'low' | 'medium' | 'high'
      /** Smart upscale ultra-low images back to usable size (cheap, bicubic interpolation) */
      smartUpscale?: boolean
      /** Output format: 'png' (default) or 'webp' (30% smaller, faster) */
      format?: 'png' | 'webp'
      /** Deterministic seed for reproducible generation (ensures consistency) */
      characterSheets?: any[]
      seed?: number
    }
  ) => Promise<string>
}

export type ImageProvider = 'gemini' | 'grok' | 'demo'

export interface ImageServiceConfig {
  provider: ImageProvider
  apiKey: string
  styleSuffix?: string
  systemPrompt?: string
  /** Default quality level for all images (can be overridden per call) */
  defaultQuality?: 'ultra-low' | 'low' | 'medium' | 'high'
}

/**
 * Factory for creating image service instances
 */
export const ImageServiceFactory = {
  /**
   * Create an image service based on the configuration
   */
  create(config: ImageServiceConfig): ImageService {
    switch (config.provider) {
      case 'gemini':
        const { GeminiImageService } = require('./gemini-image.service')
        return new GeminiImageService(config)
      case 'grok':
        const { GrokImageService } = require('./grok-image.service')
        return new GrokImageService(config)
      case 'demo':
        const { DemoImageService } = require('./demo-image.service')
        return new DemoImageService(config)
      default:
        throw new Error(`Unknown image provider: ${config.provider}`)
    }
  },

  /**
   * Get available providers
   */
  getAvailableProviders(): ImageProvider[] {
    return ['gemini', 'grok', 'demo']
  }
}
