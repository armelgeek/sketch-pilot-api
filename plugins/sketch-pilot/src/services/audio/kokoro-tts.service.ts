import * as fs from 'node:fs'
import * as path from 'node:path'
import { detectAndTrimSilence } from '../../utils/audio-trimmer'
import { runFfmpeg } from '../../utils/ffmpeg-utils'
import type { AudioGenerationResult, AudioService } from './index'

// Type-only import for KokoroTTS (won't trigger native module loading)
import type { KokoroTTS } from 'kokoro-js'

export class KokoroTTSService implements AudioService {
  private tts: KokoroTTS | null = null
  private readonly language: string

  private readonly voicePreset: any
  private readonly modelId: string = 'onnx-community/Kokoro-82M-v1.0-ONNX'
  private initialized: boolean = false

  constructor(_apiToken: string = '', language: string = 'en-US', voicePreset: string = 'af_jessica') {
    this.language = language
    this.voicePreset = voicePreset
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────────

  async generateSpeech(text: string, outputPath: string, options?: any): Promise<AudioGenerationResult> {
    const activeVoice = options?.voice || this.voicePreset
    console.log(`[KokoroTTS] Generating speech (${activeVoice}): "${text.slice(0, 50)}..."`)

    await this.ensureInitialized()
    if (!this.tts) throw new Error('Kokoro TTS model failed to initialize')

    this.ensureOutputDir(outputPath)

    // Kokoro-js / ONNX often has a limit (around 500-1000 chars or specific token count)
    // We split by sentences to ensure natural pauses and avoid truncation.
    const chunks = this.splitTextIntoChunks(text, 500)
    const tempFiles: string[] = []
    const baseDir = path.dirname(outputPath)
    const baseName = path.basename(outputPath, path.extname(outputPath))

    try {
      for (let i = 0; i < chunks.length; i++) {
        const chunkPath = path.join(baseDir, `${baseName}_chunk_${i}.wav`)
        console.log(`[KokoroTTS] Generating chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`)

        // Ensure the directory still exists (in case it was deleted during long synthesis)
        if (!fs.existsSync(baseDir)) {
          console.warn(`[KokoroTTS] Output directory ${baseDir} disappeared. Re-creating...`)
          fs.mkdirSync(baseDir, { recursive: true })
        }

        // Inject structural pause at the end of chunk to prevent rushed endings
        const textToGenerate = `${chunks[i].trim()} \n\n`

        // Adjust speed based on pacing if provided
        let activeSpeed = 1
        if (options?.pacing === 'slow')
          activeSpeed = 0.92 // More deliberate
        else if (options?.pacing === 'fast') activeSpeed = 1.1 // Snappier

        const audio = await this.tts.generate(textToGenerate, {
          voice: activeVoice,
          speed: activeSpeed
        })
        await audio.save(chunkPath)
        tempFiles.push(chunkPath)
      }

      if (tempFiles.length === 1) {
        fs.renameSync(tempFiles[0], outputPath)
      } else {
        // Concatenate chunks using ffmpeg
        await this.concatenateAudioFiles(tempFiles, outputPath)
      }
    } finally {
      // Cleanup temp chunks
      for (const f of tempFiles) {
        if (fs.existsSync(f) && f !== outputPath) fs.unlinkSync(f)
      }
    }

    // ✅ Trim silence au millimètre près
    const trimmedPath = outputPath.replace('.mp3', '_trimmed.mp3').replace('.wav', '_trimmed.wav')
    const trimResult = await detectAndTrimSilence(outputPath, trimmedPath)

    if (fs.existsSync(trimmedPath)) {
      // Add a small 150ms silence padding to the end to prevent rushed transitions
      const paddedPath = outputPath.replace('.mp3', '_padded.mp3').replace('.wav', '_padded.wav')
      try {
        await runFfmpeg(['-i', trimmedPath, '-af', 'apad=pad_dur=0.15', '-y', paddedPath])
        if (fs.existsSync(paddedPath)) {
          fs.renameSync(paddedPath, outputPath)
          if (fs.existsSync(trimmedPath)) fs.unlinkSync(trimmedPath)
        } else {
          fs.renameSync(trimmedPath, outputPath)
        }
      } catch (error) {
        console.warn(`[KokoroTTS] Failed to add padding: ${error}. Falling back to trimmed only.`)
        fs.renameSync(trimmedPath, outputPath)
      }
    }

    console.log(
      `[KokoroTTS] ✅ Speech generated & concatenated (${chunks.length} chunks): ${outputPath} (${trimResult.newDurationMs}ms)`
    )

    // ✅ Utiliser la durée réelle du fichier trimmé
    const duration = trimResult.newDurationMs / 1000 || this.estimateDuration(text)

    // ✅ Pour le Global Audio, on laisse Whisper faire le timing précis.
    // L'estimation reste ici pour compatibilité descendante.
    const wordTimings = this.estimateWordTimings(text, duration)

    return { audioPath: outputPath, duration, wordTimings }
  }

  private splitTextIntoChunks(text: string, maxChars: number): string[] {
    // Split by sentence boundaries but keep sentences together
    const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text]
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
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim())
    }
    return chunks
  }

  private async concatenateAudioFiles(filePaths: string[], outputPath: string): Promise<void> {
    const listFile = `${outputPath}.list.txt`
    const fileListContent = filePaths.map((p) => `file '${path.resolve(p)}'`).join('\n')
    fs.writeFileSync(listFile, fileListContent)

    try {
      // Use ffmpeg concat demuxer with aresample to ensure clean timestamps
      await runFfmpeg(['-f', 'concat', '-safe', '0', '-i', listFile, '-af', 'aresample=async=1', '-y', outputPath])
    } finally {
      if (fs.existsSync(listFile)) fs.unlinkSync(listFile)
    }
  }

  /**
   * Distribue automatiquement la durée totale entre plusieurs scènes ou ACTS
   * Exemple: acts = ['hook','mirror','revelation','solution','conclusion']
   */
  distributeDuration(totalDuration: number, proportions: number[]): number[] {
    const sum = proportions.reduce((a, b) => a + b, 0)
    return proportions.map((p) => (p / sum) * totalDuration)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private async ensureInitialized(): Promise<void> {
    if (this.initialized && this.tts) return

    console.log(`[KokoroTTS] Loading model: ${this.modelId}...`)

    try {
      // Import the environment from @huggingface/transformers (used by kokoro-js 1.2+)
      const { env } = await import('@huggingface/transformers')

      // Allow remote downloads if not found locally
      env.allowLocalModels = true
      env.allowRemoteModels = true

      // Do NOT force WASM if onnxruntime-node is available.
      // @huggingface/transformers 3.x+ automatically detects and uses it.
      // We only log if it's explicitly disabled but default behavior is best.
      if (process.env.ONNXRUNTIME_NODE_DISABLED === 'true') {
        console.warn('[KokoroTTS] Warning: ONNXRUNTIME_NODE_DISABLED is true. Falling back to WASM.')
        if (env.backends?.onnx?.wasm) {
          env.backends.onnx.wasm.proxy = false
          env.backends.onnx.wasm.numThreads = 1
        }
      }

      // Dynamic import of kokoro-js
      const { KokoroTTS: KokoroTTSLib } = await import('kokoro-js')

      this.tts = await KokoroTTSLib.from_pretrained(this.modelId, {
        dtype: 'q8',
        device: 'cpu'
      })
      this.initialized = true
      console.log('[KokoroTTS] ✅ Model loaded successfully')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`[KokoroTTS] ❌ Model load failed: ${errorMessage}`)
      throw new Error(`Failed to load Kokoro model: ${errorMessage}`)
    }
  }

  private ensureOutputDir(outputPath: string): void {
    const dir = outputPath.slice(0, Math.max(0, outputPath.lastIndexOf('/')))
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  }

  private getAudioDuration(audio: any): number | null {
    try {
      if (typeof audio.duration === 'number') return audio.duration
      if (typeof (audio as any)._duration === 'number') return (audio as any)._duration
      if (audio.sampling_rate && audio.audio?.length) {
        return audio.audio.length / audio.sampling_rate
      }
      return null
    } catch {
      return null
    }
  }

  private estimateDuration(text: string, wordsPerSecond = 2.5): number {
    const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length
    return Math.max(wordCount / wordsPerSecond, 1)
  }

  private estimateWordTimings(text: string, totalDuration: number) {
    const words = text
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .filter((w) => !/^[.,!?;:\-—"'`«»„‟]+$/.test(w))

    if (words.length === 0) return []

    const charCount = words.reduce((sum, w) => sum + w.length, 0)
    let currentTime = 0

    return words.map((word) => {
      const charRatio = word.length / charCount
      const wordDuration = totalDuration * charRatio
      const startTime = currentTime
      const endTime = currentTime + wordDuration
      currentTime = endTime
      return {
        word,
        start: startTime,
        end: endTime,
        startMs: Math.round(startTime * 1000),
        durationMs: Math.round(wordDuration * 1000)
      }
    })
  }
}
