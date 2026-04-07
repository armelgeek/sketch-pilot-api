import { GoogleGenAI } from '@google/genai'
import type { LLMService, LLMServiceConfig } from './index'

// ─── Retry Helpers ────────────────────────────────────────────────────────────

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const RETRYABLE_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE'])

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const err = error as any

  // HTTP status codes worth retrying
  if (err.status && RETRYABLE_STATUS.has(err.status)) return true
  if (err.code && typeof err.code === 'number' && RETRYABLE_STATUS.has(err.code)) return true

  // Node.js network error codes
  if (err.code && typeof err.code === 'string' && RETRYABLE_CODES.has(err.code)) return true

  // Message heuristics
  const msg = error.message.toLowerCase()
  return (
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('timeout') ||
    msg.includes('network') ||
    msg.includes('socket') ||
    msg.includes('fetch failed') ||
    msg.includes('service unavailable') ||
    msg.includes('internal server error')
  )
}

async function withRetry<T>(
  fn: () => Promise<T>,
  {
    maxAttempts = 3,
    baseDelayMs = 5_000,
    maxDelayMs = 60_000,
    label = 'operation'
  }: { maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number; label?: string } = {}
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (!isRetryableError(error) || attempt === maxAttempts) throw error
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs)
      console.warn(`[GeminiLLM] ${label} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms…`, error)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastError
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class GeminiLLMService implements LLMService {
  private client: GoogleGenAI
  private modelId: string

  constructor(config: LLMServiceConfig) {
    this.client = new GoogleGenAI({ apiKey: config.apiKey })
    this.modelId = config.modelId || 'gemini-2.5-flash'
  }

  async generateContent(prompt: string, systemInstruction?: string, responseMimeType?: string): Promise<string> {
    return withRetry(
      async () => {
        const result = await this.client.models.generateContent({
          model: this.modelId,
          contents: [{ text: prompt }],
          config: {
            systemInstruction,
            responseMimeType: (responseMimeType as any) || 'text/plain',
            temperature: 0.8
          }
        })

        const text = result.candidates?.[0]?.content?.parts?.[0]?.text
        if (!text) {
          // Not a network error — fail immediately without retrying
          throw Object.assign(new Error('Empty response from Gemini'), { retryable: false })
        }
        return text
      },
      { label: 'generateContent', maxAttempts: 4, baseDelayMs: 5_000, maxDelayMs: 60_000 }
    )
  }
}
