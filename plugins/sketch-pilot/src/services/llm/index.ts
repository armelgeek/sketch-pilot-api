/**
 * LLM Service Interface and Factory
 */

export interface LLMService {
  generateContent: (prompt: string, systemInstruction?: string, responseMimeType?: string) => Promise<string>
}

export type LLMProvider = 'gemini' | 'grok' | 'claude' | 'haiku' | 'openai'

export interface LLMServiceConfig {
  provider: LLMProvider
  apiKey: string
  modelId?: string
  cacheSystemPrompt?: boolean // Enable prompt caching (Claude only) for 25% cost reduction
}

/**
 * Factory for creating LLM service instances
 */
export const LLMServiceFactory = {
  /**
   * Create an LLM service based on the configuration
   */
  async create(config: LLMServiceConfig): Promise<LLMService> {
    switch (config.provider) {
      case 'gemini': {
        const { GeminiLLMService } = await import('./gemini-llm.service')
        return new GeminiLLMService(config)
      }
      case 'grok': {
        const { GrokLLMService } = await import('./grok-llm.service')
        return new GrokLLMService(config)
      }
      case 'claude':
      case 'haiku': {
        const { ClaudeLLMService } = await import('./claude-llm.service')
        return new ClaudeLLMService(config)
      }
      case 'openai': {
        const { OpenAILLMService } = await import('./openai-llm.service')
        return new OpenAILLMService(config)
      }
      default:
        throw new Error(`Unknown LLM provider: ${config.provider}`)
    }
  },

  /**
   * Get available providers
   */
  getAvailableProviders(): LLMProvider[] {
    return ['gemini', 'grok', 'claude', 'haiku', 'openai']
  }
}
