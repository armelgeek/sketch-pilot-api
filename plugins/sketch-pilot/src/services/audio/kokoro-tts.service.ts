import * as fs from 'node:fs'
import * as path from 'node:path'
import { detectAndTrimSilence } from '../../utils/audio-trimmer'
import type { AudioGenerationResult, AudioService } from './index'
import '../../utils/polyfills'

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

        // Inject structural pause at the end of chunk to prevent rushed endings
        const textToGenerate = `${chunks[i].trim()} \n\n`

        const audio = await this.tts.generate(textToGenerate, {
          voice: activeVoice,
          speed: 0.8 // Slow down for more natural, less "rushed" delivery
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
      fs.renameSync(trimmedPath, outputPath)
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
    const { exec } = require('node:child_process')
    const { promisify } = require('node:util')
    const execAsync = promisify(exec)

    const listFile = `${outputPath}.list.txt`
    const fileListContent = filePaths.map((p) => `file '${path.resolve(p)}'`).join('\n')
    fs.writeFileSync(listFile, fileListContent)

    try {
      // Use ffmpeg concat demuxer with aresample to ensure clean timestamps
      await execAsync(`ffmpeg -f concat -safe 0 -i "${listFile}" -af "aresample=async=1" -y "${outputPath}"`)
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
    console.log(`[KokoroTTS] backend: WASM, device: cpu`)
    console.log(`[KokoroTTS] Env check: ONNXRUNTIME_NODE_DISABLED=${process.env.ONNXRUNTIME_NODE_DISABLED}`)

    try {
      // Attempt to force WASM config via transformers env if accessible
      try {
        // @ts-ignore - may be @xenova/transformers or @huggingface/transformers
        const hfTransformers = await import('@xenova/transformers').catch(() => import('@huggingface/transformers'))
        if (hfTransformers?.env) {
          hfTransformers.env.allowLocalModels = false
          hfTransformers.env.backends.onnx.wasm.proxy = false
          hfTransformers.env.backends.onnx.wasm.numThreads = 1
          console.log('[KokoroTTS] ✓ Transformers env nuclear-force to WASM')
        }
      } catch {
        // Not critical if we can't patch sub-config
      }

      // Dynamic import to ensure process.env is set BEFORE the library initializes
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
