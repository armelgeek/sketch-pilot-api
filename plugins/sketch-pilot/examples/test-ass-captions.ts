import fs from 'node:fs'
import path from 'node:path'
import { AssCaptionService, type AssCaptionStyle } from '../src/services/video/ass-caption.service'

const outputDir = path.join(__dirname, '..', 'output')
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}

const mockWords = [
  { word: 'This', startMs: 0, durationMs: 300 },
  { word: 'is', startMs: 300, durationMs: 200 },
  { word: 'a', startMs: 500, durationMs: 150 },
  { word: 'completely', startMs: 650, durationMs: 600 },
  { word: 'isolated', startMs: 1300, durationMs: 500 },
  { word: 'test', startMs: 1800, durationMs: 400 },
  { word: 'of', startMs: 2200, durationMs: 200 },
  { word: 'subtitles.', startMs: 2400, durationMs: 600 }
]

const styles: AssCaptionStyle[] = ['colored', 'scaling', 'animated-background', 'bounce', 'neon', 'typewriter']

async function runTest() {
  console.log(String.raw`Testing ASS Caption Service...\n`)

  for (const style of styles) {
    console.log(`Generating ${style} subtitles...`)
    const service = new AssCaptionService(1080, 1920, {
      style,
      fontSize: 60,
      position: 'center',
      fontFamily: 'Arial'
    })

    const assContent = service.buildASSFile(mockWords)
    const outputPath = path.join(outputDir, `test-captions-${style}.ass`)

    fs.writeFileSync(outputPath, assContent, 'utf-8')
    console.log(`  -> Saved to ${outputPath}`)
  }

  console.log(
    String.raw`\nTest complete. You can preview these .ass files with a video player like VLC or MPV, or render them with FFmpeg.\n`
  )
  console.log('Example FFmpeg command:')
  console.log(
    'ffmpeg -f lavfi -i color=c=black:s=1080x1920:d=5 -vf "ass=output/test-captions-animated-background.ass" output/test-render.mp4'
  )
}

runTest().catch(console.error)
