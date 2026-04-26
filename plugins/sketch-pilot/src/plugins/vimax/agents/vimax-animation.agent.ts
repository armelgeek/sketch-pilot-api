import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { SeriesContext } from '../types'

/**
 * VimaxAnimationAgent (Pass 2.2)
 * Extrait des instructions d'animation physiques précises pour les personnages.
 * Se base sur le plan original (intentions) et la narration finale.
 */
export class VimaxAnimationAgent extends VimaxBaseAgent {
  public id = 'animation'

  private getSystem(context: SeriesContext): string {
    return `
[RÔLE]
Tu es un Directeur de l'Animation pour des vidéos en "whiteboard style".
Ta mission est d'extraire ou de déduire des instructions d'ANIMATION physiques précises pour les personnages.

${this.getGlobalScriptBlock(context)}

${this.getEpisodePlanBlock(context)}

[FORMAT DE RÉPONSE]
Renvoie UNIQUEMENT du JSON valide :
{
  "animationPrompt": "L'instruction d'animation ici",
  "acting": "Le ton émotionnel de la scène (ex: Enthousiaste, Inquiet, Furieux)"
}
`.trim()
  }

  private getGlobalScriptBlock(context: SeriesContext): string {
    if (!context.globalScript) return ''
    const truncated = context.globalScript.slice(0, 1500)
    return `
[SCRIPT GLOBAL DE LA SAGA — RÉFÉRENCE ANIMATION]
${truncated}${context.globalScript.length > 1500 ? '\n[...]' : ''}
`.trim()
  }

  private getEpisodePlanBlock(context: SeriesContext): string {
    const plan = context.plannedEpisodeContext
    if (!plan) return ''
    return `
[PLAN DE L'ÉPISODE PRÉVU]
- TITRE : ${plan.title || 'Inconnu'}
- HOOK : ${plan.hook || 'Inconnu'}
`.trim()
  }

  /**
   * Génère les instructions d'animation pour une scène.
   */
  async generateAnimation(
    sceneNarration: string,
    eventDescription: string,
    sceneDialogue: any[] = [],
    context: SeriesContext = {}
  ): Promise<{ animationPrompt: string; acting: string }> {
    const dialogHint =
      sceneDialogue.length > 0
        ? `\n\n<DIALOGUES_PRÉVUS>\n${JSON.stringify(sceneDialogue, null, 2)}\n</DIALOGUES_PRÉVUS>`
        : ''

    const prompt = `
<PLAN_ORIGINAL_SEGMENT>
${eventDescription}
</PLAN_ORIGINAL_SEGMENT>

<NARRATION_FINALE_SCÈNE>
${sceneNarration}
</NARRATION_FINALE_SCÈNE>${dialogHint}

Génère l'instruction d'animation et l'émotion pour cette scène. Assure-toi d'identifier qui parle dans l'animationPrompt.
`.trim()

    const raw = await this.generate(prompt, this.getSystem(context), 'application/json')
    return this.parseJSONSafe<{ animationPrompt: string; acting: string }>(raw, {
      animationPrompt: '',
      acting: 'neutral'
    })
  }
}
