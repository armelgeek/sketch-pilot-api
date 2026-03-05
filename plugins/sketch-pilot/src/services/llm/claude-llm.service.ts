import { LLMService, LLMServiceConfig } from './index';

/**
 * Implementation using Claude (primarily Haiku) for LLM content generation.
 * 99% cheaper than Gemini with comparable quality for structured tasks.
 *
 * Includes prompt caching support:
 * - System prompts are cached for 5 minutes (25% cost reduction for cached portion)
 * - Ideal for reusing same system instruction across multiple requests
 * - API version 2024-11-04 or later required
 */
export class ClaudeLLMService implements LLMService {
    private apiKey: string;
    private modelId: string;
    private client: any; // Will be imported dynamically
    private cacheSystemPrompt: boolean;

    constructor(config: LLMServiceConfig) {
        this.apiKey = config.apiKey;
        // Claude 3.5 Haiku for ultra-low cost ($0.03 per 1M input tokens vs $2.50 for Gemini)
        this.modelId = config.modelId || 'claude-3-5-haiku-20241022';
        // Enable prompt caching by default for cost savings
        this.cacheSystemPrompt = config.cacheSystemPrompt !== false;
    }

    async generateContent(
        prompt: string,
        systemInstruction?: string,
        responseMimeType?: string
    ): Promise<string> {
        return this.retryOperation(async () => {
            // Dynamic import to avoid hard dependency during build if SDK not installed
            let Anthropic;
            try {
                Anthropic = require('@anthropic-ai/sdk').default;
            } catch (e) {
                throw new Error('Claude LLM service requires @anthropic-ai/sdk. Install with: npm install @anthropic-ai/sdk');
            }

            const client = new Anthropic({ apiKey: this.apiKey });
            
            const systemPrompt = systemInstruction || 'You are a helpful assistant.';
            
            // Build system message with caching support
            // Prompt caching: system prompt is cached for 5 minutes (25% cost for cached tokens)
            const systemMessages: any = {
                type: 'text',
                text: systemPrompt,
            };
            
            if (this.cacheSystemPrompt) {
                systemMessages.cache_control = { type: 'ephemeral' };
                console.log('[ClaudeLLM] Prompt caching enabled for system instruction (-25% cost on input tokens)');
            }
            
            const message = await client.messages.create({
                model: this.modelId,
                max_tokens: 4096,
                system: [systemMessages],  // Now an array to support cache_control
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                temperature: 0.8,
            });

            // Extract usage stats to show cache benefits
            const usage = (message as any).usage;
            if (usage && this.cacheSystemPrompt) {
                const cached = (usage as any).cache_read_input_tokens || 0;
                const fresh = usage.input_tokens || 0;
                if (cached > 0) {
                    console.log(`[ClaudeLLM] Cache HIT: ${cached} tokens from cache + ${fresh} fresh = ${cached + fresh} total`);
                    console.log(`[ClaudeLLM] Cost savings: ~${(cached * 0.25 / 1000).toFixed(4)} USD from cache reuse`);
                }
            }

            const text = message.content?.[0]?.type === 'text' ? message.content[0].text : null;
            if (!text) {
                throw new Error('Failed to generate content with Claude');
            }
            return text;
        });
    }

    private async retryOperation<T>(
        operation: () => Promise<T>,
        retries: number = 3,
        delay: number = 5000
    ): Promise<T> {
        try {
            return await operation();
        } catch (error: any) {
            const isRetryable = 
                error.status === 429 || 
                error.status === 503 || 
                error.status === 500 ||
                error.code === 'RATE_LIMIT_ERROR' ||
                error.message?.includes('rate limit');

            if (retries > 0 && isRetryable) {
                console.warn(
                    `[ClaudeLLM] Rate limited or service unavailable. Retrying in ${delay / 1000}s... (${retries} attempts left)`
                );
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.retryOperation(operation, retries - 1, delay * 2);
            }
            throw error;
        }
    }
}
