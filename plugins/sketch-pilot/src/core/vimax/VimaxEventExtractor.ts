import type { LLMService } from '../../services/llm'
import type { VimaxEvent } from './types'

/**
 * VimaxEventExtractor
 * Deconstructs a novel or concept into fundamental sequential events.
 * Ported from event_extractor.py
 */
export class VimaxEventExtractor {
  constructor(private llmService: LLMService) {}

  private getSystemPrompt(): string {
    return `
You are a highly skilled Literary Analyst AI. Your expertise is in narrative structure and plot deconstruction.
Extract the next event from the provided text, building upon previous ones.

[Guidelines]
1. Criticality: Focus on events critical to plot or character development.
2. Logical Distinction: Ensure the event is logically distinct.
3. Flow: Unify multiple related scenes under a single dramatic goal (e.g., "The Chase").
4. Process: Provide a detailed step-by-step account.
5. Output MUST be JSON: { "index": 0, "description": "...", "processChain": ["..."], "isLast": false, ... }
`
  }

  public async extractEvents(text: string): Promise<VimaxEvent[]> {
    const events: VimaxEvent[] = []
    let isLast = false

    while (!isLast) {
      const prompt = `
<TEXT_START>
${text}
<TEXT_END>

<EXTRACTED_EVENTS_START>
${events.map((e) => `Event ${e.index}: ${e.description}`).join('\n')}
<EXTRACTED_EVENTS_END>

Extract the next event.
`
      const response = await this.llmService.generateContent(prompt, this.getSystemPrompt(), 'application/json')
      try {
        const event = JSON.parse(response) as VimaxEvent
        events.push(event)
        isLast = event.isLast
        if (events.length > 20) break // Safety break
      } catch (error) {
        console.error('[VimaxEventExtractor] Extraction error:', error)
        break
      }
    }

    return events
  }
}
