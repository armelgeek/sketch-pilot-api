import * as fs from 'node:fs'
import * as path from 'node:path'
import { TranscriptionServiceFactory } from '../src/services/audio/transcription.service'

async function testWhisperLocal() {
  const audioPath = path.resolve('output/video-1771528518504-e410ko/scenes/scene_1/narration.mp3')

  if (!fs.existsSync(audioPath)) {
    console.error(`❌ Audio file not found at ${audioPath}`)
    console.log('Please make sure you have generated a video first or update the path in this script.')
    return
  }

  console.log(`🚀 Starting local Whisper transcription for: ${audioPath}`)

  try {
    const transcriber = TranscriptionServiceFactory.create({
      provider: 'whisper-local'
    })

    const startTime = Date.now()
    const result = await transcriber.transcribe(audioPath)
    const duration = (Date.now() - startTime) / 1000

    console.log(`\n✅ Transcription completed in ${duration}s`)
    console.log(`\n📝 TEXT:\n"${result.text}"`)

    console.log(`\n⏱️ WORD TIMINGS (first 10):`)
    result.wordTimings.slice(0, 10).forEach((wt, i) => {
      console.log(`  [${i}] "${wt.word}" : ${wt.start.toFixed(2)}s -> ${wt.end.toFixed(2)}s (${wt.durationMs}ms)`)
    })

    if (result.wordTimings.length > 10) {
      console.log(`  ... and ${result.wordTimings.length - 10} more words.`)
    }
  } catch (error) {
    console.error(`\n❌ Test failed:`, error)
  }
}

testWhisperLocal()
