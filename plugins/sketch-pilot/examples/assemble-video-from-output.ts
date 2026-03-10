import * as fs from 'node:fs'
import * as path from 'node:path'
import { NanoBananaEngine } from '../src/core/nano-banana-engine'
import { VideoAssembler } from '../src/services/video/video-assembler.service'
import type { CompleteVideoScript } from '../src/types/video-script.types'

async function main() {
  const targetFolder = process.argv[2]

  if (!targetFolder) {
    console.error('Usage: npm run assemble:video <path-to-output-folder>')
    console.error('Example: npm run assemble:video output/video-1771528938289-clf4n1')
    process.exit(1)
  }

  const projectDir = path.resolve(targetFolder)
  const scenesDir = path.join(projectDir, 'scenes')
  const scriptPath = path.join(projectDir, 'script.json')

  if (!fs.existsSync(scriptPath)) {
    console.error(`Script file not found: ${scriptPath}`)
    process.exit(1)
  }

  // --- STEP 1: AUTO-SYNC (Transcription) ---
  // We instantiate the engine just for syncing. API key and prompts are handled via defaults/env.
  const engine = new NanoBananaEngine(process.env.GOOGLE_API_KEY || 'PLACEHOLDER')
  console.log(`\n🎙️  Checking and syncing timings...`)
  await engine.syncTimings(projectDir)

  // --- STEP 2: LOAD SCRIPT (After Potential Sync) ---
  console.log(`\nLoading script from ${scriptPath}...`)
  const scriptContent = fs.readFileSync(scriptPath, 'utf8')
  const script: CompleteVideoScript = JSON.parse(scriptContent)

  const assembler = new VideoAssembler()

  // We can infer animation mode from the first scene's manifest or just default to panning
  let animationMode = 'panning'
  if (script.scenes.length > 0) {
    const firstSceneDir = path.join(scenesDir, script.scenes[0].id)
    const sceneManifestPath = path.join(firstSceneDir, 'manifest.json')
    if (fs.existsSync(sceneManifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(sceneManifestPath, 'utf8'))
      if (manifest.animationMode) {
        animationMode = manifest.animationMode
      }
    }
  }

  console.log(`Starting assembly using mode: ${animationMode}...`)
  try {
    const globalAudioPath = path.join(projectDir, 'global_narration.mp3')
    const options = {
      globalAudioPath: fs.existsSync(globalAudioPath) ? globalAudioPath : undefined
    }

    const finalVideoPath = await assembler.assembleVideo(
      script,
      scenesDir,
      projectDir,
      animationMode as 'panning' | 'ai' | 'composition' | 'static' | 'none',
      options as any
    )
    console.log(`✅ Assembly complete! Target file: ${finalVideoPath}`)
  } catch (error) {
    console.error('❌ Error during assembly:', error)
  }
}

main().catch(console.error)
