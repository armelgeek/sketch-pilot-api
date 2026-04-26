import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { LLMService } from '../core/llm.interface'
import type { NarrativeBlueprint, SeriesContext } from '../types'

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
    this.setPersonality({
      temperature: 0.3,
      rolePersona:
        'Tu es un gardien de la continuité impitoyable et déterministe. Ton rôle est la rigueur absolue. Ne laisse passer aucune incohérence, aucun changement de fait, aucune contradiction logique.'
    })
  }

  /**
   * Audit la cohérence d'un épisode par rapport à l'historique de la saga.
   */
  async auditSagaContinuity(
    currentEpisode: { narration: string; screenplay: any },
    history: string[],
    context: SeriesContext = {}
  ): Promise<SagaAuditReport> {
    const bible = typeof context.seriesBible === 'string' ? context.seriesBible : JSON.stringify(context.seriesBible)
    const historyBlock =
      history.length > 0 ? history.join('\n\n--- ÉPISODE SUIVANT ---\n\n') : 'Aucun historique (Épisode 1)'

    const globalScriptBlock = context.globalScript
      ? `\n[SCRIPT GLOBAL DE LA SAGA]\n${context.globalScript.slice(0, 2000)}${context.globalScript.length > 2000 ? '...' : ''}`
      : ''

    const episodePlanBlock = context.plannedEpisodeContext
      ? `\n[PLAN DE L'ÉPISODE PRÉVU]\n- TITRE : ${context.plannedEpisodeContext.title}\n- HOOK : ${context.plannedEpisodeContext.hook}`
      : ''

    const prompt = `
[MISSION : GARDIEN DE LA CONTINUITÉ DE SAGA]
Tu es le garant de la cohérence narrative et physique d'une série épisodique.
Ton but est de détecter toute "rupture de continuité" entre le nouvel épisode et les épisodes précédents.

[BIBLE DE LA SÉRIE]
${bible || 'Non spécifiée.'}

${globalScriptBlock}

${episodePlanBlock}

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
   * Audit la continuité structurelle d'un plan d'épisodes (Events) par rapport au Blueprint v7.0.
   */
  async auditEventPlan(events: any[], bible?: string, blueprint?: NarrativeBlueprint): Promise<SagaAuditReport> {
    const planBlock = events
      .map(
        (e, idx) =>
          `ÉPISODE ${idx + 1} : ${e.description} (Fonction: ${e.dramaticFunction || 'N/A'}, Acte: ${e.actPosition?.act || 'N/A'})`
      )
      .join('\n')

    const blueprintBlock = blueprint
      ? `\n[ARCHITECTURAL BLUEPRINT V7.0]\n${JSON.stringify(blueprint, null, 2)}`
      : 'Aucun blueprint structurel fourni.'

    const prompt = `
[MISSION : AUDIT DU PLAN DE SAGA - ARCHITECTE SENIOR]
Tu es un superviseur de narration. Analyse la structure de cette saga par rapport à l'intention architecturale initiale.

[BIBLE DE LA SÉRIE]
${bible || 'Non spécifiée.'}

${blueprintBlock}

[PLAN PROPOSÉ (EVENTS EXTRAITS)]
${planBlock}

[CRITÈRES DE VALIDATION V7.0]
1. Conformité Fonctionnelle : Chaque événement extrait remplit-il sa fonction dramatique prévue par le Blueprint (ex: l'événement à 50% remplit-il le rôle de 'midpoint') ?
2. Trajectoire de Tension : La tension target du Blueprint est-elle respectée par les événements ?
3. Arcs de Personnages : Les changements d'état émotionnels décrits dans les événements correspondent-ils aux milestones du Blueprint ?
4. Dettes Narratives : Les promesses (debts) ouvertes dans les événements sont-elles bien listées ?

[FORMAT DE RÉPONSE JSON]
{
  "isConsistent": boolean,
  "violations": ["Description de l'incohérence par rapport au Blueprint"],
  "reasoning": "Analyse globale de l'écart entre architecture et exécution",
  "suggestions": ["Modifications du plan d'événements pour s'aligner sur le Blueprint"]
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
