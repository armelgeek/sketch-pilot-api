import { IUseCase } from '@/domain/types'
import { getVideoQueue, type VideoJobData } from '@/infrastructure/config/queue.config'
import { PLAN_MONTHLY_LIMITS } from '@/infrastructure/config/video.config'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'

type RenderVideoParams = {
  videoId: string
  userId: string
  planId?: string
  script: any
}

type RenderVideoResponse = {
  success: boolean
  jobId?: string
  streamUrl?: string
  estimatedDuration?: number
  creditsRequired?: number
  error?: string
  insufficientCredits?: boolean
}

const videoRepository = new VideoRepository()
const creditsRepository = new CreditsRepository()

export class RenderVideoUseCase extends IUseCase<RenderVideoParams, RenderVideoResponse> {
  async execute({ videoId, userId, planId, script }: RenderVideoParams): Promise<RenderVideoResponse> {
    try {
      // 1. Check if video exists and belongs to user
      const video = await videoRepository.findByIdAndUserId(videoId, userId)
      if (!video) {
        return { success: false, error: 'Video not found' }
      }

      // 2. Check quota
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

      // 3. Update the video record with the new script and status
      const jobId = crypto.randomUUID()
      await videoRepository.updateStatus(videoId, {
        jobId,
        status: 'queued',
        script,
        scenes: script.scenes,
        progress: 10,
        currentStep: 'Starting rendering from script'
      })

      // 4. Enqueue the BullMQ job with generateFromScript flag
      const options = (video.options as any) || {}
      const jobData: VideoJobData = {
        jobId,
        userId,
        videoId,
        topic: video.topic,
        options: {
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
          autoTransitions: options.autoTransitions,
          generateFromScript: true // FLAG indicating to skip LLM
        }
      }

      const queue = getVideoQueue()
      await queue.add('generate-video', jobData, {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }
      })

      // 5. Deduct credit
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
        streamUrl: `/api/v1/videos/jobs/${jobId}/stream`,
        estimatedDuration: 180,
        creditsRequired: 1
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Render job failed to enqueue'
      }
    }
  }
}
