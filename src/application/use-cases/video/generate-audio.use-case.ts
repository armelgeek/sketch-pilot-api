import { checkpointService } from '@/application/services/video-checkpoint.service'
import { IUseCase } from '@/domain/types'
import { getVideoQueue, redisClient, type VideoJobData } from '@/infrastructure/config/queue.config'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'

type GenerateAudioParams = {
  videoId: string
  userId: string
  options?: any
}

type GenerateAudioResponse = {
  success: boolean
  jobId?: string
  error?: string
}

const videoRepository = new VideoRepository()

export class GenerateAudioUseCase extends IUseCase<GenerateAudioParams, GenerateAudioResponse> {
  async execute({ videoId, userId, options = {} }: GenerateAudioParams): Promise<GenerateAudioResponse> {
    try {
      const video = await videoRepository.findByIdAndUserId(videoId, userId)
      if (!video) {
        return { success: false, error: 'Video not found or unauthorized' }
      }

      const existingOptions = (video.options as any) || {}

      const audioOptions = {
        ...existingOptions,
        ...options,
        scriptOnly: false,
        generateOnlyScenes: false,
        generateOnlyAudio: true, // Key flag for the worker
        generateOnlyAssembly: false,
        generateFromScript: true, // Prevent AI from re-writing the whole script!
        forceRegenerateAudio: true // Ensure NanoBanana re-generates it
      }

      const jobId = crypto.randomUUID()

      await videoRepository.updateStatus(videoId, {
        jobId,
        status: 'queued',
        options: audioOptions
      })

      // CRITICAL: Clear any existing lock for this videoId to prevent 'deferred' jobs
      const lockKey = `active-video-job:${videoId}`
      await redisClient.del(lockKey)

      // CRITICAL: Clear previous completion checkpoint so the worker actually runs the pipeline
      await checkpointService.deleteCheckpoint(videoId)

      const jobData: VideoJobData = {
        jobId: videoId,
        userId,
        videoId,
        topic: video.topic,
        options: audioOptions
      }

      const queue = getVideoQueue()
      await queue.add('generate-video', jobData, {
        jobId, // Unique jobId to allow sequential passes
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }
      })

      return {
        success: true,
        jobId
      }
    } catch (error) {
      console.error('[GenerateAudioUseCase] Job Enqueue Failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to enqueue audio job'
      }
    }
  }
}
