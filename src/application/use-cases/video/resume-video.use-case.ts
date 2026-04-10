import { IUseCase } from '@/domain/types'
import { getVideoQueue, redisClient, type VideoJobData } from '@/infrastructure/config/queue.config'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'

type ResumeVideoParams = {
  videoId: string
  userId: string
}

type ResumeVideoResponse = {
  success: boolean
  jobId?: string
  streamUrl?: string
  error?: string
}

const videoRepository = new VideoRepository()

export class ResumeVideoUseCase extends IUseCase<ResumeVideoParams, ResumeVideoResponse> {
  async execute({ videoId, userId }: ResumeVideoParams): Promise<ResumeVideoResponse> {
    try {
      const video = await videoRepository.findByIdAndUserId(videoId, userId)

      if (!video) {
        return { success: false, error: 'Video not found' }
      }

      // 1. Clear any existing Redis lock for this video to allow a new worker to pick it up
      const lockKey = `active-video-job:${videoId}`
      await redisClient.del(lockKey)

      const jobId = crypto.randomUUID()

      // 2. Update video record with NEW jobId but KEEP progress and script
      await videoRepository.updateStatus(videoId, {
        jobId,
        status: 'queued',
        // We don't reset progress or currentStep because we want the UI/Worker to see where we are
        errorMessage: null as any
      })

      // 3. Resolve options
      const videoOptions = (video.options as any) || {}

      // 4. Enqueue the BullMQ job pointing to the same videoId
      const jobData: VideoJobData = {
        jobId,
        userId,
        videoId,
        topic: video.topic,
        cost: video.creditsUsed || 0, // No new cost
        options: {
          duration: videoOptions.duration,
          sceneCount: videoOptions.sceneCount || video.scenes?.length,
          language: video.language,
          voiceProvider: videoOptions.audioProvider,
          voiceId: videoOptions.voiceId || videoOptions.kokoroVoicePreset,
          llmProvider: videoOptions.llmProvider,
          imageProvider: videoOptions.imageProvider,
          qualityMode: videoOptions.qualityMode,
          generateFromScript: !!video.script,

          seriesId: video.seriesId,
          episodeNumber: video.episodeNumber
        }
      }

      const queue = getVideoQueue()
      await queue.add('generate-video', jobData, {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }
      })

      return {
        success: true,
        jobId,
        streamUrl: `/api/v1/videos/jobs/${jobId}/stream`
      }
    } catch (error) {
      console.error(`[ResumeVideoUseCase] Failed to resume video ${videoId}:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Resume failed to enqueue'
      }
    }
  }
}
