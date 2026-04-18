import type { LLMService } from '@/application/services/llm.service'

export interface NarrativeFact {
  id: string
  content: string
  importance: number // 1-10
  episodeIndex: number
  tags: string[]
}

/**
 * VimaxNarrativeMemory
 * A RAG-lite system for maintaining long-term saga coherence.
 * Instead of a vectordb, it uses LLM-based semantic filtering over a structured fact registry.
 */
export class VimaxNarrativeMemory {
  private vault: NarrativeFact[] = []

  constructor(private readonly llmService: LLMService) {}

  public addFact(fact: Omit<NarrativeFact, 'id'>): void {
    const id = `fact_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
    this.vault.push({ ...fact, id })
  }

  public async retrieveRelevantFacts(query: string, limit: number = 5): Promise<NarrativeFact[]> {
    if (this.vault.length === 0) return []
    if (this.vault.length <= limit) return this.vault

    const systemPrompt = `
You are the Saga Librarian. Your task is to select the ${limit} most relevant narrative facts from the vault that relate to the current query.
Return the IDs of the selected facts as a JSON array of strings.

VAULT:
${this.vault.map((f) => `[${f.id}] (Imp:${f.importance}) ${f.content}`).join('\n')}
`

    try {
      const response = await this.llmService.generateContent(
        `QUERY: ${query}\n\nSelect relevant Fact IDs:`,
        systemPrompt,
        'application/json'
      )

      const selectedIds = JSON.parse(response)
      if (!Array.isArray(selectedIds)) return this.vault.slice(0, limit)

      return this.vault.filter((f) => selectedIds.includes(f.id))
    } catch (error) {
      console.warn('[VimaxNarrativeMemory] Retrieval failed, falling back to recent facts.', error)
      return this.vault.slice(-limit)
    }
  }

  public getVault(): NarrativeFact[] {
    return this.vault
  }

  public loadVault(facts: NarrativeFact[]): void {
    this.vault = facts
  }
}
