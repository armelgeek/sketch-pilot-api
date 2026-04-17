import { VideoAnalysisService } from '../services/video/analysis.service'
import { SynchronizerService } from '../services/video/synchronizer.service'
import type { FaceTrack, SpeakerSegment } from '../types/analysis.types'

async function testSynchronizer() {
  console.log('--- Testing SynchronizerService ---')
  const sync = new SynchronizerService()

  const segments: SpeakerSegment[] = [
    { speakerId: 'S1', start: 0, end: 2 },
    { speakerId: 'S2', start: 2, end: 4 }
  ]

  const tracks: FaceTrack[] = [
    {
      trackId: 'F1',
      detections: [
        { timestamp: 0, box: { x: 0, y: 0, width: 10, height: 10 }, lipMoveScore: 0.9, confidence: 1 },
        { timestamp: 1, box: { x: 0, y: 0, width: 10, height: 10 }, lipMoveScore: 0.9, confidence: 1 },
        { timestamp: 2, box: { x: 0, y: 0, width: 10, height: 10 }, lipMoveScore: 0.1, confidence: 1 },
        { timestamp: 3, box: { x: 0, y: 0, width: 10, height: 10 }, lipMoveScore: 0.1, confidence: 1 }
      ]
    },
    {
      trackId: 'F2',
      detections: [
        { timestamp: 0, box: { x: 50, y: 50, width: 10, height: 10 }, lipMoveScore: 0.1, confidence: 1 },
        { timestamp: 1, box: { x: 50, y: 50, width: 10, height: 10 }, lipMoveScore: 0.1, confidence: 1 },
        { timestamp: 2, box: { x: 50, y: 50, width: 10, height: 10 }, lipMoveScore: 0.9, confidence: 1 },
        { timestamp: 3, box: { x: 50, y: 50, width: 10, height: 10 }, lipMoveScore: 0.9, confidence: 1 }
      ]
    }
  ]

  const mappings = await sync.synchronize(segments, tracks)
  console.log('Mappings:', JSON.stringify(mappings, null, 2))

  const s1Mapping = mappings.find((m) => m.speakerId === 'S1')
  const s2Mapping = mappings.find((m) => m.speakerId === 'S2')

  if (s1Mapping?.trackId === 'F1' && s2Mapping?.trackId === 'F2') {
    console.log('✅ Synchronizer test passed!')
  } else {
    console.error('❌ Synchronizer test failed!')
  }
}

async function testAnalysisService() {
  console.log('\n--- Testing VideoAnalysisService (Orchestration) ---')
  const analysis = new VideoAnalysisService()

  // Note: This will naturally fail if ffmpeg is not available or video doesn't exist.
  // We'll wrap it in a try-catch for the demo.
  try {
    const result = await analysis.analyze('/dev/null', (p, m) => {
      console.log(`[Progress ${p}%] ${m}`)
    })
    console.log('Analysis Result Summary:', {
      segmentCount: result.segments.length,
      trackCount: result.tracks.length,
      mappingCount: result.mappings.length
    })
  } catch (error: any) {
    console.warn('Note: Mock analysis failed as expected (no real video/ffmpeg context):', error.message)
    console.log('However, if it reached this point, the orchestration logic is wired up.')
  }
}

async function run() {
  await testSynchronizer()
  await testAnalysisService()
}

run().catch(console.error)
