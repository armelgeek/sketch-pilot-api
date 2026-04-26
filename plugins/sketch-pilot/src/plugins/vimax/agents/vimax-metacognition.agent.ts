import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { LLMService } from '../core/llm.interface'

export interface LearningPriority {
  agentName: string
  priorityScore: number // 0-100
  rationale: string
  suggestedFocus: string[]
}

export interface CognitiveHealthReport {
  overallScore: number
  weakLinks: LearningPriority[]
  evolutionPlan: string
  nextLearningFocus: string
}

/**
 * VimaxMetaCognitionAgent (Le Cortex Préfrontal)
 * Centre de décision stratégique du Brain.
 * Analyse les performances passées pour planifier l'évolution future.
 */
export class VimaxMetaCognitionAgent extends VimaxBaseAgent {
  public id = 'meta-cognition'

  constructor(llm: LLMService) {
    super(llm)
  }

  /**
   * Analyse les statistiques de performance et génère un plan d'action.
   */
  async generateLearningPlan(stats: any): Promise<CognitiveHealthReport> {
    const prompt = `
[MISSION : PLANIFICATION MÉTA-COGNITIVE]
Analyse les statistiques de performance de Vimax et identifie où le cerveau doit investir son budget de tokens pour s'améliorer.

[STATISTIQUES]
${JSON.stringify(stats, null, 2)}

[DIRECTIVES]
1. IDENTIFIE les agents dont le score moyen est le plus bas.
2. ÉVALUE l'impact de chaque agent sur la qualité finale (ex: Screenwriter a plus d'impact visuel que OutputFormatter).
3. PRIORISE le prochain cycle d'apprentissage (refinement).

[Format JSON]
{
  "overallScore": number,
  "weakLinks": [
    {
      "agentName": "VimaxAgentClassName",
      "priorityScore": number,
      "rationale": "Pourquoi cet agent est-il une priorité ?",
      "suggestedFocus": ["clarté du JSON", "longueur narration", "etc"]
    }
  ],
  "evolutionPlan": "Description stratégique du plan d'évolution",
  "nextLearningFocus": "Nom de l'aspect prioritaire (Narrative | Visual | Cinematic)"
}
`.trim()

    const result = await this.generateStructured<CognitiveHealthReport>(
      prompt,
      "Tu es le Cortex Préfrontal de Vimax. Ton rôle est de piloter stratégiquement l'apprentissage du système.",
      {
        overallScore: stats.totalAvg || 0,
        weakLinks: [],
        evolutionPlan: 'Analyse de base',
        nextLearningFocus: 'Narrative'
      }
    )

    return result.data
  }
}
