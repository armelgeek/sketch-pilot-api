// ─────────────────────────────────────────────
// LLMService — Interface abstraction
// Permet de swapper Gemini, OpenAI, Anthropic, etc.
// ─────────────────────────────────────────────

export interface LLMService {
  generateContent: (
    prompt: string,
    systemInstruction?: string,
    responseMimeType?: 'text/plain' | 'application/json'
  ) => Promise<string>
}
