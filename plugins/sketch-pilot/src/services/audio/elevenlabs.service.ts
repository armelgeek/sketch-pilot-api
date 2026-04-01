import * as fs from 'node:fs'
import * as path from 'node:path'
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import { runFfmpeg } from '../../utils/ffmpeg-utils'
import type { AudioGenerationResult, AudioService, WordTiming } from './index'

export class ElevenLabsService implements AudioService {
  private readonly client: ElevenLabsClient
  private readonly voiceId: string
  private readonly modelId: string

  constructor(
    apiKey?: string,
    voiceId: string = 'pNInz6obpgDQGcFmaJgB', // Default: Adam/Bella voice
    modelId: string = 'eleven_turbo_v2_5'
  ) {
    this.client = new ElevenLabsClient(apiKey ? { apiKey } : {})
    this.voiceId = voiceId
    this.modelId = modelId
  }

  private getActiveVoiceId(options?: any): string {
    const passedVoice = options?.voiceId || options?.voice
    // ElevenLabs IDs are 20-character alphanumeric (e.g. pNInz6obpgDQGcFmaJgB)
    // If it looks like a Kokoro voice (e.g. af_heart, am_adam, contains an underscore), ignore it
    if (passedVoice && passedVoice.includes('_')) {
      return this.voiceId
    }
    return passedVoice || this.voiceId
  }

  async generateSpeech(text: string, outputPath: string, options?: any): Promise<AudioGenerationResult> {
    const activeVoiceId = this.getActiveVoiceId(options)
    console.log(`[ElevenLabs] Generating speech (${activeVoiceId}) for: "${text.slice(0, 50)}..."`)

    this.ensureOutputDir(outputPath)
    const baseDir = path.dirname(outputPath)
    const baseName = path.basename(outputPath, path.extname(outputPath))

    // Chunk text natively (max 5000 chars per API req) without injecting artificial SSML
    const chunks = this.splitTextIntoChunks(text, 3000)
    const tempFiles: string[] = []

    try {
      if (chunks.length === 0) throw new Error('Text is empty')

      for (const [i, chunk] of chunks.entries()) {
        const segPath = path.join(baseDir, `${baseName}_chunk_${i}.mp3`)

        const audioStream = await this.client.textToSpeech.convert(activeVoiceId, {
          text: chunk,
          modelId: this.modelId,
          voiceSettings: { stability: 0.5, similarityBoost: 0.5 }
        })

        const fileStream = fs.createWriteStream(segPath)
        await new Promise<void>((resolve, reject) => {
          const reader = (audioStream as ReadableStream<Uint8Array>).getReader()
          const pump = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                fileStream.write(value)
              }
              fileStream.end()
              fileStream.on('finish', resolve)
              fileStream.on('error', reject)
            } catch (error) {
              reject(error)
            }
          }
          pump()
        })
        tempFiles.push(segPath)
      }

      // Concat if multiple chunks
      if (tempFiles.length === 1) {
        fs.renameSync(tempFiles[0], outputPath)
      } else {
        await this.concatenateAudioFiles(tempFiles, outputPath)
      }

      // No artificial silencing or trimming requested by user.
      // We rely entirely on ElevenLabs' native pacing and native trailing silence for natural breathing.

      const realDuration = await this.getRealDuration(outputPath)

      // Word Timings equivalent
      const cleanText = text
        .replaceAll(/\.{3}|[.?!,;:\-—]/g, ' ')
        .replaceAll(/\s+/g, ' ')
        .trim()

      const wordTimings = this.estimateWordTimings(cleanText, realDuration)

      console.log(`[ElevenLabs] ✅ Speech generated: ${outputPath} (length: ${realDuration.toFixed(2)}s)`)

      return {
        audioPath: outputPath,
        duration: realDuration,
        wordTimings
      }
    } catch (error) {
      console.error(`[ElevenLabs] Error generating speech:`, error)
      throw new Error(
        `Failed to generate speech with ElevenLabs: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      // Clean up temp files
      for (const f of tempFiles) {
        if (fs.existsSync(f) && f !== outputPath) fs.unlinkSync(f)
      }
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private splitTextIntoChunks(text: string, maxChars: number): string[] {
    const sentences = text.match(/(.*?[.!?]+|.+$)/g) || [text]
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

  private async concatenateAudioFiles(filePaths: string[], outputPath: string): Promise<void> {
    const listFile = `${outputPath}.list.txt`
    const fileListContent = filePaths.map((p) => `file '${path.resolve(p)}'`).join('\n')
    fs.writeFileSync(listFile, fileListContent)

    try {
      await runFfmpeg(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-y', outputPath])
    } finally {
      if (fs.existsSync(listFile)) fs.unlinkSync(listFile)
    }
  }

  private ensureOutputDir(outputPath: string): void {
    const dir = path.dirname(outputPath)
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  }

  // ─── Word Timings Calculation ────────────────────────────────────────────

  private getWordSpeed(word: string): number {
    if (/[.!?…]$/.test(word)) return 1.4
    if (/[,;:\-—]$/.test(word)) return 1.8
    if (word.length <= 3) return 3.2
    if (word.length >= 8) return 2
    return 2.45
  }

  private estimateWordTimings(text: string, totalDuration: number): WordTiming[] {
    const words = text.split(/\s+/).filter((w) => w.length > 0)
    const MathTotal = words.reduce((a, w) => a + 1 / this.getWordSpeed(w), 0)
    const total = MathTotal > 0 ? MathTotal : 1
    const scale = totalDuration / total

    let currentTime = 0
    return words.map((word) => {
      const wordDuration = (1 / this.getWordSpeed(word)) * scale
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
    const cp = await import('node:child_process')
    const { stdout } = await new Promise<{ stdout: string }>((res, rej) =>
      cp.exec(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`, (err, stdout) =>
        err ? rej(err) : res({ stdout })
      )
    )
    const duration = parseFloat(stdout.trim())
    if (isNaN(duration)) {
      console.warn(`[ElevenLabs] ffprobe failed for ${filePath}, defaulting to 30s`)
      return 30
    }
    return duration
  }
}
