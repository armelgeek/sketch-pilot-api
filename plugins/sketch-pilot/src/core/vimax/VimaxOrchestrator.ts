import { LLMServiceFactory, type LLMService } from '../../services/llm'
import type { LLMScriptOutput } from '../generators/series/series-script.schema'
import { VimaxNarrationAgent } from './VimaxNarrationAgent'
import { VimaxScreenwriter } from './VimaxScreenwriter'

/**
 * VimaxOrchestrator
 *
 * Ordonnanceur du pipeline Vimax Multi-Pass.
 * Gère l'enchaînement : Narration (Pass 1) -> Screenwriter (Pass 2).
 */
export class VimaxOrchestrator {
  private narrationAgent: VimaxNarrationAgent
  private screenwriter: VimaxScreenwriter

  constructor(private llm: LLMService) {
    this.narrationAgent = new VimaxNarrationAgent(llm)
    this.screenwriter = new VimaxScreenwriter(llm)
  }

  /**
   * Exécute le pipeline complet pour un épisode.
   * Si une narration est fournie, la Pass 1 est ignorée.
   */
  async generateEpisodeScript(topic: string, context: any, initialNarration?: string): Promise<LLMScriptOutput> {
    console.info('[VimaxOrchestrator] 🎬 Starting Multi-Pass Pipeline...')

    let narration = initialNarration

    if (!narration) {
      // Pass 1: Narration
      console.info('[VimaxOrchestrator] 📝 Pass 1: Generating Narration...')
      narration = await this.narrationAgent.generateNarration(topic, context)
      console.info(`[VimaxOrchestrator] Narration generated (${narration.length} chars).`)
    } else {
      console.info('[VimaxOrchestrator] ⏩ Pass 1 skipped: Using provided narration.')
    }

    // Pass 2: Screenwriter
    console.info('[VimaxOrchestrator] 🎭 Pass 2: Generating Screenplay...')
    const screenplay = await this.screenwriter.generateScreenplay(narration, context)
    console.info(`[VimaxOrchestrator] Screenplay generated with ${screenplay.scenes.length} scenes.`)

    return screenplay
  }

  /**
   * Factory method to create an orchestrator with a specific provider.
   */
  static async create(provider: 'openai' | 'gemini' = 'openai'): Promise<VimaxOrchestrator> {
    const apiKey = provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error(`Missing API Key for ${provider}`)

    const llm = await LLMServiceFactory.create({
      provider,
      apiKey
    })

    return new VimaxOrchestrator(llm)
  }
}
