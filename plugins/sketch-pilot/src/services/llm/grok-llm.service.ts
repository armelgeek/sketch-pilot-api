import type { LLMService, LLMServiceConfig } from './index'

// ─── Retry Helpers ────────────────────────────────────────────────────────────

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const NETWORK_ERROR_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE'])

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const err = error as any
  if (err.status && RETRYABLE_STATUS.has(err.status)) return true
  const nodeCode = (error as NodeJS.ErrnoException).code
  if (nodeCode && NETWORK_ERROR_CODES.has(nodeCode)) return true
  const msg = error.message.toLowerCase()
  return (
    msg.includes('timeout') ||
    msg.includes('network') ||
    msg.includes('fetch failed') ||
    msg.includes('econnreset') ||
    msg.includes('connect')
  )
}

async function withRetry<T>(
  fn: () => Promise<T>,
  {
    maxAttempts = 3,
    baseDelayMs = 2000,
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
      console.warn(`[GrokLLM] ${label} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay / 1000}s…`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw lastError
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Implementation using xAI Grok for LLM content generation.
 * Network-resilient with timeout and error handling.
 */
export class GrokLLMService implements LLMService {
  private apiKey: string
  private modelId: string

  constructor(config: LLMServiceConfig) {
    this.apiKey = config.apiKey
    this.modelId = config.modelId || 'grok-4-1-fast-reasoning'
  }

  async generateContent(prompt: string, systemInstruction?: string, responseMimeType?: string): Promise<string> {
    console.log(`[GrokLLM] Generating content with ${this.modelId}...`)

    const messages: any[] = []
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction })
    }
    messages.push({ role: 'user', content: prompt })

    const body = JSON.stringify({
      model: this.modelId,
      messages,
      temperature: 0.8,
      stream: false
    })

    return withRetry(() => this.callApi(body), { label: 'generateContent', baseDelayMs: 2000 })
  }

  private async callApi(body: string): Promise<string> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000)

    let res: Response
    try {
      res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body
      })
    } catch (error) {
      // fetch rejects with AbortError on timeout — normalize to ETIMEDOUT for retry detection
      if (error instanceof Error && error.name === 'AbortError') {
        const normalized = new Error('Grok LLM request timeout after 60s') as NodeJS.ErrnoException
        normalized.code = 'ETIMEDOUT'
        throw normalized
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }

    const responseBody = await res.text()

    if (!res.ok) {
      const err = new Error(`Grok LLM API Error (${res.status}): ${responseBody}`) as any
      err.status = res.status
      throw err
    }

    console.log(`[GrokLLM] Raw response (first 500 chars): ${responseBody.slice(0, 500)}...`)

    let data: any
    try {
      data = JSON.parse(responseBody)
    } catch (error) {
      console.error('[GrokLLM] Parsing error:', error, responseBody)
      throw error
    }

    let content =
      data.output?.[0]?.content?.[0]?.text ||
      (typeof data.text === 'string' ? data.text : null) ||
      data.choices?.[0]?.message?.content ||
      data.message?.content ||
      (data.body ? JSON.parse(data.body).text : null)

    if (!content) {
      console.error('[GrokLLM] Unexpected response structure:', data)
      throw new Error('No content in Grok response. Structure might have changed.')
    }

    if (typeof content !== 'string') {
      console.log('[GrokLLM] Content is an object, stringifying...')
      content = JSON.stringify(content)
    }

    return content
  }
}
