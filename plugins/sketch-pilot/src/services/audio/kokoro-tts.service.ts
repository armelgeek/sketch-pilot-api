import * as fs from 'node:fs'
import * as path from 'node:path'
import { runFfmpeg } from '../../utils/ffmpeg-utils'
import type { AudioGenerationResult, AudioService } from './index'

// Type-only import for KokoroTTS (won't trigger native module loading)
import type { KokoroTTS } from 'kokoro-js'

// ─── Segment types ────────────────────────────────────────────────────────────

type TextSegment = { type: 'text'; content: string; speed?: number }
type SilenceSegment = { type: 'silence'; durationMs: number }
type Segment = TextSegment | SilenceSegment

// ─── Discourse connectors ─────────────────────────────────────────────────────
// Tested via startsWith on the lowercased next chunk.
// Multi-word phrases are included — avoids false positives from ambiguous
// single words like "it", "that", "which" that are often mid-clause.

const DISCOURSE_CONNECTORS_PHRASES: string[] = [
  // Adversatif
  'yet ',
  'but ',
  'however,',
  'however ',
  'although ',
  'though ',
  'even though ',
  'despite ',
  'nevertheless,',
  'nevertheless ',
  'nonetheless,',
  'nonetheless ',
  'still,',
  'still ',
  'instead,',
  'instead ',
  'on the other hand',
  'in contrast,',
  'in contrast ',
  'whereas ',
  'while ',
  // Additif
  'and ',
  'also,',
  'also ',
  'moreover,',
  'moreover ',
  'furthermore,',
  'furthermore ',
  'in addition,',
  'in addition ',
  'besides,',
  'besides ',
  'plus,',
  'plus ',
  'as well',
  // Causal / conséquence
  'so ',
  'therefore,',
  'therefore ',
  'thus,',
  'thus ',
  'hence,',
  'hence ',
  'consequently,',
  'consequently ',
  'as a result,',
  'as a result ',
  'because ',
  'since ',
  // Temporel / séquentiel
  'then,',
  'then ',
  'next,',
  'next ',
  'after ',
  'before ',
  'when ',
  'once ',
  'finally,',
  'finally ',
  'eventually,',
  'eventually ',
  'meanwhile,',
  'meanwhile ',
  // Concessif
  'anyway,',
  'anyway ',
  'regardless,',
  'regardless ',
  'even so,',
  'even so ',
  'all the same,',
  'after all,',
  'after all ',
  // Illustratif
  'for example,',
  'for instance,',
  'such as ',
  'namely,',
  'namely ',
  'specifically,',
  'specifically ',
  // Conclusif
  'in short,',
  'in summary,',
  'overall,',
  'overall ',
  'ultimately,',
  'ultimately ',
  'in the end,',
  'in the end ',
  'to sum up,',
  // Transition narrative
  'now,',
  'now ',
  'here,',
  'here ',
  'look,',
  'look ',
  'imagine ',
  'picture ',
  'consider ',
  'think of ',
  'remember ',
  'notice ',
  'take ',
  'meet ',
  // Intensifieur d'ouverture
  'truly,',
  'truly ',
  'really,',
  'really ',
  'simply,',
  'simply ',
  'clearly,',
  'clearly ',
  'obviously,',
  'obviously ',
  'indeed,',
  'indeed ',
  'of course,',
  'of course '
]

// ─── Heavy closing words ──────────────────────────────────────────────────────
// Scored on the last 3 words of the clause (as a joined string),
// so multi-word expressions like "no one" or "nothing at all" are caught.

const HEAVY_CLOSING_WORDS = new Set([
  // Superlatifs
  'most',
  'best',
  'worst',
  'deepest',
  'greatest',
  'highest',
  'lowest',
  'purest',
  'strongest',
  'hardest',
  'longest',
  // Adjectifs de clôture dramatique
  'true',
  'real',
  'profound',
  'invisible',
  'unseen',
  'quiet',
  'silent',
  'hidden',
  'pure',
  'raw',
  'vast',
  'infinite',
  'endless',
  'timeless',
  'boundless',
  // Adverbes finaux forts
  'forever',
  'always',
  'never',
  'ever',
  'alone',
  'together',
  'everywhere',
  'nowhere',
  'somehow',
  'still',
  // Quantifieurs universels
  'all',
  'everything',
  'nothing',
  'everyone',
  'no one',
  'anyone',
  'someone',
  'whoever',
  'whatever',
  'whenever',
  // Verbes à haute charge émotionnelle en position finale
  'matters',
  'counts',
  'remains',
  'endures',
  'survives',
  'persists',
  'inspires',
  'transforms',
  'defines',
  'shapes',
  'moves'
])

