/**
 * generate-caption-previews.ts
 *
 * Generates PNG preview images, .ass subtitle files, and MP4 videos for every
 * aspect-ratio × caption-style combination, then assembles a comparison
 * grid so the responsive / customisable behaviour of AssCaptionService
 * can be seen at a glance.
 *
 * Run:  npx ts-node examples/generate-caption-previews.ts
 * or:  npx ts-node examples/generate-caption-previews.ts path/to/audio.mp3
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import ffmpeg from 'fluent-ffmpeg'
import sharp from 'sharp'
import { WhisperLocalService } from '../src/services/audio/whisper-local.service'
import { AssCaptionService, type AssCaptionStyle } from '../src/services/video/ass-caption.service'
import type { WordTiming } from '../src/services/audio/index'

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

let DEMO_WORDS: WordTiming[] = []

/**
 * Per-aspect-ratio thumbnail dimensions. Each cell is rendered at exactly
 * these pixel dimensions (no sharp resize needed). The grid uses a fixed
 * THUMB_COL_W column so every column is the same width regardless of the
 * thumbnail width — portrait/square cells are centred inside their column.
 *
 * Landscape gets a wider cell (480 px) so 4 words stay readable without
 * needing a tiny font.
 */
const THUMB_ASPECT_RATIOS = [
  { label: 'Portrait 9:16', id: 'portrait', thumbW: 270, thumbH: 480 },
  { label: 'Square 1:1', id: 'square', thumbW: 360, thumbH: 360 },
  { label: 'Landscape 16:9', id: 'landscape', thumbW: 480, thumbH: 270 }
] as const

// ─────────────────────────────────────────────────────────────────────────────
// LOAD DEMO WORDS FROM AUDIO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find the first audio file recursively in the specified directory.
 * Looks for: .mp3, .wav, .m4a, .ogg, .flac
 */
function findAudioFile(dir: string): string | null {
  const AUDIO_EXTS = ['.mp3', '.wav', '.m4a', '.ogg', '.flac']

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isFile() && AUDIO_EXTS.some((ext) => entry.name.toLowerCase().endsWith(ext))) {
        return fullPath
      }
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const found = findAudioFile(path.join(dir, entry.name))
        if (found) return found
      }
    }
  } catch {
    // Directory doesn't exist or not readable
  }

  return null
}

/**
 * Load word timings from an audio file using Whisper local.
 * If audioPath is provided, transcribe it and update DEMO_WORDS.
 */
