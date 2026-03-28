import OpenAI from 'openai'
import type { LLMService, LLMServiceConfig } from './index'

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
    this.client = new OpenAI({ apiKey: config.apiKey })
    // Use gpt-4o by default for speed and quality
    this.modelId = config.modelId || 'gpt-4o'
  }

  async generateContent(prompt: string, systemInstruction?: string, responseMimeType?: string): Promise<string> {
    return this.retryOperation(async () => {
      const messages: any[] = []

      // Add system instruction if provided
      if (systemInstruction) {
        messages.push({
          role: 'system',
          content: systemInstruction
        })
      }

      // Add the user prompt
      messages.push({
        role: 'user',
        content: prompt
      })

      // Prepare completion options
      const options: any = {
        model: this.modelId,
        messages,
        temperature: 0.8,
        max_tokens: 4096 // Sufficient for ~3000 words in JSON format
      }

      // Handle JSON response format requirement (often used by the script generator)
      if (responseMimeType === 'application/json') {
        options.response_format = { type: 'json_object' }
      }

      const response = await this.client.chat.completions.create(options)
      const text = response.choices?.[0]?.message?.content

      if (!text) {
        throw new Error('Failed to generate content with OpenAI')
      }

      return text
    })
  }

  private async retryOperation<T>(operation: () => Promise<T>, retries: number = 3, delay: number = 5000): Promise<T> {
    try {
      return await operation()
    } catch (error: any) {
      if (retries > 0 && (error.status === 429 || error.status === 503 || error.code === 'rate_limit_exceeded')) {
        console.warn(
          `[OpenAILLM] Rate limited or service unavailable. Retrying in ${delay / 1000}s... (${retries} attempts left)`
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
        return this.retryOperation(operation, retries - 1, delay * 2)
      }
      throw error
    }
  }
}
