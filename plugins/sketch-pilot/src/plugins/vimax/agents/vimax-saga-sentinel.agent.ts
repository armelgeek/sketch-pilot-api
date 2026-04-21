import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { LLMService } from '../core/llm.interface'

export interface SagaAuditReport {
  isConsistent: boolean
  violations: string[]
  reasoning: string
  suggestions: string[]
}

/**
 * VimaxSagaSentinel
 * Agent spécialisé dans la continuité "Long-Terme" d'une saga.
 * Vérifie que le nouvel épisode respecte les faits établis précédemment.
 */
export class VimaxSagaSentinel extends VimaxBaseAgent {
  public id = 'saga-sentinel'
  constructor(llm: LLMService) {
    super(llm)
  }

  /**
   * Audit la cohérence d'un épisode par rapport à l'historique de la saga.
   */
  async auditSagaContinuity(
    currentEpisode: { narration: string; screenplay: any },
    history: string[],
    bible?: string
  ): Promise<SagaAuditReport> {
    const historyBlock =
      history.length > 0 ? history.join('\n\n--- ÉPISODE SUIVANT ---\n\n') : 'Aucun historique (Épisode 1)'

    const prompt = `
[MISSION : GARDIEN DE LA CONTINUITÉ DE SAGA]
Tu es le garant de la cohérence narrative et physique d'une série épisodique.
Ton but est de détecter toute "rupture de continuité" entre le nouvel épisode et les épisodes précédents.

[BIBLE DE LA SÉRIE]
${bible || 'Non spécifiée.'}

[HISTORIQUE DES ÉPISODES PRÉCÉDENTS]
${historyBlock}

[NOUVEL ÉPISODE À AUDITER]
- Narration : ${currentEpisode.narration}
- Scénario : ${JSON.stringify(currentEpisode.screenplay)}

[POINTS DE VIGILANCE]
1. État Physique : Les blessures, objets possédés ou changements physiques des personnages sont-ils respectés ?
2. Logique Temporelle : L'épisode suit-il logiquement le "bridge" ou cliffhanger du précédent ?
3. Caractérisation : Les personnages (@Nom) agissent-ils conformément à leur évolution ?
4. Faits Établis : Des faits passés sont-ils contredits (ex: un personnage mort qui réapparaît sans explication) ?

[FORMAT DE RÉPONSE JSON]
{
  "isConsistent": boolean,
  "violations": ["Description de la rupture"],
  "reasoning": "Explication globale",
  "suggestions": ["Comment corriger pour rétablir la continuité"]
}
`.trim()

    const result = await this.generateStructured<SagaAuditReport>(
      prompt,
      'Tu es un expert en continuité de saga (Script Doctor). Tu es extrêmement rigoureux et ne laisses passer aucune incohérence.',
      { isConsistent: true, violations: [], reasoning: 'Audit impossible (fallback)', suggestions: [] }
    )

    return result.data
  }

  /**
   * Audit la continuité structurelle d'un plan d'épisodes (Events).
   */
  async auditEventPlan(events: any[], bible?: string): Promise<SagaAuditReport> {
    const planBlock = events
      .map((e, idx) => `ÉPISODE ${idx + 1} : ${e.description} (${e.duration}s${e.isClimax ? ', CLIMAX' : ''})`)
      .join('\n')

    const prompt = `
[MISSION : AUDIT DU PLAN DE SAGA]
Tu es un superviseur de narration. Analyse la structure de cette saga avant que l'écriture détaillée ne commence.

[BIBLE DE LA SÉRIE]
${bible || 'Non spécifiée.'}

[PLAN PROPOSÉ (EVENTS)]
${planBlock}

[CRITÈRES DE VALIDATION]
1. Continuité Logique : L'enchaînement des événements est-il possible ? (ex: pas de téléportation impossible)
2. État du Monde : Si un événement change radicalement le monde, les suivants en tiennent-ils compte ?
3. Respect de la Bible : Le ton et les lois de l'univers sont-ils respectés à travers les épisodes ?
4. Rythme : Le climax est-il bien positionné et cohérent avec la montée en tension ?

[FORMAT DE RÉPONSE JSON]
{
  "isConsistent": boolean,
  "violations": ["Description de l'incohérence structurelle"],
  "reasoning": "Analyse globale",
  "suggestions": ["Comment ré-agencer les événements pour corriger"]
}
`.trim()

    const result = await this.generateStructured<SagaAuditReport>(
      prompt,
      "Tu es un expert en structure narrative. Ton rôle est de tuer les incohérences dans l'œuf, avant qu'elles ne soient développées.",
      { isConsistent: true, violations: [], reasoning: 'Fallback', suggestions: [] }
    )

    return result.data
  }

  protected getSystemPrompt(): string {
    return "Tu es le VimaxSagaSentinel. Ta mission est d'assurer la cohérence absolue sur le long terme d'une saga cinématographique."
  }
}
