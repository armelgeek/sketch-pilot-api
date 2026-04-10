import process from 'node:process'
import { GenerateVideoUseCase } from '../src/application/use-cases/video/generate-video.use-case'
import { SeriesRepository } from '../src/infrastructure/repositories/series.repository'
import { VideoRepository } from '../src/infrastructure/repositories/video.repository'
import 'dotenv/config'

async function verify() {
  console.log('🚀 Starting Series Association Verification...')

  const testUserId = 'wgAwz9UjJN8M3q6mMaQFLapekObWj3U4'
  const generateUseCase = new GenerateVideoUseCase()
  const seriesRepo = new SeriesRepository()
  const videoRepo = new VideoRepository()

  try {
    // 1. Test Lazy Creation (No series exists)
    console.log('\n--- Test 1: Lazy Creation (First Episode) ---')
    const topic1 = "Une aventure épique dans l'espace"
    const result1 = await generateUseCase.execute({
      userId: testUserId,
      topic: topic1,
      options: { type: 'series' }
    })

    if (!result1.success) throw new Error(`Test 1 failed: ${result1.error}`)
    console.log('✅ First episode enqueued. JobId:', result1.jobId)

    // Verify series was created
    const userSeries = await seriesRepo.findByUserId(testUserId)
    if (userSeries.length !== 1) throw new Error('Series was not created automatically')
    const createdSeries = userSeries[0]
    console.log('✅ Series created automatically:', createdSeries.title)

    // Verify video association
    const savedVideo1 = await videoRepo.findById(result1.videoId!)
    if (!savedVideo1 || savedVideo1.seriesId !== createdSeries.id) throw new Error('Video 1 not linked to series')
    if (savedVideo1.episodeNumber !== 1) throw new Error('Incorrect episode number for Video 1')
    console.log('✅ Video 1 correctly linked as Episode 1')

    // 2. Test Automatic Association (Second Episode)
    console.log('\n--- Test 2: Automatic Association (Second Episode) ---')
    const topic2 = "La suite de l'aventure"
    const result2 = await generateUseCase.execute({
      userId: testUserId,
      topic: topic2,
      options: { type: 'series' }
    })

    if (!result2.success) throw new Error(`Test 2 failed: ${result2.error}`)
    console.log('✅ Second episode enqueued. JobId:', result2.jobId)

    // Verify video association
    const savedVideo2 = await videoRepo.findById(result2.videoId!)
    if (!savedVideo2 || savedVideo2.seriesId !== createdSeries.id)
      throw new Error('Video 2 not linked to the same series')
    if (savedVideo2.episodeNumber !== 2) throw new Error('Incorrect episode number for Video 2')
    console.log('✅ Video 2 correctly linked as Episode 2 to the same saga')

    console.log('\n🎉 ALL TESTS PASSED! Episoic continuity is working perfectly.')
  } catch (error) {
    console.error('\n❌ VERIFICATION FAILED:', error)
  } finally {
    console.log('\n✨ Verification script finished.')
    process.exit(0)
  }
}

verify()
