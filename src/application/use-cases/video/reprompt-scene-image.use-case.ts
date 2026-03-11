import fs from 'node:fs'
import path from 'node:path'
import { VideoGenerationService } from '@/application/services/video-generation.service'
import { IUseCase } from '@/domain/types'
import { uploadBuffer } from '@/infrastructure/config/storage.config'
import { CREDIT_COSTS, PLAN_MONTHLY_LIMITS } from '@/infrastructure/config/video.config'
import { CreditsRepository } from '@/infrastructure/repositories/credits.repository'
import { VideoRepository } from '@/infrastructure/repositories/video.repository'

type RepromptSceneImageParams = {
  videoId: string
  sceneIndex: number
  userId: string
  newPrompt?: string
}

type RepromptSceneImageResponse = {
  success: boolean
  jobId?: string
  creditsRequired?: number
  error?: string
  insufficientCredits?: boolean
}

const videoRepository = new VideoRepository()
const creditsRepository = new CreditsRepository()
const videoGenerationService = new VideoGenerationService()

export class RepromptSceneImageUseCase extends IUseCase<RepromptSceneImageParams, RepromptSceneImageResponse> {
  async execute({
    videoId,
    sceneIndex,
    userId,
    newPrompt
  }: RepromptSceneImageParams): Promise<RepromptSceneImageResponse> {
    try {
      // 1. Fetch Video
      const video = await videoRepository.findByIdAndUserId(videoId, userId)
      if (!video) return { success: false, error: 'Video not found' }

      const scenes = (video.scenes as any[]) || []
      if (sceneIndex < 0 || sceneIndex >= scenes.length) {
        return { success: false, error: 'Invalid scene index' }
      }

      // 2. Credit Check
      const cost = CREDIT_COSTS.IMAGE_REPROMPT
      const credits = await creditsRepository.ensureUserCredits(userId)
      const sub = await creditsRepository.getActiveSubscription(userId)
      const actualPlan = sub?.plan || 'free'
      const planLimit = PLAN_MONTHLY_LIMITS[actualPlan] ?? PLAN_MONTHLY_LIMITS.free

      const consumedThisMonth = credits?.videosThisMonth ?? 0
      const extraCredits = credits?.extraCredits ?? 0
      const availablePlanCredits = planLimit === -1 ? Infinity : Math.max(0, planLimit - consumedThisMonth)

      if (availablePlanCredits + extraCredits < cost) {
        return {
          success: false,
          insufficientCredits: true,
          error: `Insufficient credits. Re-prompting costs ${cost} credits.`
        }
      }

      // 3. Deduct Credits
      const { planConsumed, extraConsumed } = await creditsRepository.consumeCredits(userId, cost, planLimit)
      await creditsRepository.addTransaction({
        userId,
        type: 'consumption_reprompt',
        amount: -cost,
        videoId,
        metadata: { sceneIndex, planConsumed, extraConsumed, plan: actualPlan }
      })

      // 4. Update Scene Prompt (if provided)
      if (newPrompt) {
        scenes[sceneIndex].imagePrompt = newPrompt
        if (video.script && (video.script as any).scenes) {
          ;(video.script as any).scenes[sceneIndex].imagePrompt = newPrompt
        }
      }

      // 5. Run Generation Synchronously
      const effectiveProjectId = (video.options as any)?.localProjectId
      if (!effectiveProjectId) {
        return { success: false, error: 'Project not initialized (no localProjectId)' }
      }

      const pkg = await videoGenerationService.renderVideoFromScript({
        topic: video.topic,
        userId,
        script: { ...((video.script as any) || {}), scenes } as any,
        options: {
          ...((video.options as any) || {}),
          generateFromScript: true,
          repromptSceneIndex: sceneIndex,
          localOnlyImages: false
        },
        projectId: effectiveProjectId
      })

      // 6. Upload Result to MinIO
      const scene = pkg.script?.scenes[sceneIndex]
      if (scene) {
        const sceneDir = path.join(pkg.outputPath, 'scenes', scene.id)
        const sceneWebp = path.join(sceneDir, 'scene.webp')
        const thumbnailJpg = path.join(sceneDir, 'thumbnail.jpg')

        if (fs.existsSync(sceneWebp)) {
          const buffer = fs.readFileSync(sceneWebp)
          scene.imageUrl = await uploadBuffer(`videos/${videoId}/scenes/${scene.id}/scene.webp`, buffer, 'image/webp')
        }

        if (fs.existsSync(thumbnailJpg)) {
          const buffer = fs.readFileSync(thumbnailJpg)
          scene.thumbnailUrl = await uploadBuffer(
            `videos/${videoId}/scenes/${scene.id}/thumbnail.jpg`,
            buffer,
            'image/jpeg'
          )
        }

        // Sync back to the main scenes array
        scenes[sceneIndex] = scene
      }

      // 7. Persist Updated Video Record
      const updateData: any = {
        script: pkg.script as any,
        scenes: scenes as any
      }
      if (sceneIndex === 0 && scene.thumbnailUrl) {
        updateData.thumbnailUrl = scene.thumbnailUrl
      }

      await videoRepository.updateStatus(videoId, updateData)

      return { success: true, creditsRequired: cost }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to re-prompt' }
    }
  }
}
