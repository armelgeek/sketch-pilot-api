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

  console.log('--- VIDEO INFO ---')
  console.log(`Title: ${video.title}`)
  console.log(`Status: ${video.status}`)
  console.log(`Location Registry: ${JSON.stringify(video.locationRegistry, null, 2)}`)

  const scenes = await videoRepo.listScenes(videoId)
  console.log('\n--- SCENES INFO ---')
  scenes.forEach((s: any) => {
    console.log(`Scene ${s.sceneNumber} (${s.id}):`)
    console.log(`  LocationId: ${s.locationId}`)
    console.log(`  ImagePrompt: ${s.imagePrompt}`)
    console.log(`  ImageUrl: ${s.imageUrl}`)
  })
}

debug().catch(console.error)
