import { VideoRepository } from '../../../infrastructure/repositories/video.repository'

async function repair(videoId: string) {
  const videoRepo = new VideoRepository()
  const video = await videoRepo.findById(videoId)

  if (!video) {
    console.error(`Video ${videoId} not found`)
    return
  }

  if (video.script && (video.script as any).scenes) {
    console.info(`Video ${videoId} already has a script. Skipping.`)
    return
  }

  console.info(`Repairing script for video ${videoId}...`)

  // FindById already attaches scenes from video_scenes table
  const scenes = video.scenes || []

  if (scenes.length === 0) {
    console.warn(`No scenes found for video ${videoId}. Cannot repair.`)
    return
  }

  const script = {
    titles: [video.title || video.topic.slice(0, 50)],
    topic: video.topic,
    fullNarration: video.narrationLayer?.narration || '',
    totalDuration: scenes.reduce((acc: number, s: any) => acc + (Number(s.duration) || 5), 0),
    sceneCount: scenes.length,
    scenes: scenes.map((s: any, idx: number) => ({
      id: s.id.split(':').pop(), // Remove videoId prefix if present
      sceneNumber: s.sceneNumber || idx + 1,
      narration: s.narration,
      imagePrompt: s.imagePrompt,
      locationId: s.locationId,
      charactersInScene: [] // Registry mapping might be missing here but it's okay for generation from prompt
    })),
    seriesMetadata: {
      episodeSummary: video.topic,
      characterContinuity: video.characterRegistry || {}
    }
  }

  await videoRepo.updateStatus(videoId, { script })
  console.info(`✅ Successfully repaired video ${videoId}`)
}

const targetId = 'dade98cb-467c-4762-af6e-caeeaa788406-ep1'
repair(targetId).catch(console.error)
