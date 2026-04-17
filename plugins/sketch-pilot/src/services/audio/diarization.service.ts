import * as fs from 'node:fs'
import { v1 } from '@google-cloud/speech'
import type { SpeakerSegment } from '../../types/analysis.types'

export interface SpeakerDiarizationService {
  diarize: (audioPath: string, onProgress?: (progress: number, message: string) => void) => Promise<SpeakerSegment[]>
}

export class PyannoteDiarizationService implements SpeakerDiarizationService {
  /**
   * Dummy implementation for now. In a real scenario, this would call
   * a Python microservice or an API.
   */
  async diarize(
    audioPath: string,
    onProgress?: (progress: number, message: string) => void
  ): Promise<SpeakerSegment[]> {
    if (onProgress) onProgress(0, 'Starting diarization...')

    // Placeholder logic: assume 2 speakers switching every few seconds
    const segments: SpeakerSegment[] = [
      { speakerId: 'SPEAKER_00', start: 0, end: 5 },
      { speakerId: 'SPEAKER_01', start: 5, end: 10 },
      { speakerId: 'SPEAKER_00', start: 10, end: 15 }
    ]

    if (onProgress) onProgress(100, 'Diarization complete')
    return segments
  }
}

/**
 * Service using Google Cloud Speech-to-Text for diarization.
 */
export class GoogleDiarizationService implements SpeakerDiarizationService {
  private client: v1.SpeechClient

  constructor(apiKey?: string) {
    // Si une API Key est fournie (comme dans .env), on l'utilise.
    // Sinon, Google cherchera les credentials par défaut (ADC).
    this.client = new v1.SpeechClient(apiKey ? { apiKey } : {})
  }

  async diarize(
    audioPath: string,
    onProgress?: (progress: number, message: string) => void
  ): Promise<SpeakerSegment[]> {
    if (onProgress) onProgress(10, 'Reading audio file for Google Speech...')

    const fileBuffer = fs.readFileSync(audioPath)
    const audioBytes = fileBuffer.toString('base64')

    const config = {
      encoding: 'MP3' as const,
      sampleRateHertz: 16000,
      languageCode: 'fr-FR',
      diarizationConfig: {
        enableSpeakerDiarization: true,
        minSpeakerCount: 1,
        maxSpeakerCount: 5
      }
    }

    const request = {
      audio: { content: audioBytes },
      config
    }

    if (onProgress) onProgress(30, 'Sending request to Google Cloud...')

    // L'API Google Speech STT peut prendre du temps sur des fichiers longs
    const [response] = await this.client.recognize(request)

    if (onProgress) onProgress(80, 'Processing Google Speech response...')

    const transcription = response.results?.[response.results.length - 1]
    const wordsInfo = transcription?.alternatives?.[0]?.words

    if (!wordsInfo || wordsInfo.length === 0) {
      console.warn('[GoogleDiarization] No speakers detected by Google API')
      return []
    }

    // Extraction des segments par speaker
    const segments: SpeakerSegment[] = []
    let currentSpeakerTag = -1
    let currentSegment: SpeakerSegment | null = null

    for (const word of wordsInfo) {
      const speakerTag = word.speakerTag || 1
      const start =
        parseFloat(word.startTime?.seconds?.toString() || '0') +
        parseFloat(word.startTime?.nanos?.toString() || '0') / 1e9
      const end =
        parseFloat(word.endTime?.seconds?.toString() || '0') + parseFloat(word.endTime?.nanos?.toString() || '0') / 1e9

      if (speakerTag !== currentSpeakerTag) {
        if (currentSegment) {
          segments.push(currentSegment)
        }
        currentSpeakerTag = speakerTag
        currentSegment = {
          speakerId: `SPEAKER_${speakerTag}`,
          start,
          end,
          text: word.word || ''
        }
      } else if (currentSegment) {
        currentSegment.end = end
        currentSegment.text += ` ${word.word || ''}`
      }
    }

    if (currentSegment) {
      segments.push(currentSegment)
    }

    if (onProgress) onProgress(100, 'Google analysis complete')
    return segments
  }
}
