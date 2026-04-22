import OpenAI from 'openai'
import type { LLMService, LLMServiceConfig } from './index'

// ─── Retry Helpers ────────────────────────────────────────────────────────────

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const NETWORK_ERROR_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE'])

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const err = error as any
  if (err.status && RETRYABLE_STATUS.has(err.status)) return true
  if (err.code === 'rate_limit_exceeded') return true
  const nodeCode = (error as NodeJS.ErrnoException).code
  if (nodeCode && NETWORK_ERROR_CODES.has(nodeCode)) return true
  const msg = error.message.toLowerCase()
  return (
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('socket') ||
    msg.includes('fetch failed') ||
    msg.includes('econnreset')
  )
}

async function withRetry<T>(
  fn: () => Promise<T>,
  {
    maxAttempts = 3,
    baseDelayMs = 5000,
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
      console.warn(`[OpenAILLM] ${label} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay / 1000}s…`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw lastError
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Implementation using OpenAI (ChatGPT) for LLM script and idea generation.
 */
export class OpenAILLMService implements LLMService {
  private client: OpenAI
  private modelId: string

  constructor(config: LLMServiceConfig) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required to use the OpenAI LLM service')
    }
    this.client = new OpenAI({
      apiKey: config.apiKey,
      timeout: 180_000 // 3 minutes for complex saga generation
    })
    this.modelId = config.modelId || 'gpt-4o'
  }

  async generateContent(
    prompt: string,
    systemInstruction?: string,
    responseMimeType?: string,
    images?: { data: string; mimeType: string }[]
  ): Promise<string> {
    return withRetry(
      async () => {
        const messages: any[] = []

        if (systemInstruction) {
          messages.push({ role: 'system', content: systemInstruction })
        }

        const userContent: any[] = [{ type: 'text', text: prompt }]

        if (images && images.length > 0) {
          for (const img of images) {
            userContent.push({
              type: 'image_url',
              image_url: {
                url: `data:${img.mimeType};base64,${img.data}`
              }
            })
          }
        }

        messages.push({ role: 'user', content: userContent })

        const options: any = {
          model: this.modelId,
          messages,
          temperature: 0.8,
          max_tokens: 4096
        }

        if (responseMimeType === 'application/json') {
          options.response_format = { type: 'json_object' }
        }

        const response = await this.client.chat.completions.create(options)
        const text = response.choices?.[0]?.message?.content

        if (!text) {
          throw new Error('Failed to generate content with OpenAI')
        }

        return text
      },
      { label: 'generateContent', maxAttempts: 3, baseDelayMs: 5000 }
    )
  }

  async *streamContent(prompt: string, systemInstruction?: string, responseMimeType?: string): AsyncIterable<string> {
    const messages: any[] = []

    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction })
    }
    messages.push({ role: 'user', content: prompt })

    const options: any = {
      model: this.modelId,
      messages,
      temperature: 0.8,
      max_tokens: 4096,
      stream: true
    }

    if (responseMimeType === 'application/json') {
      options.response_format = { type: 'json_object' }
    }

    const stream = (await this.client.chat.completions.create(options)) as any
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || ''
      if (content) {
        yield content
      }
    }
  }
}
