import * as fs from 'node:fs'
import * as path from 'node:path'
import { GoogleGenAI } from '@google/genai'
import type { AudioGenerationResult, AudioService } from './index'

export type GeminiVoiceName =
  | 'Zephyr'
  | 'Puck'
  | 'Charon'
  | 'Kore'
  | 'Fenrir'
  | 'Leda'
  | 'Orus'
  | 'Aoede'
  | 'Callirrhoe'
  | 'Autonoe'
  | 'Encelade'
  | 'Iapetus'
  | 'Umbriel'
  | 'Algieba'
  | 'Despina'
  | 'Erinome'
  | 'Algenib'
  | 'Rasalgethi'
  | 'Laomedeia'
  | 'Achernar'
  | 'Alnilam'
  | 'Schedar'
  | 'Gacrux'
  | 'Pulcherrima'
  | 'Achird'
  | 'Zubenelgenubi'
  | 'Vindemiatrix'
  | 'Sadachbia'
  | 'Sadaltager'
  | 'Sulafat'

export interface SpeakerConfig {
  speaker: string
  voiceName: GeminiVoiceName
  styleDirections?: string
}

export interface GeminiSpeechOptions {
  voice?: GeminiVoiceName
  styleDirections?: string
  multiSpeaker?: SpeakerConfig[]
  language?: string
}

/**
 * Gemini Speech Generation service
 * Uses Google Gemini API for high-quality, controllable text-to-speech synthesis
 * Supports single speaker, multi-speaker, and natural language style control
 */
export class GeminiSpeechService implements AudioService {
  private readonly client: GoogleGenAI
  private readonly languageCode: string
  private readonly defaultVoice: GeminiVoiceName

  private static readonly SUPPORTED_VOICES: GeminiVoiceName[] = [
    'Zephyr',
    'Puck',
    'Charon',
    'Kore',
    'Fenrir',
    'Leda',
    'Orus',
    'Aoede',
    'Callirrhoe',
    'Autonoe',
    'Encelade',
    'Iapetus',
    'Umbriel',
    'Algieba',
    'Despina',
    'Erinome',
    'Algenib',
    'Rasalgethi',
    'Laomedeia',
    'Achernar',
    'Alnilam',
    'Schedar',
    'Gacrux',
    'Pulcherrima',
    'Achird',
    'Zubenelgenubi',
    'Vindemiatrix',
    'Sadachbia',
    'Sadaltager',
    'Sulafat'
  ]

  private static readonly SUPPORTED_LANGUAGES = [
    'ar',
    'bn',
    'nl',
    'en',
    'fr',
    'de',
    'hi',
    'id',
    'it',
    'ja',
    'ko',
    'mr',
    'pl',
    'pt',
    'ro',
    'ru',
    'es',
    'ta',
    'te',
    'th',
    'tr',
    'uk',
    'vi',
    'af',
    'sq',
    'am',
    'hy',
    'az',
    'eu',
    'be',
    'bg',
    'my',
    'ca',
    'ceb',
    'cmn',
    'h',
    'cs',
    'da',
    'et',
    'fil',
    'fi',
    'gl',
    'ka',
    'el',
    'gu',
    'ht',
    'il',
    'hu',
    'est',
    'jv',
    'kn',
    'kok',
    'lo',
    'la',
    'lv',
    'lt',
    'lb',
    'mk',
    'mg',
    'ms',
    'ml',
    'mn',
    'ne',
    'nb',
    'nn',
    'ou',
    'ps',
    'fa',
    'pa',
    'sr',
    'sd',
    'si',
    'sk',
    'sl',
    'sw',
    'sv',
    'ur'
  ]

  constructor(apiKey: string, languageCode: string = 'en', defaultVoice: GeminiVoiceName = 'Kore') {
    if (!apiKey) {
      throw new Error('API key is required for Gemini Speech service')
    }

    this.client = new GoogleGenAI({ apiKey })
    this.languageCode = languageCode
    this.defaultVoice = defaultVoice
  }

  /**
   * Validates if a voice name is supported
   */
  static isVoiceSupported(voiceName: string): boolean {
    return this.SUPPORTED_VOICES.includes(voiceName as GeminiVoiceName)
  }

  /**
   * Get list of all supported voices
   */
  static getSupportedVoices(): GeminiVoiceName[] {
    return [...this.SUPPORTED_VOICES]
  }

  /**
   * Get list of supported languages
   */
  static getSupportedLanguages(): string[] {
    return [...this.SUPPORTED_LANGUAGES]
  }

  /**
   * Calculate duration from WAV file header
   */
  private async getWavDuration(filePath: string): Promise<number> {
    try {
      const buffer = await fs.promises.readFile(filePath)

      // WAV format: sample rate at bytes 24-27, byte rate at bytes 28-31
      const sampleRate = buffer.readUInt32LE(24)
      const byteRate = buffer.readUInt32LE(28)
      const fileSize = buffer.length

      // Data chunk starts at byte 36, calculate duration from file size
      // Duration = (file size - header) / byte rate
      const audioDataSize = fileSize - 36
      const duration = audioDataSize / byteRate

      return duration > 0 ? duration : 0
    } catch (error) {
      console.warn(`[GeminiSpeech] Could not calculate duration from WAV header:`, error)
      return 0
    }
  }

