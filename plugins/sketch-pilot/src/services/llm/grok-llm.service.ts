import * as https from 'node:https'
import type { LLMService, LLMServiceConfig } from './index'

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

  /**
   * Detect if error is network-related
   */
  private isNetworkError(error: any): boolean {
    const message = error?.message || ''
    const code = error?.code || ''
    return (
      code === 'ETIMEDOUT' ||
      code === 'ECONNREFUSED' ||
      code === 'ENETUNREACH' ||
      code === 'EHOSTUNREACH' ||
      message.includes('timeout') ||
      message.includes('ECONNRESET') ||
      message.includes('connect')
    )
  }

  async generateContent(prompt: string, systemInstruction?: string, responseMimeType?: string): Promise<string> {
    console.log(`[GrokLLM] Generating content with ${this.modelId}...`)

    const messages: any[] = []
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction })
    }
    messages.push({ role: 'user', content: prompt })

    const requestData = JSON.stringify({
      model: this.modelId,
      messages,
      temperature: 0.8,
      stream: false
    })

    return this.makeRequest(requestData, 0)
  }

  /**
   * Make HTTP request with retry logic for network errors
   */
  private async makeRequest(requestData: string, attempt: number = 0): Promise<string> {
    const maxRetries = 3

    return new Promise(async (resolve, reject) => {
      const req = https.request(
        {
          hostname: 'api.x.ai',
          path: '/v1/chat/completions',
          method: 'POST',
          timeout: 60000, // ← 60s timeout for LLM generation
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`
          }
        },
        (res) => {
          let body = ''
          res.on('data', (chunk) => (body += chunk))
          res.on('end', () => {
            if (res.statusCode !== 200) {
              reject(new Error(`Grok LLM API Error (${res.statusCode}): ${body}`))
              return
            }

            try {
              console.log(`[GrokLLM] Raw response (first 500 chars): ${body.slice(0, 500)}...`)
              const data = JSON.parse(body)

              // Handle various response formats from xAI /v1/responses or /v1/chat/completions
              let content =
                data.output?.[0]?.content?.[0]?.text ||
                (typeof data.text === 'string' ? data.text : null) ||
                data.choices?.[0]?.message?.content ||
                data.message?.content ||
                (data.body ? JSON.parse(data.body).text : null)

              if (!content) {
                console.error('[GrokLLM] Unexpected response structure:', data)
                reject(new Error('No content in Grok response. Structure might have changed.'))
                return
              }

              // If content is an object (can happen with some structured output features),
              // stringify it so JSON.parse in the generator works.
              if (typeof content !== 'string') {
                console.log('[GrokLLM] Content is an object, stringifying...')
                content = JSON.stringify(content)
              }

              resolve(content)
            } catch (error) {
              console.error('[GrokLLM] Parsing error:', error, body)
              reject(error)
            }
          })
        }
      )

      req.on('timeout', () => {
        req.destroy()
        const error = new Error('Grok LLM request timeout after 60s')
        ;(error as any).code = 'ETIMEDOUT'
        reject(error)
      })

      req.on('error', async (error) => {
        const isNetError = this.isNetworkError(error)
        if (isNetError && attempt < maxRetries) {
          // Exponential backoff: 2s → 4s → 8s
          const delay = 2000 * 2 ** attempt
          console.warn(
            `[GrokLLM] Network error, retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${maxRetries})`
          )
          setTimeout(() => {
            this.makeRequest(requestData, attempt + 1)
              .then(resolve)
              .catch(reject)
          }, delay)
        } else {
          console.error(`[GrokLLM] Error (${isNetError ? 'network' : 'other'}):`, error)
          reject(error)
        }
      })

      req.write(requestData)
      req.end()
    })
  }
}
