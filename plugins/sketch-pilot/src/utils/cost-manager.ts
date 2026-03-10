import { QualityMode, type VideoGenerationOptions } from '../types/video-script.types'

export interface CreditCosts {
  llmPerScene: number
  imagePerScene: number
  audioPerScene: number
  baseVideo: number
}

export const MODE_COSTS: Record<QualityMode, CreditCosts> = {
  [QualityMode.LOW_COST]: {
    llmPerScene: 1, // Haiku + Cache
    imagePerScene: 2, // Ultra-low + Upscale + WebP
    audioPerScene: 1, // Standard TTS
    baseVideo: 5 // Setup & Assembly
  },
  [QualityMode.STANDARD]: {
    llmPerScene: 3, // Gemini/Grok
    imagePerScene: 5, // Low/Medium quality
    audioPerScene: 2, // HQ TTS
    baseVideo: 10
  },
  [QualityMode.HIGH_QUALITY]: {
    llmPerScene: 10, // Best model
    imagePerScene: 20, // High res
    audioPerScene: 5, // Premium TTS
    baseVideo: 25
  }
}

export const CostManager = {
  calculateVideoCost(options: VideoGenerationOptions, sceneCount: number): number {
    const mode = options.qualityMode || QualityMode.STANDARD
    const costs = MODE_COSTS[mode]

    const llmCost = costs.llmPerScene * sceneCount
    const imageCost = costs.imagePerScene * sceneCount
    const audioCost = costs.audioPerScene * sceneCount

    return costs.baseVideo + llmCost + imageCost + audioCost
  },

  getOperationCost(type: 'llm' | 'image' | 'audio', mode: QualityMode = QualityMode.STANDARD): number {
    const costs = MODE_COSTS[mode]
    switch (type) {
      case 'llm':
        return costs.llmPerScene
      case 'image':
        return costs.imagePerScene
      case 'audio':
        return costs.audioPerScene
      default:
        return 0
    }
  }
}
