import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { LLMService } from '../core/llm.interface'
import type { NarrativeAuditReport } from '../types'

/**
 * VimaxUniversalCriticAgent
 * Agent multitâche capable d'auditer chaque étape du pipeline Vimax.
 */
export class VimaxUniversalCriticAgent extends VimaxBaseAgent {
  constructor(llm: LLMService) {
    super(llm)
  }

  // ─── System Prompts par Type ───────────────────

  private getSagaSystemPrompt(): string {
    return `
[RÔLE : Story Doctor & Expert en Narration Cinématographique]
Analyse le plan global d'une série (Saga Plan).
Focus : Cohérence narrative, profondeur des personnages, rythme thématique, clichés.
`.trim()
  }

  private getEpisodeSystemPrompt(): string {
    return `
[RÔLE : Script Doctor & Directeur Narratif]
Analyse le script complet d'un épisode.
Focus : Qualité des dialogues, fluidité des scènes, arc émotionnel de l'épisode, tension dramatique.
`.trim()
  }

  private getVisualSystemPrompt(): string {
    return `
[RÔLE : Directeur de la Photographie & Superviseur VFX]
Analyse un prompt visuel (image ou animation).
Focus : Qualité cinématique, réalisme de la lumière, composition, adhérence au style verrouillé.
`.trim()
  }

  private getNarrationSystemPrompt(): string {
    return `
[RÔLE : Auteur & Consultant Littéraire]
Analyse la narration textuelle d'une scène.
Focus : Richesse sensorielle, imagerie, rythme des phrases, évitement de la redondance.
`.trim()
  }

  private getBaseGuidelines(): string {
    return `
[DIRECTIVES GÉNÉRALES]
- Sois exigeant et constructif.
- Pour chaque problème, propose une "Idée concrète" ou un "Exemple fort".
- Utilise @PascalCase pour les personnages.

[FORMAT DE RÉPONSE]
Renvoie UNIQUEMENT du JSON valide :
{
  "globallyCoherent": boolean,
  "score": number, // sur 100
  "feedbacks": [
    {
      "issue": "Titre du problème",
      "rationale": "Pourquoi c'est un problème / cliché",
      "correction": "Conseil général",
      "example": "Action concrète à ajouter/modifier",
      "priority": "low" | "medium" | "high"
    }
  ],
  "themesAnalyzed": ["Theme 1", ...],
  "characterArcsAnalysis": "Analyse rapide des évolutions"
}
`.trim()
  }

  // ─── Public API ────────────────────────────

  /**
   * Audit d'un plan de saga.
   */
  async auditSagaPlan(plan: any): Promise<NarrativeAuditReport> {
    const rawPlan = plan.plan || plan
    const episodes = rawPlan.episodes || plan.episodeEvents || []

    const prompt = `
[MISSION : CRITIQUE NARRATIVE DE LA SAGA]
<IDÉE_DE_BASE>${plan.basicIdea || rawPlan.basicIdea || 'Non fournie'}</IDÉE_DE_BASE>
<SCRIPT>${rawPlan.script || 'Non spécifié'}</SCRIPT>
<ÉPISODES>${episodes.map((ep: any) => `[EP ${ep.episodeNumber || ep.index + 1}] ${ep.eventDescription || ep.description}`).join('\n')}</ÉPISODES>
`.trim()

    return this.runAudit(prompt, this.getSagaSystemPrompt())
  }

  /**
   * Audit d'un épisode complet.
   */
  async auditEpisode(episode: any): Promise<NarrativeAuditReport> {
    const prompt = `
[MISSION : CRITIQUE D'ÉPISODE]
<SUMMARY>${episode.summary}</SUMMARY>
<NARRATION>${episode.narration}</NARRATION>
<SCENES>${episode.scenes.map((s: any) => `[SCÈNE ${s.sceneNumber}] ${s.narration}`).join('\n\n')}</SCENES>
`.trim()

    return this.runAudit(prompt, this.getEpisodeSystemPrompt())
  }

  /**
   * Audit d'un prompt visuel.
   */
  async auditVisual(
    type: 'image' | 'animation',
    promptContent: string,
    context?: string
  ): Promise<NarrativeAuditReport> {
    const prompt = `
[MISSION : CRITIQUE VISUELLE (${type.toUpperCase()})]
<PROMPT>${promptContent}</PROMPT>
${context ? `<CONTEXTE>${context}</CONTEXTE>` : ''}
`.trim()

    return this.runAudit(prompt, this.getVisualSystemPrompt())
  }

  /**
   * Audit de la narration d'une scène.
   */
  async auditScene(narration: string, eventIndex: number): Promise<NarrativeAuditReport> {
    const prompt = `
[MISSION : CRITIQUE DE NARRATION DE SCÈNE]
<INDEX>${eventIndex}</INDEX>
<NARRATION>${narration}</NARRATION>
`.trim()

    return this.runAudit(prompt, this.getNarrationSystemPrompt())
  }

  // ─── Orchestration ─────────────────────────

  private async runAudit(userPrompt: string, systemPrompt: string): Promise<NarrativeAuditReport> {
    const result = await this.generateStructured<NarrativeAuditReport>(
      `${userPrompt}\nRéponds uniquement en JSON.`,
      `${systemPrompt}\n${this.getBaseGuidelines()}`,
      {
        seriesId: this.getSeriesId() || 'pending',
        globallyCoherent: true,
        score: 70,
        feedbacks: [],
        themesAnalyzed: [],
        characterArcsAnalysis: 'N/A'
      }
    )

    return {
      ...result.data,
      seriesId: this.getSeriesId() || 'pending'
    }
  }
}
