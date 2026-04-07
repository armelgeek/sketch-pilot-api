import * as fs from 'node:fs'
import { protos, TextToSpeechClient } from '@google-cloud/text-to-speech'
import { detectAndTrimSilence } from '../../utils/audio-trimmer'
import type { AudioGenerationResult, AudioService, WordTiming } from './index'

/**
 * Retry a function with exponential backoff on network errors
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  { maxAttempts = 3, baseDelayMs = 500 }: { maxAttempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const isNetworkError =
        error instanceof Error &&
        (error.message.includes('ECONNRESET') ||
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('ENOTFOUND') ||
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('socket hang up') ||
          error.message.includes('fetch failed') ||
          (error as any).code === 'UNAVAILABLE' ||
          (error as any).code === 'DEADLINE_EXCEEDED')

      if (!isNetworkError || attempt === maxAttempts) throw error

      const delay = baseDelayMs * 2 ** (attempt - 1)
      console.warn(`[GoogleTTS] Network error (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms...`, error)
      await new Promise((res) => setTimeout(res, delay))
    }
  }
  throw new Error('unreachable')
}

/**
 * Google Cloud Text-to-Speech service implementation
 * Provides high-quality text-to-speech synthesis using Google Cloud TTS API
 */
export class GoogleTTSService implements AudioService {
  private readonly client: TextToSpeechClient
  private readonly languageCode: string
  private readonly voiceName?: string
  private readonly audioEncoding: protos.google.cloud.texttospeech.v1.AudioEncoding
  private readonly retryOptions: { maxAttempts: number; baseDelayMs: number }

  constructor(
    apiKey: string,
    languageCode: string = 'en-US',
    voiceName?: string,
    audioEncoding: 'MP3' | 'LINEAR16' | 'OGG_OPUS' = 'MP3',
    retryOptions: { maxAttempts?: number; baseDelayMs?: number } = {}
  ) {
    this.client = new TextToSpeechClient({ apiKey })
    this.languageCode = languageCode
    this.voiceName = voiceName
    this.retryOptions = { maxAttempts: 3, baseDelayMs: 500, ...retryOptions }

    // Map string to enum
    const encodingMap = {
      MP3: protos.google.cloud.texttospeech.v1.AudioEncoding.MP3,
      LINEAR16: protos.google.cloud.texttospeech.v1.AudioEncoding.LINEAR16,
      OGG_OPUS: protos.google.cloud.texttospeech.v1.AudioEncoding.OGG_OPUS
    }
    this.audioEncoding = encodingMap[audioEncoding]
  }

  /**
   * Generates speech and saves it to an audio file
   */
  async generateSpeech(text: string, outputPath: string, options?: any): Promise<AudioGenerationResult> {
    const activeVoiceName = options?.voiceId || options?.voice || this.voiceName
    console.log(`[GoogleTTS] Generating speech (${activeVoiceName}) for: "${text.slice(0, 50)}..."`)

    try {
      // Construct the request (cast to any for enableTimepointing which may not be in current type defs)
      const request: any = {
        input: { text },
        voice: {
          languageCode: this.languageCode,
          ...(activeVoiceName && { name: activeVoiceName })
        },
        audioConfig: {
          audioEncoding: this.audioEncoding
        }
        // enableTimepointing is experimental; word-level timings via SSML marks
        // enableTimepointing: [1], // SSML_MARK = 1
      }

      // Perform the text-to-speech request with retry on network errors
      const [response] = await withRetry(() => this.client.synthesizeSpeech(request), this.retryOptions)

      if (!response.audioContent) {
        throw new Error('No audio content received from Google TTS')
      }

      // Write the audio content to file
      await fs.promises.writeFile(outputPath, response.audioContent, 'binary')

      console.log(`[GoogleTTS] Speech generated successfully: ${outputPath}`)

      // ✅ Trim silence
      const trimmedPath = outputPath.replace('.mp3', '_trimmed.mp3')
      const trimResult = await detectAndTrimSilence(outputPath, trimmedPath)
      if (fs.existsSync(trimmedPath)) {
        fs.renameSync(trimmedPath, outputPath)
      }

      console.log(`[GoogleTTS] ✅ Speech generated & trimmed: ${outputPath} (-${trimResult.startTrimmedMs}ms start)`)

      const wordTimings: WordTiming[] = [] // Placeholder for now

      return {
        audioPath: outputPath,
        duration: trimResult.newDurationMs / 1000,
        wordTimings
      }
    } catch (error) {
      console.error(`[GoogleTTS] Error generating speech:`, error)
      throw new Error(
        `Failed to generate speech with Google TTS: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}
