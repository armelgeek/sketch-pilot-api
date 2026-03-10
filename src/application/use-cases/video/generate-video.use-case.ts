import { IUseCase } from '@/domain/types'
import { getVideoQueue, type VideoJobData } from '@/infrastructure/config/queue.config'
import { PLAN_MONTHLY_LIMITS } from '@/infrastructure/config/video.config'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'
import type { VideoGenerationOptions } from '@sketch-pilot/types/video-script.types'

type GenerateVideoParams = {
  userId: string
  planId?: string
  topic: string
  options?: Partial<VideoGenerationOptions>
}

type GenerateVideoResponse = {
  success: boolean
  jobId?: string
  videoId?: string
  streamUrl?: string
  estimatedDuration?: number
  creditsRequired?: number
  error?: string
  insufficientCredits?: boolean
}

/** Map VideoGenerationOptions to the flat VideoJobData.options shape. */
function toJobOptions(options: Partial<VideoGenerationOptions>): VideoJobData['options'] {
  return {
    duration: options.maxDuration,
    sceneCount: options.sceneCount,
    style: options.style,
    videoType: options.videoType,
    videoGenre: options.videoGenre,
    language: options.language,
    voiceProvider: options.audioProvider,
    voiceId: options.kokoroVoicePreset?.toString(),
    llmProvider: options.llmProvider,
    imageProvider: options.imageProvider,
    qualityMode: options.qualityMode,
    characterConsistency: options.characterConsistency,
    autoTransitions: options.autoTransitions
  }
}

const videoRepository = new VideoRepository()
const creditsRepository = new CreditsRepository()

export class GenerateVideoUseCase extends IUseCase<GenerateVideoParams, GenerateVideoResponse> {
  async execute({ userId, planId, topic, options = {} }: GenerateVideoParams): Promise<GenerateVideoResponse> {
    try {
      // Check quota
      const credits = await creditsRepository.ensureUserCredits(userId)
      const plan = planId || 'free'
      const monthlyLimit = PLAN_MONTHLY_LIMITS[plan] ?? PLAN_MONTHLY_LIMITS.free
      const videosThisMonth = credits?.videosThisMonth ?? 0
      const extraCredits = credits?.extraCredits ?? 0
      const hasMonthlyQuota = monthlyLimit === -1 || videosThisMonth < monthlyLimit
      const hasExtraCredits = extraCredits > 0

      if (!hasMonthlyQuota && !hasExtraCredits) {
        return {
          success: false,
          insufficientCredits: true,
          error: 'Insufficient credits. Please upgrade your plan or purchase additional credits.'
        }
      }

      // Create the video record
      const videoId = crypto.randomUUID()
      const jobId = crypto.randomUUID()

      await videoRepository.create({
        id: videoId,
        userId,
        topic,
        options,
        genre: options.videoGenre,
        type: options.videoType,
        language: options.language || 'en'
      })

      await videoRepository.updateStatus(videoId, { jobId, status: 'queued' })

      // Enqueue the BullMQ job
      const jobData: VideoJobData = {
        jobId,
        userId,
        videoId,
        topic,
        options: toJobOptions(options)
      }

      const queue = getVideoQueue()
      await queue.add('generate-video', jobData, {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }
      })

      // Deduct credit
      if (hasMonthlyQuota) {
        await creditsRepository.incrementVideosThisMonth(userId)
      } else {
        await creditsRepository.deductExtraCredit(userId)
      }

      await creditsRepository.addTransaction({
        userId,
        type: 'consumption',
        amount: -1,
        videoId
      })

      return {
        success: true,
        jobId,
        videoId,
        streamUrl: `/api/v1/videos/jobs/${jobId}/stream`,
        estimatedDuration: 180,
        creditsRequired: 1
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Video generation failed to enqueue'
      }
    }
  }
}
