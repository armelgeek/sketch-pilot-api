import * as fs from 'node:fs'
import * as path from 'node:path'
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import { runFfmpeg } from '../../utils/ffmpeg-utils'
import type { AudioGenerationResult, AudioService, WordTiming } from './index'

// ─── Retry Helpers ────────────────────────────────────────────────────────────

const NETWORK_ERROR_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE'])

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = (error as NodeJS.ErrnoException).code
  if (code && NETWORK_ERROR_CODES.has(code)) return true
  const msg = error.message.toLowerCase()
  return (
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('socket') ||
    msg.includes('econnreset') ||
    msg.includes('fetch failed') ||
    msg.includes('rate limit') // 429 — worth retrying
  )
}

async function withRetry<T>(
  fn: () => Promise<T>,
  {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 15_000,
    label = 'operation'
  }: { maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number; label?: string } = {}
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (!isNetworkError(error) || attempt === maxAttempts) throw error
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs)
      console.warn(`[ElevenLabs] ${label} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms…`, error)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastError
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ElevenLabsService implements AudioService {
  private readonly client: ElevenLabsClient
  private readonly voiceId: string
  private readonly modelId: string

  constructor(apiKey?: string, voiceId: string = 'pNInz6obpgDQGcFmaJgB', modelId: string = 'eleven_turbo_v2_5') {
    this.client = new ElevenLabsClient(apiKey ? { apiKey } : {})
    this.voiceId = voiceId
    this.modelId = modelId
  }

  private getActiveVoiceId(options?: any): string {
    const passedVoice = options?.voiceId || options?.voice
    if (passedVoice && passedVoice.includes('_')) return this.voiceId
    return passedVoice || this.voiceId
  }

  async generateSpeech(text: string, outputPath: string, options?: any): Promise<AudioGenerationResult> {
    const activeVoiceId = this.getActiveVoiceId(options)
    console.log(`[ElevenLabs] Generating speech (${activeVoiceId}) for: "${text.slice(0, 50)}..."`)

    this.ensureOutputDir(outputPath)
    const baseDir = path.dirname(outputPath)
    const baseName = path.basename(outputPath, path.extname(outputPath))
    const chunks = this.splitTextIntoChunks(text, 3000)
    const tempFiles: string[] = []

    try {
      if (chunks.length === 0) throw new Error('Text is empty')

      for (const [i, chunk] of chunks.entries()) {
        const segPath = path.join(baseDir, `${baseName}_chunk_${i}.mp3`)

        // ── Retry the ElevenLabs API call on network errors ──────────────────
        const audioStream = await withRetry(
          () =>
            this.client.textToSpeech.convert(activeVoiceId, {
              text: chunk,
              modelId: this.modelId,
              voiceSettings: { stability: 0.5, similarityBoost: 0.5 }
            }),
          { label: `TTS chunk ${i + 1}/${chunks.length}`, maxAttempts: 4 }
        )

        // ── Retry the stream-to-disk write on transient I/O / network errors ─
        await withRetry(
          () =>
            new Promise<void>((resolve, reject) => {
              const fileStream = fs.createWriteStream(segPath)
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
            }),
          { label: `stream write chunk ${i + 1}`, maxAttempts: 3 }
        )

        tempFiles.push(segPath)
      }

      if (tempFiles.length === 1) {
        fs.renameSync(tempFiles[0], outputPath)
      } else {
        // ── Retry ffmpeg concat (rare but can fail on I/O blips) ─────────────
        await withRetry(() => this.concatenateAudioFiles(tempFiles, outputPath), {
          label: 'ffmpeg concat',
          maxAttempts: 3
        })
      }

      const realDuration = await withRetry(() => this.getRealDuration(outputPath), {
        label: 'ffprobe duration',
        maxAttempts: 3
      })

      const cleanText = text
        .replaceAll(/\.{3}|[.?!,;:\-—]/g, ' ')
        .replaceAll(/\s+/g, ' ')
        .trim()
      const wordTimings = this.estimateWordTimings(cleanText, realDuration)

      console.log(`[ElevenLabs] ✅ Speech generated: ${outputPath} (length: ${realDuration.toFixed(2)}s)`)
      return { audioPath: outputPath, duration: realDuration, wordTimings }
    } catch (error) {
      console.error(`[ElevenLabs] Error generating speech:`, error)
      throw new Error(
        `Failed to generate speech with ElevenLabs: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
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