  /**
   * Generates single speaker speech from text
   */
  async generateSpeech(text: string, outputPath: string, options?: any): Promise<AudioGenerationResult> {
    const voiceName = (options?.voice || this.defaultVoice) as GeminiVoiceName

    if (!GeminiSpeechService.isVoiceSupported(voiceName)) {
      throw new Error(
        `Voice "${voiceName}" is not supported. Supported voices: ${GeminiSpeechService.SUPPORTED_VOICES.join(', ')}`
      )
    }

    console.log(`[GeminiSpeech] Generating single-speaker speech (${voiceName})`)

    try {
      const prompt = this.buildSingleSpeakerPrompt(text, voiceName, options?.styleDirections)

      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: prompt,
        config: {
          response_modalities: ['AUDIO'],
          speech_config: {
            voice_config: {
              prebuilt_voice_config: {
                voice_name: voiceName
              }
            }
          }
        } as any
      })

      const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data

      if (!audioData) {
        throw new Error('No audio content received from Gemini Speech API')
      }

      const buffer = Buffer.from(audioData, 'base64')
      await fs.promises.writeFile(outputPath, buffer)

      console.log(`[GeminiSpeech] Audio generated: ${outputPath}`)

      const duration = await this.getWavDuration(outputPath)

      return {
        audioPath: outputPath,
        duration,
        wordTimings: []
      }
    } catch (error) {
      console.error(`[GeminiSpeech] Error generating speech:`, error)
      throw new Error(
        `Failed to generate speech with Gemini: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Generates multi-speaker speech from text
   * Supports up to 2 speakers
   */
  async generateMultiSpeakerSpeech(
    text: string,
    outputPath: string,
    speakers: SpeakerConfig[]
  ): Promise<AudioGenerationResult> {
    if (speakers.length === 0 || speakers.length > 2) {
      throw new Error('Multi-speaker mode requires 1 to 2 speakers')
    }

    console.log(
      `[GeminiSpeech] Generating ${speakers.length}-speaker speech: ${speakers.map((s) => s.speaker).join(', ')}`
    )

    try {
      speakers.forEach((speaker) => {
        if (!GeminiSpeechService.isVoiceSupported(speaker.voiceName)) {
          throw new Error(`Voice "${speaker.voiceName}" is not supported`)
        }
      })

      const prompt = this.buildMultiSpeakerPrompt(text, speakers)

      const speakerConfigs = speakers.map((speaker) => ({
        speaker: speaker.speaker,
        voice_config: {
          prebuilt_voice_config: {
            voice_name: speaker.voiceName
          }
        }
      }))

      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: prompt,
        config: {
          response_modalities: ['AUDIO'],
          speech_config: {
            multi_speaker_voice_config: {
              speaker_voice_configs: speakerConfigs
            }
          }
        } as any
      })

      const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data

      if (!audioData) {
        throw new Error('No audio content received from Gemini Speech API')
      }

      const buffer = Buffer.from(audioData, 'base64')
      await fs.promises.writeFile(outputPath, buffer)

      console.log(`[GeminiSpeech] Multi-speaker audio generated: ${outputPath}`)

      const duration = await this.getWavDuration(outputPath)

      return {
        audioPath: outputPath,
        duration,
        wordTimings: []
      }
    } catch (error) {
      console.error(`[GeminiSpeech] Error generating multi-speaker speech:`, error)
      throw new Error(
        `Failed to generate multi-speaker speech: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Builds a single-speaker prompt with optional style directions
   * Uses natural language style control for tone, accent, and pacing
   */
  private buildSingleSpeakerPrompt(text: string, voiceName: GeminiVoiceName, styleDirections?: string): string {
    if (!styleDirections) {
      return text
    }

    return `${styleDirections}:\n"${text}"`
  }

  /**
   * Builds a multi-speaker prompt with speaker names and optional style directions
   * Format: Speaker1: text\nSpeaker2: text
   */
  private buildMultiSpeakerPrompt(text: string, speakers: SpeakerConfig[]): string {
    let prompt = ''

    if (speakers.some((s) => s.styleDirections)) {
      prompt = `${speakers.map((s) => s.styleDirections || `${s.speaker}:`.split('\n')[0]).join(' and ')}:\n\n`
    }

    prompt += text

    return prompt
  }

  /**
   * Generates a complete audio profile prompt for highly controlled performances
   * Includes audio profile, scene, director's notes, and transcript
   */
  buildAudioProfilePrompt(config: {
    characterName: string
    characterDescription: string
    scene: string
    directorNotes: {
      style?: string
      pacing?: string
      accent?: string
      [key: string]: string | undefined
    }
    transcript: string
  }): string {
    const profile = `# AUDIO PROFILE: ${config.characterName}
## "${config.characterDescription}"

## THE SCENE
${config.scene}

### DIRECTOR'S NOTES`

    const directors = Object.entries(config.directorNotes)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`)
      .join('\n')

    return `${profile}
${directors}

## TRANSCRIPT
${config.transcript}`
  }

  /**
   * Tests audio generation with a quick snippet
   */
  async testGeneration(text: string = 'Hello, this is a test.'): Promise<void> {
    const testPath = path.join(process.cwd(), 'test-gemini-speech.wav')

    try {
      const result = await this.generateSpeech(text, testPath, { voice: 'Kore' })
      console.log('✅ Gemini Speech test successful:', result)
      if (fs.existsSync(testPath)) {
        fs.unlinkSync(testPath)
      }
    } catch (error) {
      console.error('❌ Gemini Speech test failed:', error)
      throw error
    }
  }
}
