import * as fs from 'node:fs'
import OpenAI from 'openai'
import type { TranscriptionResult, TranscriptionService } from './transcription.service'
import type { WordTiming } from './index'

export class WhisperOpenAiService implements TranscriptionService {
  private readonly client: OpenAI

  constructor(apiKey?: string) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required for Whisper transcription')
    }
    this.client = new OpenAI({
      apiKey
    })
  }

  async transcribe(audioPath: string): Promise<TranscriptionResult> {
    console.log(`[WhisperOpenAi] Transcribing: ${audioPath}`)

    try {
      const response = await this.client.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['word']
      })

      const transcription = response as any
      const wordTimings: WordTiming[] = (transcription.words || []).map((w: any) => ({
        word: w.word,
        start: w.start,
        end: w.end,
        startMs: Math.round(w.start * 1000),
        durationMs: Math.round((w.end - w.start) * 1000)
      }))

      return {
        text: transcription.text,
        wordTimings
      }
    } catch (error) {
      console.error(`[WhisperOpenAi] Error transcribing audio:`, error)
      throw new Error(
        `Failed to transcribe audio with OpenAI Whisper: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}
