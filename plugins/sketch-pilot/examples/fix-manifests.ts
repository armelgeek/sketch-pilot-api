import * as fs from 'node:fs'
import * as path from 'node:path'
import { TranscriptionServiceFactory } from '../src/services/audio/transcription.service'
import { TimingMapper } from '../src/utils/timing-mapper'

async function main() {
  const projectDir = process.argv[2]
  if (!projectDir) {
    console.error('Usage: ts-node examples/fix-manifests.ts <project-dir>')
    process.exit(1)
  }

  const scriptPath = path.join(projectDir, 'script.json')
  const globalAudioPath = path.join(projectDir, 'global_narration.mp3')

  if (!fs.existsSync(scriptPath) || !fs.existsSync(globalAudioPath)) {
    console.error('Project files missing in:', projectDir)
    process.exit(1)
  }

  const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'))
  console.log(`Fixing manifests for project: ${projectDir}`)

  // 1. Transcribe global audio
  const transcriptionService = TranscriptionServiceFactory.create({
    provider: 'whisper-local',
    model: 'base',
    device: 'cpu'
  })

  console.log('Transcribing global audio...')
  const transcriptionResult = await transcriptionService.transcribe(globalAudioPath)
  const globalWordTimings = transcriptionResult.wordTimings

  // 2. Map back to scenes using the NEW TimingMapper
  console.log('Mapping timings to scenes...')
  const sceneNarrations = script.scenes.map((s: any) => ({ sceneId: s.id, narration: s.narration }))
  const mappedTimings = TimingMapper.mapScenes(sceneNarrations, globalWordTimings)

  // 3. Update manifests
  const scenesDir = path.join(projectDir, 'scenes')
  mappedTimings.forEach((timing, idx) => {
    const scene = script.scenes[idx]
    const manifestPath = path.join(scenesDir, scene.id, 'manifest.json')

    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      manifest.wordTimings = timing.wordTimings
      // Also fix the scene durations in manifest if needed
      if (manifest.videoMeta) {
        manifest.videoMeta.totalDuration = timing.end - timing.start
      }

      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
      console.log(`Updated manifest for scene: ${scene.id} (${timing.start.toFixed(2)}s -> ${timing.end.toFixed(2)}s)`)
    } else {
      console.warn(`Manifest not found for scene: ${scene.id}`)
    }
  })

  // 4. Update script.json timeRanges too
  mappedTimings.forEach((timing, idx) => {
    script.scenes[idx].timeRange.start = timing.start
    script.scenes[idx].timeRange.end = timing.end
  })
  fs.writeFileSync(scriptPath, JSON.stringify(script, null, 2))

  console.log('All manifests updated successfully!')
}

main().catch(console.error)
