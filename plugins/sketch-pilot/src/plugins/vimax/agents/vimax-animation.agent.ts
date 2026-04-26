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
Tu es un Directeur de l'Animation et Spécialiste VFX.
Ta mission est de générer des instructions d'ANIMATION physiques et temporelles précises pour les personnages et l'environnement.

[STRUCTURE OBLIGATOIRE EN 4 BLOCS - V16.0]
1. [SÉQUENCE D'ACTION] : Détaille le mouvement étape par étape (ex: frappe l'allumette -> étincelle -> flamme).
2. [PERFORMANCE PERSONNAGE] : Micro-expressions, gestuelle, changements d'état émotionnel physique.
3. [ÉVOLUTION VFX & LUMIÈRE] : Comment les effets et l'éclairage évoluent au cours des 10 secondes (ex: la lumière grandit, le fond pulse).
4. [DYNAMIQUE CAMÉRA] : Mouvements de caméra subtils (zoom lent, panoramique, fixité).

[EXEMPLE GOLDEN ANIMATION - V16.0]
1. [ACTION] : The @Little Girl strikes the match against the stone wall, creating a bright spark that blooms into a steady flame.
2. [PERFORMANCE] : Her eyes light up with sudden joy and warmth, a smile forming on her lips.
3. [VFX] : As the light grows, the vision of the stove and feast becomes more vivid and colorful, seemingly surrounding her, pulsing with light.
4. [CAMERA] : Camera remains fixed on her face while the background vision shimmering like a mirage.

${this.getGlobalScriptBlock(context)}

${this.getEpisodePlanBlock(context)}

[FORMAT DE RÉPONSE]
Renvoie UNIQUEMENT du JSON valide :
{
  "animationPrompt": "Le prompt technique ici (4 blocs)",
  "acting": "Le ton émotionnel (ex: Joie soudaine, Espoir vacillant)"
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

Génère l'instruction d'animation technique en respectant la STRUCTURE EN 4 BLOCS (ANGLAIS TECHNIQUE).
Assure-toi d'identifier précisément les personnages (@Nom) et de décrire l'évolution temporelle sur 10 secondes.
`.trim()

    const raw = await this.generate(prompt, this.getSystem(context), 'application/json')
    return this.parseJSONSafe<{ animationPrompt: string; acting: string }>(raw, {
      animationPrompt: '',
      acting: 'neutral'
    })
  }
}
