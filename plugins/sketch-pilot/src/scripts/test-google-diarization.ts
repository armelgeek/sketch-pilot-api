import * as fs from 'node:fs'
import * as path from 'node:path'
import * as dotenv from 'dotenv'
import { GoogleDiarizationService } from '../services/audio/diarization.service'

// Load environment variables (.env)
dotenv.config()

async function runTest() {
  const audioPath = process.argv[2]

  if (!audioPath) {
    console.error('Usage: npx tsx plugins/sketch-pilot/src/scripts/test-google-diarization.ts <path_to_audio_file>')
    process.exit(1)
  }

  const absolutePath = path.resolve(audioPath)
  if (!fs.existsSync(absolutePath)) {
    console.error(`File not found: ${absolutePath}`)
    process.exit(1)
  }

  console.log(`--- Testing Google Diarization with: ${absolutePath} ---`)

  // Use API Key from environment if available
  const apiKey = process.env.GOOGLE_CLOUD_API_KEY || process.env.GEMINI_API_KEY
  const service = new GoogleDiarizationService(apiKey)

  try {
    const segments = await service.diarize(absolutePath, (progress, message) => {
      console.log(`[${progress}%] ${message}`)
    })

    console.log('\n--- Results ---')
    console.log(`Detected ${segments.length} segments.`)

    segments.forEach((seg, i) => {
      console.log(`[${seg.start.toFixed(2)}s - ${seg.end.toFixed(2)}s] ${seg.speakerId}: ${seg.text}`)
    })

    // Export to JSON for inspection
    const outputPath = `${absolutePath}.diarization.json`
    fs.writeFileSync(outputPath, JSON.stringify(segments, null, 2))
    console.log(`\nFull results exported to: ${outputPath}`)
  } catch (error: any) {
    console.error('\n❌ Diarization failed:', error.message)
    if (error.code === 'MODULE_NOT_FOUND') {
      console.error('Hint: Make sure to run "npm install @google-cloud/speech"')
    }
  }
}

runTest()