async function loadDemoWordsFromAudio(audioPath: string): Promise<void> {
  console.log(`\n🎙️   Transcribing audio: ${audioPath}\n`)

  const whisper = new WhisperLocalService({
    model: 'base',
    device: 'cpu',
    language: 'en'
  })

  try {
    const result = await whisper.transcribe(audioPath)

    // Clean punctuation from words
    DEMO_WORDS = result.wordTimings
      .map((w) => ({
        ...w,
        word: w.word.replaceAll(/[.,!?;:\-—–()[\]{}"'«»]/g, '').trim()
      }))
      .filter((w) => w.word.length > 0) // Remove empty entries

    console.log(`✅  Loaded ${DEMO_WORDS.length} words from Whisper transcription\n`)
  } catch (error) {
    console.error(`❌  Failed to transcribe audio: ${error}`)
    process.exit(1)
  }
}

/** Full resolutions used for .ass file generation. */
const FULL_ASPECT_RATIOS = [
  { id: 'portrait', width: 1080, height: 1920 },
  { id: 'square', width: 1080, height: 1080 },
  { id: 'landscape', width: 1280, height: 720 }
] as const

const STYLES: { id: AssCaptionStyle; label: string }[] = [
  { id: 'colored', label: 'Colored words' },
  { id: 'scaling', label: 'Scaling words' },
  { id: 'animated-background', label: 'Animated BG' },
  { id: 'bounce', label: 'Bounce' },
  { id: 'neon', label: 'Neon' },
  { id: 'typewriter', label: 'Typewriter' }
]

const OUT_DIR = path.resolve('samples/captions')
const PREVIEW_FONT_FAMILY = 'Montserrat'

function getBaseCharWidthRatio(fontFamily: string): number {
  const name = fontFamily.toLowerCase()
  if (name.includes('bebas')) return 0.31
  if (name.includes('montserrat')) return 0.56
  if (name.includes('ubuntu')) return 0.55
  if (name.includes('arial')) return 0.54
  return 0.52
}

function getCharWidthUnit(char: string): number {
  if (!char) return 0
  if (/\s/.test(char)) return 0.6
  if (/[MW@#%&]/.test(char)) return 1.35
  if (/[IJLTF]/.test(char)) return 0.68
  if (/[.,:;!'"`|]/.test(char)) return 0.4
  if (/[\-_/\\]/.test(char)) return 0.55
  return 1
}

function estimateWordWidthPx(word: string, fontSize: number, fontFamily = PREVIEW_FONT_FAMILY): number {
  const ratio = getBaseCharWidthRatio(fontFamily)
  const units = [...word.toUpperCase()].reduce((sum, char) => sum + getCharWidthUnit(char), 0)
  return Math.max(1, Math.round(units * fontSize * ratio))
}

function estimateSpaceWidthPx(fontSize: number, fontFamily = PREVIEW_FONT_FAMILY): number {
  const ratio = getBaseCharWidthRatio(fontFamily)
  return Math.max(2, Math.round(fontSize * ratio * 0.52))
}

function getStyleSpacingMultiplier(style: AssCaptionStyle): number {
  if (style === 'scaling') return 1.14
  if (style === 'animated-background') return 1.22
  return 1
}

/**
 * Returns the largest font size (stepping down by 2px from `maxSize`) at which
 * all `words` fit within `maxWidth` pixels.
 * Uses dynamic per-character width estimation with font-aware defaults.
 * When `activeScale > 1` the middle word is treated as occupying
 * `measuredWordWidth * activeScale` pixels (scaling-style preview) so the
 * font is reduced early enough to prevent adjacent-word overlap.
 */
function calcFitFontSize(
  words: string[],
  maxWidth: number,
  style: AssCaptionStyle,
  minSize = 16,
  maxSize = 80,
  activeScale = 1
): number {
  const activeIdx = Math.floor(words.length / 2)
  const spacingMultiplier = getStyleSpacingMultiplier(style)
  for (let fs = maxSize; fs >= minSize; fs -= 2) {
    const spaceW = estimateSpaceWidthPx(fs) * spacingMultiplier
    const totalW =
      words.reduce(
        (sum, w, i) => sum + estimateWordWidthPx(w, fs) * (i === activeIdx && activeScale > 1 ? activeScale : 1),
        0
      ) +
      spaceW * (words.length - 1)
    if (totalW <= maxWidth) return fs
  }
  return minSize
}

// ─────────────────────────────────────────────────────────────────────────────
// COLOUR HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function portraitColors(style: AssCaptionStyle) {
  return {
    highlightColor: '#FF6B35',
    inactiveColor: '#CCCCCC',
    pillColor: '#7C3AED'
  }
}

function defaultColors(style: AssCaptionStyle) {
  return {
    highlightColor:
      style === 'colored'
        ? '#FFE135'
        : style === 'scaling'
          ? '#4ADE80'
          : style === 'bounce'
            ? '#FFE135'
            : style === 'neon'
              ? '#00FFFF'
              : '#FFFFFF',
    inactiveColor: '#888888',
    pillColor: '#3B82F6'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG FRAME BUILDER
// Renders a single static frame with the first word highlighted.
// Uses the same positioning logic as AssCaptionService for consistency.
// ─────────────────────────────────────────────────────────────────────────────

function buildPreviewSVG(opts: {
  width: number
  height: number
  style: AssCaptionStyle
  wordsPerLine: number
  fontSize: number
  inactiveColor: string
  highlightColor: string
  pillColor: string
}): string {
  const { width, height, style, wordsPerLine, fontSize, inactiveColor, highlightColor, pillColor } = opts

  const words = DEMO_WORDS.slice(0, wordsPerLine).map((w) => w.word)
  const activeIdx = Math.floor(words.length / 2)

  const spaceW = estimateSpaceWidthPx(fontSize) * getStyleSpacingMultiplier(style)
  const wordWidths = words.map((w) => estimateWordWidthPx(w, fontSize))

  // Adjust vertical position per style to accommodate visual effects
  const getLineYFraction = (s: AssCaptionStyle): number => {
    if (s === 'animated-background') return 0.55 // Pill needs more space below
    if (s === 'bounce') return 0.5
    if (s === 'scaling') return 0.5
    if (s === 'neon') return 0.48 // Glow needs slight adjustment
    if (s === 'typewriter') return 0.5
    return 0.5 // colored, karaoke, remotion
  }

  const lineYFraction = getLineYFraction(style)
  const lineY = Math.round(lineYFraction * height) - Math.round(fontSize * 0.35)

  const SCALING_SCALE = 1.2
  const isScalingStyle = style === 'scaling'
  const effectiveWidths = wordWidths.map((w, i) => (isScalingStyle && i === activeIdx ? w * SCALING_SCALE : w))
  const totalW = effectiveWidths.reduce((a, b) => a + b, 0) + spaceW * (words.length - 1)

  const startX = (width - totalW) / 2

  // ── Pill background ────────────────────────────────────────────────────────
  let pillSvg = ''
  if (style === 'animated-background') {
    const aw = wordWidths[activeIdx]
    const padX = fontSize * 0.17
    const padY = fontSize * 0.12
    const rx = fontSize * 0.22

    let ax = startX
    for (let i = 0; i < activeIdx; i++) ax += effectiveWidths[i] + spaceW

    const pillH = fontSize * 0.72 + padY * 2
    const pillY = lineY - pillH / 2

    pillSvg = `<rect
      x="${(ax - padX).toFixed(1)}" y="${pillY.toFixed(1)}"
      width="${(aw + padX * 2).toFixed(1)}" height="${pillH.toFixed(1)}"
      rx="${rx.toFixed(1)}" fill="${pillColor}" />`
  }

  // ── Words ──────────────────────────────────────────────────────────────────
  let wordsSvg = ''
  let curX = startX
  const defsSvg =
    style === 'neon'
      ? `<defs><filter id="glow"><feGaussianBlur stdDeviation="${(fontSize * 0.08).toFixed(1)}" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`
      : ''

  words.forEach((word, i) => {
    const ww = wordWidths[i]
    const ew = effectiveWidths[i]
    const isActive = i === activeIdx

    let fillColor = isActive ? (style === 'animated-background' ? '#FFFFFF' : highlightColor) : inactiveColor

    if (style === 'neon' && isActive) {
      fillColor = '#FFFFFF'
    }

    const scale = isScalingStyle && isActive ? SCALING_SCALE : 1
    const drawX = isScalingStyle && isActive ? curX + (ew - ww) / 2 : curX
    const cx = drawX + ww / 2
    const tfm =
      scale !== 1
        ? `transform="translate(${cx.toFixed(1)},${lineY.toFixed(1)}) scale(${scale}) translate(${(-cx).toFixed(1)},${(-lineY).toFixed(1)})"`
        : ''

    // Stroke for visibility
    if (style !== 'animated-background') {
      wordsSvg += `<text x="${drawX.toFixed(1)}" y="${lineY.toFixed(1)}" font-family="${PREVIEW_FONT_FAMILY},Arial,sans-serif" font-weight="400" font-size="${fontSize}" fill="none" stroke="black" stroke-width="${Math.max(2, fontSize * 0.12)}" stroke-linejoin="round" ${tfm}>${word}</text>\n      `
    }

    if (style === 'neon' && isActive) {
      wordsSvg += `<text x="${drawX.toFixed(1)}" y="${lineY.toFixed(1)}" font-family="${PREVIEW_FONT_FAMILY},Arial,sans-serif" font-weight="400" font-size="${fontSize}" fill="${highlightColor}" stroke="${highlightColor}" stroke-width="${fontSize * 0.08}" stroke-linejoin="round" filter="url(#glow)" ${tfm}>${word}</text>\n      `
    }

    wordsSvg += `<text x="${drawX.toFixed(1)}" y="${lineY.toFixed(1)}" font-family="${PREVIEW_FONT_FAMILY},Arial,sans-serif" font-weight="400" font-size="${fontSize}" fill="${fillColor}" ${tfm}>${word}</text>\n      `

    curX += ew + spaceW
  })

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" overflow="hidden" xmlns="http://www.w3.org/2000/svg">
  ${defsSvg}
  <rect width="${width}" height="${height}" fill="#111111" />
  ${pillSvg}
  ${wordsSvg}
</svg>`
}

// ─────────────────────────────────────────────────────────────────────────────
// LABEL SVG
// ─────────────────────────────────────────────────────────────────────────────

function buildLabelSVG(text: string, width: number, height: number): string {
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="#1E293B" />
  <text x="${width / 2}" y="${height / 2 + 5}" font-family="Arial,sans-serif" font-size="${Math.round(height * 0.4)}" fill="#94A3B8" text-anchor="middle">${text}</text>
</svg>`
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  // Step 1: Determine audio file source
  let audioFile: string | null = process.argv[2] // Explicit argument

  if (!audioFile || !fs.existsSync(audioFile)) {
    // Auto-discover from demo_frame/
    const demoDir = path.resolve('demo_frame')
    console.log(`📁  Searching for audio files in: ${demoDir}\n`)
    audioFile = findAudioFile(demoDir)

    if (!audioFile) {
      console.error(`❌  No audio file found. Usage:\n`)
      console.error(`   npx ts-node examples/generate-caption-previews.ts [audio-file.mp3]\n`)
      console.error(`   or place audio files in demo_frame/ for auto-discovery\n`)
      process.exit(1)
    }
  }

  // Step 2: Load word timings from audio (required)
  await loadDemoWordsFromAudio(audioFile)

  if (DEMO_WORDS.length === 0) {
    console.error(`❌  No words extracted from audio. Aborting.\n`)
    process.exit(1)
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })

  /** Fixed column width for the grid — landscape cells fill it exactly. */
  const THUMB_COL_W = 480
  const LABEL_H = 30
  const GAP = 10
  const ROWS = THUMB_ASPECT_RATIOS.length
  const COLS = STYLES.length

  console.log('🖼   Generating caption preview images…\n')

  // ── Individual previews + row buffers ─────────────────────────────────────
  const rowBuffers: Buffer[] = []

  for (let row = 0; row < ROWS; row++) {
    const ar = THUMB_ASPECT_RATIOS[row]
    const { thumbW, thumbH } = ar
    const cellH = thumbH + LABEL_H
    const rowCells: Buffer[] = []

    for (let col = 0; col < COLS; col++) {
      const st = STYLES[col]

      const aspectRatio = thumbW / thumbH
      const wordsPerLine = aspectRatio < 0.7 ? 2 : aspectRatio < 1.4 ? 3 : 4
      const isPortrait = ar.id === 'portrait'
      const colors = isPortrait ? portraitColors(st.id) : defaultColors(st.id)

      // Largest font where all words fit inside 80% of the thumbnail width.
      // For the scaling style the active word is rendered at 1.3× – pass that
      // scale so the fitting calculation reserves the extra space it needs.
      const previewWords = DEMO_WORDS.slice(0, wordsPerLine).map((w) => w.word)
      const activeScale = st.id === 'scaling' ? 1.3 : 1
      const rawFontSize = calcFitFontSize(previewWords, thumbW * 0.8, st.id, 16, 80, activeScale)
      const fontSize = isPortrait ? Math.max(16, Math.round((rawFontSize * 0.6) / 2) * 2) : rawFontSize

      // Render SVG at exact thumbnail dimensions (no sharp resize).
      const svg = buildPreviewSVG({
        width: thumbW,
        height: thumbH,
        style: st.id,
        wordsPerLine,
        fontSize,
        ...colors
      })

      const thumbBuf = await sharp(Buffer.from(svg)).png().toBuffer()

      // Label strip matches the thumbnail width.
      const labelBuf = await sharp(Buffer.from(buildLabelSVG(`${ar.label}  ·  ${st.label}`, thumbW, LABEL_H)))
        .png()
        .toBuffer()

      // Cell: thumbnail above, label below, thumbnail centred in THUMB_COL_W.
      const leftPad = Math.floor((THUMB_COL_W - thumbW) / 2)
      const cellBuf = await sharp({
        create: { width: THUMB_COL_W, height: cellH, channels: 4, background: '#0F172A' }
      })
        .composite([
          { input: thumbBuf, top: 0, left: leftPad },
          { input: labelBuf, top: thumbH, left: leftPad }
        ])
        .png()
        .toBuffer()

      rowCells.push(cellBuf)

      // Save individual full-resolution preview.
      const fullAR = FULL_ASPECT_RATIOS.find((a) => a.id === ar.id)!
      const fullWords = DEMO_WORDS.slice(0, wordsPerLine).map((w) => w.word)
      const rawFullFontSize = calcFitFontSize(fullWords, fullAR.width * 0.8, st.id, 16, 80, activeScale)
      const fullFontSize =
        ar.id === 'portrait' ? Math.max(16, Math.round((rawFullFontSize * 0.6) / 2) * 2) : rawFullFontSize
      const fullSvg = buildPreviewSVG({
        width: fullAR.width,
        height: fullAR.height,
        style: st.id,
        wordsPerLine,
        fontSize: fullFontSize,
        ...colors
      })
      const previewDir = path.join(OUT_DIR, ar.id, st.id)
      fs.mkdirSync(previewDir, { recursive: true })
      await sharp(Buffer.from(fullSvg)).png().toFile(path.join(previewDir, 'preview.png'))
      console.log(
        `  ✅  ${ar.id}/${st.id}/preview.png  (${wordsPerLine} words/line, grid=${fontSize}px, full=${fullFontSize}px)`
      )
    }

    // Assemble row (all columns share THUMB_COL_W).
    const rowW = COLS * THUMB_COL_W + (COLS + 1) * GAP
    const rowBuf = await sharp({
      create: { width: rowW, height: cellH, channels: 4, background: '#0F172A' }
    })
      .composite(
        rowCells.map((buf, col) => ({
          input: buf,
          top: 0,
          left: GAP + col * (THUMB_COL_W + GAP)
        }))
      )
      .png()
      .toBuffer()

    rowBuffers.push(rowBuf)
  }

  // ── Compose comparison grid ───────────────────────────────────────────────
  const rowW = COLS * THUMB_COL_W + (COLS + 1) * GAP
  const gridH = THUMB_ASPECT_RATIOS.reduce((acc, ar) => acc + ar.thumbH + LABEL_H + GAP, GAP)

  let yOff = GAP
  const composites: sharp.OverlayOptions[] = []
  for (let row = 0; row < ROWS; row++) {
    composites.push({ input: rowBuffers[row], top: yOff, left: 0 })
    yOff += THUMB_ASPECT_RATIOS[row].thumbH + LABEL_H + GAP
  }

  const gridPath = path.join(OUT_DIR, 'caption-preview-grid.png')
  await sharp({ create: { width: rowW, height: gridH, channels: 4, background: '#0F172A' } })
    .composite(composites)
    .png()
    .toFile(gridPath)

  console.log(`\n🖼   Comparison grid → ${gridPath}`)

  // ── Generate ASS files (full resolution) ─────────────────────────────────
  console.log('\n📝  Generating .ass subtitle files…\n')

  for (const ar of FULL_ASPECT_RATIOS) {
    for (const st of STYLES) {
      const isPortrait = ar.id === 'portrait'
      const svc = new AssCaptionService(ar.width, ar.height, {
        style: st.id,
        ...(isPortrait
          ? {
              highlightColor: '#FF6B35',
              inactiveColor: '#CCCCCC',
              pillColor: '#7C3AED',
              borderSize: 3
            }
          : {})
      })

      const ass = svc.buildASSFile(DEMO_WORDS)
      const assDir = path.join(OUT_DIR, ar.id, st.id)
      fs.mkdirSync(assDir, { recursive: true })
      const assPath = path.join(assDir, `${st.id}.ass`)
      fs.writeFileSync(assPath, ass, 'utf-8')
      console.log(
        `  📄  ${ar.id}/${st.id}/${st.id}.ass  (${svc.getResolvedWordsPerLine()} words/line, ${svc.getResolvedFontSize()}px)`
      )
    }
  }

  // ── Generate MP4 videos for all aspect ratios × styles ───────────────────
  console.log('\n🎬  Generating MP4 videos…\n')

  for (const ar of FULL_ASPECT_RATIOS) {
    for (const st of STYLES) {
      const videoDir = path.join(OUT_DIR, ar.id, st.id)
      const assPath = path.join(videoDir, `${st.id}.ass`)
      const videoPath = path.join(videoDir, `${st.id}.mp4`)

      const totalMs = DEMO_WORDS.at(-1).startMs + DEMO_WORDS.at(-1).durationMs
      // Add a small buffer so the final word is fully visible before the video ends.
      const totalSec = Math.ceil(totalMs / 1000) + 0.5

      // Escape path for libass: backslashes become forward slashes, colons are
      // escaped. Single quotes, commas and brackets are not expected in the
      // generated output paths; avoid placing this script's output directory
      // under a path that contains those characters.
      const safePath = assPath.replaceAll('\\', '/').replaceAll(':', String.raw`\:`)

      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(`color=c=0x111111:s=${ar.width}x${ar.height}:d=${totalSec}`)
          .inputFormat('lavfi')
          .videoFilters(`ass='${safePath}'`)
          .outputOptions(['-c:v libx264', '-preset fast', '-crf 18', '-pix_fmt yuv420p', `-t ${totalSec}`])
          .save(videoPath)
          .on('end', () => {
            console.log(`  ✅  ${ar.id}/${st.id}/${st.id}.mp4`)
            resolve()
          })
          .on('error', (err: Error) => {
            console.error(`  ❌  ${ar.id}/${st.id}: ${err.message}`)
            reject(err)
          })
      })
    }
  }

  console.log('\n✨  Done! All outputs saved to samples/captions/')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
