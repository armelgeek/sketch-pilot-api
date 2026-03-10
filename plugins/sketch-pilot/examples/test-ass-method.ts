/**
 * test-ass-method.ts
 *
 * Demo for the responsive ASS caption service. Three aspect ratios are
 * rendered (9:16 portrait, 1:1 square, 16:9 landscape) × three styles
 * (colored, scaling, animated-background), with custom colour overrides
 * shown for the portrait variant.
 *
 * Run:  npx ts-node examples/test-ass-method.ts
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import ffmpeg from 'fluent-ffmpeg'
import { AssCaptionService, type AssCaptionStyle, type WordTiming } from '../src/services/video/ass-caption.service'

// ─────────────────────────────────────────────────────────────────────────────
// DEMO TRANSCRIPT — replace with real Whisper word timings
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_WORDS: WordTiming[] = [
  { word: 'THE', startMs: 0, durationMs: 400 },
  { word: 'QUICK', startMs: 400, durationMs: 500 },
  { word: 'BROWN', startMs: 900, durationMs: 500 },
  { word: 'FOX', startMs: 1400, durationMs: 500 },
  { word: 'JUMPS', startMs: 1900, durationMs: 500 },
  { word: 'OVER', startMs: 2400, durationMs: 500 },
  { word: 'THE', startMs: 2900, durationMs: 400 },
  { word: 'LAZY', startMs: 3300, durationMs: 600 },
  { word: 'DOG', startMs: 3900, durationMs: 700 },
  { word: 'NEAR', startMs: 4600, durationMs: 500 },
  { word: 'A', startMs: 5100, durationMs: 300 },
  { word: 'RIVER', startMs: 5400, durationMs: 700 }
]

// ─────────────────────────────────────────────────────────────────────────────
// RENDER HELPER
// ─────────────────────────────────────────────────────────────────────────────

async function renderCaptionVideo(
  words: WordTiming[],
  service: AssCaptionService,
  style: AssCaptionStyle,
  width: number,
  height: number,
  outputDir: string,
  bgColor = '0x111111',
  durationSec?: number
): Promise<void> {
  fs.mkdirSync(outputDir, { recursive: true })

  const assContent = service.buildASSFile(words)
  const totalMs = words.at(-1).startMs + words.at(-1).durationMs
  const totalSec = durationSec ?? Math.ceil(totalMs / 1000) + 0.5

  const assPath = path.join(outputDir, `${style}.ass`)
  const videoPath = path.join(outputDir, `${style}.mp4`)

  fs.writeFileSync(assPath, assContent, 'utf-8')
  console.log(`📝  ASS written → ${assPath}`)
  console.log(`     words/line=${service.getResolvedWordsPerLine()}  fontSize=${service.getResolvedFontSize()}px`)

  // On Windows, colons in paths need escaping for libass
  const safePath = assPath.replaceAll('\\', '/').replaceAll(':', String.raw`\:`)

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(`color=c=${bgColor}:s=${width}x${height}:d=${totalSec}`)
      .inputFormat('lavfi')
      .videoFilters(`ass='${safePath}'`)
      .outputOptions(['-c:v libx264', '-preset fast', '-crf 18', '-pix_fmt yuv420p', `-t ${totalSec}`])
      .save(videoPath)
      .on('end', () => {
        console.log(`✅  [${style}] ${width}x${height} → ${videoPath}`)
        resolve()
      })
      .on('error', (err: Error) => {
        console.error(`❌  [${style}] ${err.message}`)
        reject(err)
      })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN — renders 3 aspect ratios × 3 styles = 9 videos
// ─────────────────────────────────────────────────────────────────────────────

const ASPECT_RATIOS = [
  { id: 'portrait', width: 1080, height: 1920 },
  { id: 'square', width: 1080, height: 1080 },
  { id: 'landscape', width: 1280, height: 720 }
] as const

const STYLES: AssCaptionStyle[] = ['colored', 'scaling', 'animated-background', 'bounce', 'neon', 'typewriter']

async function main() {
  const base = path.resolve('samples/captions')

  for (const ar of ASPECT_RATIOS) {
    for (const style of STYLES) {
      // Customisation example: portrait videos use a purple pill and orange highlight
      const customConfig =
        ar.id === 'portrait'
          ? {
              style,
              highlightColor: '#FF6B35', // orange
              inactiveColor: '#CCCCCC', // light grey
              pillColor: '#7C3AED', // purple
              borderSize: 3
            }
          : { style }

      const service = new AssCaptionService(ar.width, ar.height, customConfig)
      const outputDir = path.join(base, ar.id, style)
      await renderCaptionVideo(DEMO_WORDS, service, style, ar.width, ar.height, outputDir)
    }
  }

  console.log('\n🎬  All caption variants rendered!')
}

main().catch(console.error)
