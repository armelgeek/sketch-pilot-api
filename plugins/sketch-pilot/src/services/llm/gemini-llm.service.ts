import { GoogleGenAI } from '@google/genai'
import type { LLMService, LLMServiceConfig } from './index'

/**
 * Implementation using Google Gemini for LLM content generation.
 */
export class GeminiLLMService implements LLMService {
  private client: GoogleGenAI
  private modelId: string

  constructor(config: LLMServiceConfig) {
    this.client = new GoogleGenAI({ apiKey: config.apiKey })
    // Use 1.5-flash for better free tier stability
    this.modelId = config.modelId || 'gemini-2.5-flash'
  }

  async generateContent(prompt: string, systemInstruction?: string, responseMimeType?: string): Promise<string> {
    return this.retryOperation(async () => {
      const result = await this.client.models.generateContent({
        model: this.modelId,
        contents: [{ text: prompt }],
        config: {
          systemInstruction,
          responseMimeType: (responseMimeType as any) || 'text/plain',
          temperature: 0.8,
          maxOutputTokens: 8192
        }
      })

      const text = result.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) {
        throw new Error('Failed to generate content with Gemini')
      }
      return text
    })
  }

  private async retryOperation<T>(operation: () => Promise<T>, retries: number = 3, delay: number = 5000): Promise<T> {
    try {
      return await operation()
    } catch (error: any) {
      if (retries > 0 && (error.status === 429 || error.status === 503 || error.code === 429)) {
        console.warn(
          `[GeminiLLM] Rate limited or service unavailable. Retrying in ${delay / 1000}s... (${retries} attempts left)`
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
        return this.retryOperation(operation, retries - 1, delay * 2)
      }
      throw error
    }
  }
}
