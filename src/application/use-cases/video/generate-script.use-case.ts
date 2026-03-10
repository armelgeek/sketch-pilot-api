import { ScriptGenerationService, type GenerateScriptOptions } from '@/application/services/script-generation.service'
import { IUseCase } from '@/domain/types'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'
import type { CompleteVideoScript } from '@sketch-pilot/types/video-script.types'

type GenerateScriptParams = {
  userId: string
  topic: string
  options?: GenerateScriptOptions
}

type GenerateScriptResponse = {
  success: boolean
  script?: CompleteVideoScript
  videoId?: string
  metadata?: {
    sceneCount: number
    estimatedDuration: number
    language: string
  }
  error?: string
}

const scriptGenerationService = new ScriptGenerationService()
const videoRepository = new VideoRepository()

export class GenerateScriptUseCase extends IUseCase<GenerateScriptParams, GenerateScriptResponse> {
  async execute({ userId, topic, options = {} }: GenerateScriptParams): Promise<GenerateScriptResponse> {
    try {
      const script = await scriptGenerationService.generateScript(topic, options)

      const videoId = crypto.randomUUID()
      await videoRepository.create({
        id: videoId,
        userId,
        topic,
        status: 'draft',
        progress: 100,
        options,
        genre: options.videoGenre,
        type: options.videoType,
        language: options.language || 'en',
        script,
        scenes: script.scenes
      })

      return {
        success: true,
        script,
        videoId,
        metadata: {
          sceneCount: script.scenes?.length ?? 0,
          estimatedDuration: script.totalDuration ?? options.maxDuration ?? 60,
          language: options.language ?? 'en'
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Script generation failed'
      }
    }
  }
}