// ─────────────────────────────────────────────────────────────────────────────

export class KokoroTTSService implements AudioService {
  private tts: KokoroTTS | null = null
  private readonly language: string
  private readonly voicePreset: any
  private readonly modelId: string = 'onnx-community/Kokoro-82M-v1.0-ONNX'
  private initialized: boolean = false

  private readonly PAUSE_RULES = {
    ellipsisMidSentence: 10, // quasi instantané
    ellipsisEndOfClause: 0, // ultra fluide
    questionRhetorical: 20, // souffle à peine perceptible
    sentenceEnd: 10, // nerveux, presque continu
    sentenceEndHeavy: 20, // punch rapide mais respire un peu
    paragraphBreak: 20, // mini souffle discret
    scriptEndBonus: 8 // fin subtile et rapide
  } as const
  constructor(_apiToken: string = '', language: string = 'en-US', voicePreset: string = 'af_jessica') {
    this.language = language
    this.voicePreset = voicePreset
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────────

  async generateSpeech(text: string, outputPath: string, options?: any): Promise<AudioGenerationResult> {
    const activeVoice = options?.voice || this.voicePreset
    console.log(`[KokoroTTS] Generating speech (${activeVoice}): "${text.slice(0, 60)}..."`)

    await this.ensureInitialized()
    if (!this.tts) throw new Error('Kokoro TTS model failed to initialize')

    this.ensureOutputDir(outputPath)

    const baseDir = path.dirname(outputPath)
    const baseName = path.basename(outputPath, path.extname(outputPath))
    const tempFiles: string[] = []

    // ① Infer natural breaks from punctuation & ellipses
    const segments = this.inferBreaks(text)
    const silenceCount = segments.filter((s) => s.type === 'silence').length
    console.log(`[KokoroTTS] ${segments.length} segments (${silenceCount} silences inferred)`)

    try {
      for (const [i, seg] of segments.entries()) {
        const segPath = path.join(baseDir, `${baseName}_seg_${i}.wav`)

        if (seg.type === 'silence') {
          // ② Real silence via FFmpeg anullsrc
          await this.generateSilence(seg.durationMs, segPath)
          console.log(`[KokoroTTS]   [${i}] silence ${seg.durationMs}ms`)
        } else {
          // ③ Text → TTS, chunked if long
          const chunks = this.splitTextIntoChunks(seg.content, 500)
          const chunkPaths: string[] = []

          for (const [c, chunk] of chunks.entries()) {
            const chunkPath = path.join(baseDir, `${baseName}_seg_${i}_chunk_${c}.wav`)

            if (!fs.existsSync(baseDir)) {
              console.warn(`[KokoroTTS] Output dir disappeared, re-creating...`)
              fs.mkdirSync(baseDir, { recursive: true })
            }

            const audio = await this.tts!.generate(`${chunk.trim()} \n\n`, {
              voice: activeVoice,
              speed: seg.speed ?? 1
            })
            await audio.save(chunkPath)
            chunkPaths.push(chunkPath)
          }

          if (chunkPaths.length === 1) {
            fs.renameSync(chunkPaths[0], segPath)
          } else {
            await this.concatenateAudioFiles(chunkPaths, segPath)
            for (const f of chunkPaths) {
              if (fs.existsSync(f) && f !== segPath) fs.unlinkSync(f)
            }
          }
          console.log(`[KokoroTTS]   [${i}] text "${seg.content.slice(0, 40)}…" (speed=${seg.speed ?? 1})`)
        }

        tempFiles.push(segPath)
      }

      // ④ Concat all segments in order
      if (tempFiles.length === 1) {
        fs.renameSync(tempFiles[0], outputPath)
      } else {
        await this.concatenateAudioFiles(tempFiles, outputPath)
      }
    } finally {
      for (const f of tempFiles) {
        if (fs.existsSync(f) && f !== outputPath) fs.unlinkSync(f)
      }
    }

    const duration = await this.getRealDuration(outputPath)
    const cleanText = text
      .replaceAll(/\.{3}|[.?!,;:\-—]/g, ' ')
      .replaceAll(/\s+/g, ' ')
      .trim()
    const wordTimings = this.estimateWordTimings(cleanText, duration)

    console.log(`[KokoroTTS] ✅ Done — ${segments.length} segments, total ${duration.toFixed(2)}s`)
    return { audioPath: outputPath, duration, wordTimings }
  }

  /**
   * Distributes total audio duration across multiple scenes/acts proportionally.
   */
  distributeDuration(totalDuration: number, proportions: number[]): number[] {
    const sum = proportions.reduce((a, b) => a + b, 0)
    return proportions.map((p) => (p / sum) * totalDuration)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Break inference — no SSML tags needed
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Converts plain text (with ... and standard punctuation) into an ordered
   * list of TextSegment and SilenceSegment.
   *
   * Supports:
   *   - Ellipses (...)     → short or long pause depending on what follows
   *   - Periods (.)        → normal or heavy pause depending on closing word
   *   - Question marks (?) → rhetorical pause
   *   - Exclamations (!)   → treated as heavy period
   *   - Paragraph breaks   → longest pause
   *   - Script position    → pauses grow slightly toward the end
   */
  private inferBreaks(text: string): Segment[] {
    const segments: Segment[] = []

    // Normalise paragraph breaks → internal marker ¶
    const normalized = text
      .replaceAll('\r\n', '\n')
      .replaceAll(/\n{2,}/g, ' ¶ ')
      .trim()

    // Split on separators while keeping them (captured group)
    const parts = normalized.split(/(\.{3}|[.?!¶])/g)

    const totalChars = normalized.length
    let charsSoFar = 0

    for (let i = 0; i < parts.length; i += 2) {
      const chunk = (parts[i] ?? '').trim()
      const separator = (parts[i + 1] ?? '').trim()
      const nextChunk = (parts[i + 2] ?? '').trim()

      if (chunk) {
        segments.push({ type: 'text', content: chunk })
        charsSoFar += chunk.length
      }

      if (separator) {
        const position = Math.min(charsSoFar / totalChars, 1)
        const ms = this.classifyPause(separator, chunk, nextChunk, position)
        if (ms > 0) {
          segments.push({ type: 'silence', durationMs: ms })
        }
        charsSoFar += separator.length
      }
    }

    // ── 2. Trailing Silence (Narrative Air) ────────────────────────────
    // Si le texte finit par '...', on ajoute un silence de 1.5s à 2s
    // pour laisser l'idée "infuser" avant la scène suivante ou la fin.
    if (text.trim().endsWith('...')) {
      const lastSilence = segments.findLast((s) => s.type === 'silence')
      const extraMs = 80 // 1.5 seconde de "Narrative Air"
      if (lastSilence) {
        ;(lastSilence as SilenceSegment).durationMs += extraMs
      } else {
        segments.push({ type: 'silence', durationMs: extraMs })
      }
    }

    return segments.filter((s) => s.type === 'silence' || (s.type === 'text' && s.content.length > 0))
  }

  /**
   * Returns pause duration in ms for a separator, using surrounding context
   * and script position (0.0 = start, 1.0 = end).
   */
  private classifyPause(separator: string, before: string, after: string, position: number): number {
    const r = this.PAUSE_RULES

    // Paragraph break — always maximum regardless of position
    if (separator === '¶') return r.paragraphBreak

    // Position bonus: last 15% of script gets slightly longer pauses
    const positionBonus = position >= 0.85 ? r.scriptEndBonus : 0

    // Ellipsis
    if (separator === '...') {
      const nextIsNewClause = this.startsNewClause(after)
      const base = nextIsNewClause ? r.ellipsisEndOfClause : r.ellipsisMidSentence
      return base + positionBonus
    }

    // Rhetorical question
    if (separator === '?') return r.questionRhetorical + positionBonus

    // Period or exclamation mark
    const isHeavy = this.clauseEndsHeavily(before) || separator === '!'
    const base = isHeavy ? r.sentenceEndHeavy : r.sentenceEnd
    return base + positionBonus
  }

  /**
   * Returns true if the next chunk opens a new clause.
   * Uses startsWith on discourse connector phrases (multi-word safe).
   * Capital letter alone is also treated as a new clause signal.
   */
  private startsNewClause(after: string): boolean {
    if (!after) return false
    if (/^[A-Z]/.test(after)) return true

    const lower = after.toLowerCase()
    return DISCOURSE_CONNECTORS_PHRASES.some((phrase) => lower.startsWith(phrase))
  }

  /**
   * Scores heaviness on the last 3 words of a clause joined as a string.
   * Catches multi-word expressions like "no one", "nothing at all".
   * Also treats a closing quote mark as a heavy signal.
   */
  private clauseEndsHeavily(clause: string): boolean {
    if (!clause) return false

    // Closing quote = end of a stated idea → always heavy
    if (/['"]$/.test(clause.trimEnd())) return true

    // Check last 3 words (joined) against heavy-words set
    const words = clause.trim().toLowerCase().split(/\s+/)
    const tailStr = words.slice(-3).join(' ')

    for (const hw of HEAVY_CLOSING_WORDS) {
      if (tailStr.includes(hw)) return true
    }

    return false
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private splitTextIntoChunks(text: string, maxChars: number): string[] {
    const sentences = text.match(/[^.!?]*(?:[.!?](?![a-z0-9])[^.!?]*)*[.!?]|[^.!?]+$/g) || [text]
    const chunks: string[] = []
    let currentChunk = ''

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxChars && currentChunk.length > 0) {
        chunks.push(currentChunk.trim())
        currentChunk = sentence
      } else {
        currentChunk += sentence
      }
    }

    if (currentChunk.trim().length > 0) chunks.push(currentChunk.trim())
    return chunks
  }

  private async generateSilence(durationMs: number, outputPath: string): Promise<void> {
    const durationSec = (durationMs / 1000).toFixed(3)
    // 24000 Hz mono matches Kokoro's default sample rate
    // → avoids resampling artefacts / clicks at segment joins
    await runFfmpeg(['-f', 'lavfi', '-i', `anullsrc=r=24000:cl=mono`, '-t', durationSec, '-y', outputPath])
  }

  private async concatenateAudioFiles(filePaths: string[], outputPath: string): Promise<void> {
    const listFile = `${outputPath}.list.txt`
    const fileListContent = filePaths.map((p) => `file '${path.resolve(p)}'`).join('\n')
    fs.writeFileSync(listFile, fileListContent)

    try {
      await runFfmpeg(['-f', 'concat', '-safe', '0', '-i', listFile, '-af', 'aresample=async=1', '-y', outputPath])
    } finally {
      if (fs.existsSync(listFile)) fs.unlinkSync(listFile)
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized && this.tts) return

    console.log(`[KokoroTTS] Loading model: ${this.modelId}...`)
    console.log(`[KokoroTTS] backend: WASM, device: cpu`)
    console.log(`[KokoroTTS] Env check: ONNXRUNTIME_NODE_DISABLED=${process.env.ONNXRUNTIME_NODE_DISABLED}`)

    try {
      try {
        //@ts-ignore
        const hfTransformers = await import('@xenova/transformers').catch(() => import('@huggingface/transformers'))
        if (hfTransformers?.env) {
          hfTransformers.env.allowLocalModels = true
          hfTransformers.env.backends.onnx.wasm.proxy = false
          hfTransformers.env.backends.onnx.wasm.numThreads = 1
          hfTransformers.env.allowRemoteModels = true
          console.log('[KokoroTTS] ✓ Transformers env forced to WASM')
        }
      } catch {
        // Not critical if sub-config patch fails
      }

      const { KokoroTTS: KokoroTTSLib } = await import('kokoro-js')
      this.tts = await KokoroTTSLib.from_pretrained(this.modelId, {
        dtype: 'q8',
        device: 'cpu'
      })
      this.initialized = true
      console.log('[KokoroTTS] ✅ Model loaded successfully (WASM)')
    } catch (error) {
      throw new Error(`Failed to load Kokoro model: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private ensureOutputDir(outputPath: string): void {
    const dir = outputPath.slice(0, Math.max(0, outputPath.lastIndexOf('/')))
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  }

  private getWordSpeed(word: string): number {
    if (/[.!?…]$/.test(word)) return 1.4 // heavy punctuation → pause after
    if (/[,;:\-—]$/.test(word)) return 1.8 // light punctuation → micro-pause
    if (word.length <= 3) return 3.2 // short words (articles, preps)
    if (word.length >= 8) return 2 // long words → slower
    return 2.45 // default Kokoro wps
  }

  private estimateWordTimings(text: string, totalDuration: number) {
    const words = text.split(/\s+/).filter((w) => w.length > 0)

    const rawDurations = words.map((w) => 1 / this.getWordSpeed(w))
    const rawTotal = rawDurations.reduce((a, b) => a + b, 0)
    const scale = totalDuration / rawTotal

    let currentTime = 0
    return words.map((word, i) => {
      const wordDuration = rawDurations[i] * scale
      const startTime = currentTime
      currentTime += wordDuration
      return {
        word,
        start: startTime,
        end: currentTime,
        startMs: Math.round(startTime * 1000),
        durationMs: Math.round(wordDuration * 1000)
      }
    })
  }

  private async getRealDuration(filePath: string): Promise<number> {
    const { stdout } = await import('node:child_process').then(
      (cp) =>
        new Promise<{ stdout: string }>((res, rej) =>
          cp.exec(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`, (err, stdout) =>
            err ? rej(err) : res({ stdout })
          )
        )
    )
    const duration = parseFloat(stdout.trim())
    if (isNaN(duration)) {
      console.warn(`[KokoroTTS] ffprobe failed for ${filePath}, defaulting to 30s`)
      return 30
    }
    return duration
  }
}
