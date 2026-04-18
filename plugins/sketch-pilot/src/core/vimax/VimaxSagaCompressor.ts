import type { LLMService } from '../../services/llm'

/**
 * VimaxSagaCompressor
 * Condenses long narrative excerpts while preserving core plot points and character arcs.
 * Ported from novel_compressor.py
 */
export class VimaxSagaCompressor {
  constructor(private llmService: LLMService) {}

  private getCompressionPrompt(): string {
    return `
You are an expert text compression assistant specialized in literary content. Your goal is to condense story excerpts while preserving core narrative elements, key details, character development, and plot coherence.

**GUIDELINES**
1. Fidelity to the Plot: Preserve all major plot points, twists, and sequence of key events.
2. Character Consistency: Maintain character actions and important dialogue.
3. Streamline Description: Reduce lengthy descriptions to their most essential/evocative elements.
4. Simplify Language: Use direct and concise language. Eliminate redundancies.
5. Produce a seamless paragraph without markers or section breaks.
`
  }

  private getAggregationPrompt(): string {
    return `
You are a professional text processing assistant specialized in merging sequential text fragments. 
Merge the sequential chunks while removing overlaps and redundant repetitions. Ensure smooth transitions.
`
  }

  public async compress(text: string): Promise<string> {
    // Basic implementation: single pass compression for Sketch Pilot context
    // In Vimax it handles recursive splitting, but for series bible history,
    // we often just need to condense the "Story so far".

    const prompt = `
<CHUNK_START>
${text}
<CHUNK_END>

Compress this text following the guidelines.
`

    const response = await this.llmService.generateContent(prompt, this.getCompressionPrompt())

    return response.trim()
  }

  public async aggregate(chunks: string[]): Promise<string> {
    const chunksStr = chunks.map((c, i) => `<CHUNK_${i}_START>\n${c}\n<CHUNK_${i}_END>`).join('\n')

    const response = await this.llmService.generateContent(chunksStr, this.getAggregationPrompt())

    return response.trim()
  }
}
