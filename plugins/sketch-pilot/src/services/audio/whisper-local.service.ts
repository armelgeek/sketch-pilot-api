import { spawn } from 'node:child_process'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { TranscriptionResult, TranscriptionService } from './transcription.service'
import type { WordTiming } from './index'

export interface WhisperLocalConfig {
  model?: string
  device?: string
  language?: string
}

// Regex partagé — à déplacer dans utils/word-filter.ts si réutilisé ailleurs
const PUNCTUATION_ONLY = /^[.,!?;:\-—"'`«»„‟]+$/

export class WhisperLocalService implements TranscriptionService {
  private readonly model: string
  private readonly device: string
  private readonly language?: string

  constructor(config: WhisperLocalConfig = {}) {
    this.model = config.model || 'base'
    this.device = config.device || 'cpu'
    this.language = config.language
  }

  async transcribe(audioPath: string): Promise<TranscriptionResult> {
    console.log(`[WhisperLocal] Transcribing: ${path.basename(audioPath)} (model: ${this.model})`)

    const baseDir = path.dirname(audioPath)
    const fileName = path.basename(audioPath, path.extname(audioPath))

    // ✅ UUID par appel — évite la race condition en multi-scène
    const outputDir = path.join(baseDir, `whisper_output_${crypto.randomUUID()}`)
    fs.mkdirSync(outputDir, { recursive: true })

    try {
      // ✅ spawn avec tableau d'args — aucune injection shell possible
      await this.runWhisper(audioPath, outputDir)

      // ✅ Lire le premier .json trouvé — plus robuste que reconstruire le nom
      const jsonPath = this.findOutputJson(outputDir, fileName)
      if (!jsonPath) {
        throw new Error(`Whisper output JSON not found in ${outputDir}`)
      }

      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
      const text: string = data.text || ''
      const wordTimings: WordTiming[] = this.extractWordTimings(data)

      return { text, wordTimings }
    } finally {
      // ✅ Cleanup dans finally — garanti même si la lecture JSON plante
      try {
        fs.rmSync(outputDir, { recursive: true, force: true })
      } catch (error) {
        console.warn(`[WhisperLocal] Cleanup failed for ${outputDir}:`, error)
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private runWhisper(audioPath: string, outputDir: string): Promise<void> {
    const args = [
      audioPath,
      '--model',
      this.model,
      '--device',
      this.device,
      '--output_dir',
      outputDir,
      '--output_format',
      'json',
      '--word_timestamps',
      'True',
      ...(this.language ? ['--language', this.language] : [])
    ]

    return new Promise<void>((resolve, reject) => {
      const proc = spawn('whisper', args)

      proc.stderr.on('data', (chunk) => {
        // Whisper écrit sa progression sur stderr — utile pour le debug
        process.stdout.write(`[WhisperLocal] ${chunk}`)
      })

      proc.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`Whisper process exited with code ${code}`))
      })

      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn whisper: ${err.message}`))
      })
    })
  }

  private findOutputJson(outputDir: string, preferredName: string): string | null {
    // Cherche d'abord le nom attendu, sinon prend le premier .json disponible
    const preferred = path.join(outputDir, `${preferredName}.json`)
    if (fs.existsSync(preferred)) return preferred

    const files = fs.readdirSync(outputDir).filter((f) => f.endsWith('.json'))
    return files.length > 0 ? path.join(outputDir, files[0]) : null
  }

  private extractWordTimings(data: any): WordTiming[] {
    const wordTimings: WordTiming[] = []

    if (!data.segments) return wordTimings

    for (const segment of data.segments) {
      if (!segment.words) continue
      for (const w of segment.words) {
        const cleanWord = w.word.trim()
        if (!cleanWord || PUNCTUATION_ONLY.test(cleanWord)) continue
        wordTimings.push({
          word: cleanWord,
          start: w.start,
          end: w.end,
          startMs: Math.round(w.start * 1000),
          durationMs: Math.round((w.end - w.start) * 1000)
        })
      }
    }

    return wordTimings
  }
}
