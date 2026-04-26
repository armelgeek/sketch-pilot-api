import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { LLMService } from '../core/llm.interface'
import type { LearningEpisode } from '../types'

export interface AnomalyReport {
  isCompromised: boolean
  severity: 'low' | 'medium' | 'high'
  rationale: string
  suggestedAction: 'none' | 'regenerate' | 'hard_reset' | 'human_intervention'
  affectedAgents: string[]
}

/**
 * VimaxAnomalyDetector (L'Amygdale)
 * Sentinelle de survie du Brain. Détecte les patterns de corruption structurelle
 * et les boucles d'échec répétitives.
 */
export class VimaxAnomalyDetector extends VimaxBaseAgent {
  public id = 'anomaly-detector'

  constructor(llm: LLMService) {
    super(llm)
  }

  /**
   * Analyse un lot d'épisodes récents pour détecter des anomalies systémiques.
   */
  async detectAnomalies(episodes: LearningEpisode[]): Promise<AnomalyReport> {
    if (episodes.length === 0) {
      return {
        isCompromised: false,
        severity: 'low',
        rationale: 'Aucun épisode à analyser',
        suggestedAction: 'none',
        affectedAgents: []
      }
    }

    // 1. Détection Statique (Heuristiques)
    const fallbacks = episodes.filter((e) => e.status === 'failure' || (e.response && e.response.includes('FALLBACK')))
    const affectedAgents = [...new Set(fallbacks.map((f) => f.agentName))]

    // Seuil d'alerte : Si un agent a échoué 3 fois de suite (ou sur les 5 derniers coups)
    for (const agent of affectedAgents) {
      const agentFailures = fallbacks.filter((f) => f.agentName === agent)
      if (agentFailures.length >= 3) {
        return {
          isCompromised: true,
          severity: 'high',
          rationale: `L'agent [${agent}] est en boucle d'échec critique (${agentFailures.length} fallbacks récents).`,
          suggestedAction: 'human_intervention',
          affectedAgents: [agent]
        }
      }
    }

    // 2. Détection par LLM (Hallucinations & Cohérence Structurelle)
    const prompt = `
[MISSION : DÉTECTION D'ANOMALIES (AMYGDALE)]
Analyse les ${episodes.length} derniers épisodes d'exécution.
Recherche des signes de "dégradation cognitive" :
1. HALLUCINATIONS : L'agent invente des personnages qui ne sont pas dans le plan.
2. STAGNON : L'agent répète mot pour mot la même chose sur plusieurs épisodes.
3. RUPTURE : Le JSON est valide mais le contenu est absurde ou vide.

[ÉPISODES RÉCENTS]
${episodes.map((e) => `[${e.agentName}] -> ${e.response.slice(0, 200)}...`).join('\n---\n')}

[Format JSON]
{
  "isCompromised": boolean,
  "severity": "low" | "medium" | "high",
  "rationale": "Description viscérale du problème",
  "suggestedAction": "regenerate" | "human_intervention" | "none",
  "affectedAgents": ["NomDeLAgent"]
}
`.trim()

    const result = await this.generateStructured<AnomalyReport>(
      prompt,
      "Tu es le système de survie de Vimax. Ton rôle est de détecter les défaillances avant qu'elles ne corrompent la saga.",
      {
        isCompromised: false,
        severity: 'low',
        rationale: 'Analyse standard',
        suggestedAction: 'none',
        affectedAgents: []
      }
    )

    return result.data
  }
}
