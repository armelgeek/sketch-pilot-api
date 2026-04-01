import { checkpointService } from '@/application/services/video-checkpoint.service'
import { IUseCase } from '@/domain/types'
import { getVideoQueue, redisClient, type VideoJobData } from '@/infrastructure/config/queue.config'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'

type AssembleVideoParams = {
  videoId: string
  userId: string
}

type AssembleVideoResponse = {
  success: boolean
  jobId?: string
  error?: string
}

const videoRepository = new VideoRepository()

export class AssembleVideoUseCase extends IUseCase<AssembleVideoParams, AssembleVideoResponse> {
  async execute({ videoId, userId }: AssembleVideoParams): Promise<AssembleVideoResponse> {
    try {
      // 1. Validate video exists and belongs to user
      let video = await videoRepository.findByIdAndUserId(videoId, userId)
      if (!video) {
        return { success: false, error: 'Video not found or unauthorized' }
      }

      // 2. Handle race condition: if video is still 'queued', wait a bit and retry once
      // This happens because the frontend might trigger assembly immediately after SSE 'completed'
      if (video.status === 'queued') {
        console.info(`[AssembleVideoUseCase] Video ${videoId} is still 'queued'. Retrying in 800ms...`)
        await new Promise((resolve) => setTimeout(resolve, 800))
        video = await videoRepository.findByIdAndUserId(videoId, userId)
        if (!video) return { success: false, error: 'Video lost during retry' }
      }

      // 2. Ensure video is in a state ready for assembly
      const allowedStatuses = ['scenes_generated', 'narration_generated', 'completed', 'failed']
      if (!allowedStatuses.includes(video.status)) {
        return {
          success: false,
          error: `Video must be in 'scenes_generated' or 'narration_generated' state to assemble (Current: ${video.status})`
        }
      }

      // 3. Prepare job data with forced assembly constraints
      // We pass the existing options but force generateOnlyAssembly = true
      // and ensure scriptOnly / generateOnlyScenes / generateOnlyAudio are false.
      const existingOptions = (video.options as any) || {}

      const assemblyOptions = {
        ...existingOptions,
        scriptOnly: false,
        generateOnlyScenes: false,
        generateOnlyAudio: false,
        generateOnlyAssembly: true,
        generateFromScript: true // Key fix: ensures the worker calls the engine to render!
        // Optional: We could also pass a forceRegenerateAudio/Video flag if we expose it in UI
      }

      const jobId = crypto.randomUUID()

      // 4. Update status back to queued
      await videoRepository.updateStatus(videoId, {
        jobId,
        status: 'queued',
        options: assemblyOptions
      })

      // CRITICAL: Clear any existing lock for this videoId to prevent 'deferred' jobs
      const lockKey = `active-video-job:${videoId}`
      await redisClient.del(lockKey)

      // CRITICAL: Clear checkpoint to force the worker to re-run the script/render pipeline
      await checkpointService.deleteCheckpoint(videoId)

      // 5. Enqueue the BullMQ job
      const jobData: VideoJobData = {
        jobId: videoId, // Use videoId for deduplication
        userId,
        videoId,
        topic: video.topic,
        options: assemblyOptions
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
      console.error('[AssembleVideoUseCase] Job Enqueue Failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to enqueue assembly job'
      }
    }
  }
}
