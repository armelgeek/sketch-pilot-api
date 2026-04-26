// ─────────────────────────────────────────────
// LLMService — Interface abstraction
// Permet de swapper Gemini, OpenAI, Anthropic, etc.
// ─────────────────────────────────────────────

export interface LLMService {
  generateContent: (
    prompt: string,
    systemInstruction?: string,
    responseMimeType?: 'text/plain' | 'application/json',
    images?: { data: string; mimeType: string }[],
    options?: { temperature?: number; topP?: number; maxOutputTokens?: number }
  ) => Promise<string>
}
