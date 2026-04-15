import { VideoRepository } from './src/infrastructure/repositories/video.repository.js'
import 'dotenv/config'

const videoRepo = new VideoRepository()

async function debug() {
  const videoId = 'ed23107b-3e97-4b2e-a7bc-e98597de2df8'
  const video = await videoRepo.findById(videoId)
  if (!video) {
    console.error('Video not found')
    import('node:process').then((p) => p.exit(1))
    return
  }

  console.info('--- VIDEO INFO ---')
  console.info(`Title: ${video.title}`)
  console.info(`Status: ${video.status}`)
  console.info(`Location Registry: ${JSON.stringify(video.locationRegistry, null, 2)}`)

  const scenes = await videoRepo.listScenes(videoId)
  console.info('\n--- SCENES INFO ---')
  scenes.forEach((s: any) => {
    console.info(`Scene ${s.sceneNumber} (${s.id}):`)
    console.info(`  LocationId: ${s.locationId}`)
    console.info(`  ImagePrompt: ${s.imagePrompt}`)
    console.info(`  ImageUrl: ${s.imageUrl}`)
  })
}

debug().catch(console.error)
