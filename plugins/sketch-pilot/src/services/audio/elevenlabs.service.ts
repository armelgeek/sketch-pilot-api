import { exec } from 'node:child_process'
import * as fs from 'node:fs'
import { promisify } from 'node:util'
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import { detectAndTrimSilence } from '../../utils/audio-trimmer'
import type { AudioGenerationResult, AudioService } from './index'

const execAsync = promisify(exec)

/**
 * ElevenLabs text-to-speech service implementation
 * Provides high-quality, natural-sounding text-to-speech synthesis
 */
export class ElevenLabsService implements AudioService {
  private readonly client: ElevenLabsClient
  private readonly voiceId: string
  private readonly modelId: string

  constructor(
    apiKey?: string,
    voiceId: string = 'I0ZNjxaJrLklKmZK1mlA', // Default: Bella voice
    modelId: string = 'eleven_monolingual_v1'
  ) {
    this.client = new ElevenLabsClient(apiKey ? { apiKey } : {})

    this.voiceId = voiceId
    this.modelId = modelId
  }

  /**
   * Generates speech and saves it to an audio file
   */
  async generateSpeech(text: string, outputPath: string, options?: any): Promise<AudioGenerationResult> {
    const activeVoiceId = options?.voiceId || options?.voice || this.voiceId
    console.log(`[ElevenLabs] Generating speech (${activeVoiceId}) for: "${text.slice(0, 50)}..."`)

    try {
      // Generate audio stream
      const audioStream = await this.client.textToSpeech.convert(activeVoiceId, {
        text,
        modelId: this.modelId,
        voiceSettings: {
          stability: 0.5,
          similarityBoost: 0.5
        }
      })

      // Collect chunks from the Web Streams ReadableStream
      const fileStream = fs.createWriteStream(outputPath)
      await new Promise<void>((resolve, reject) => {
        const reader = (audioStream as ReadableStream<Uint8Array>).getReader()
        const pump = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) {
                fileStream.end()
                break
              }
              fileStream.write(value)
            }
            fileStream.on('finish', () => {
              console.log(`[ElevenLabs] Speech generated successfully: ${outputPath}`)
              resolve()
            })
            fileStream.on('error', reject)
          } catch (error) {
            reject(error)
          }
        }
        pump()
      })

      // For now, ElevenLabs implementation doesn't return word timings
      // We can add it later if we use the timestamp feature (requires different API usage)
      // ✅ Trim silence
      const trimmedPath = outputPath.replace('.mp3', '_trimmed.mp3')
      const trimResult = await detectAndTrimSilence(outputPath, trimmedPath)
      if (fs.existsSync(trimmedPath)) {
        fs.renameSync(trimmedPath, outputPath)
      }

      console.log(`[ElevenLabs] ✅ Speech generated & trimmed: ${outputPath} (-${trimResult.startTrimmedMs}ms start)`)

      return {
        audioPath: outputPath,
        duration: trimResult.newDurationMs / 1000,
        wordTimings: []
      }
    } catch (error) {
      console.error(`[ElevenLabs] Error generating speech:`, error)
      throw new Error(
        `Failed to generate speech with ElevenLabs: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}
