import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { SeriesContext } from '../types'

/**
 * VimaxAnimationAgent (Pass 2.2)
 * Extrait des instructions d'animation physiques précises pour les personnages.
 * Se base sur le plan original, la narration finale et le visuel généré.
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
5. [SOUNDSCAPE & SFX] : Design sonore de la scène. SFX synchronisés (pas, métal, vent), ambiance de fond et intention musicale/rythmique.

[LOI DE L'ALIGNEMENT DRAMATIQUE - V51.0]
- Ton ACTING doit être STRICTEMENT ALIGNÉ sur le Niveau de Tension et le Pacing.
- Tension 8-10 : Micro-mouvements saccadés, regards fuyants ou intensité fixe, respiration courte, adrénaline.
- Tension 1-3 : Gestuelle ample, calme, rythme lent, micro-détails contemplatifs.
- Toute contradiction (ex: tension 9 mais acting relaxé) est un ÉCHEC critique.

[EXEMPLE GOLDEN ANIMATION - V16.0]
1. [ACTION] : The @Little Girl strikes the match against the stone wall, creating a bright spark that blooms into a steady flame.
2. [PERFORMANCE] : Her eyes light up with sudden joy and warmth, a smile forming on her lips.
3. [VFX] : As the light grows, the vision of the stove and feast becomes more vivid and colorful, seemingly surrounding her, pulsing with light.
4. [CAMERA] : Camera remains fixed on her face while the background vision shimmering like a mirage.
5. [SOUNDSCAPE] : Soft crackling of the match, followed by a warm ambient hum. A delicate, crystalline piano melody begins to play.

[INFORMATION VISUELLE - SOURCE DE VÉRITÉ V37.0]
- Chaque instruction d'animation doit être DIRECTEMENT DÉRIVÉE du visuel généré.
- Si le visuel montre un gros plan, l'animation doit être micro-expressive.
- Si le visuel montre un 'Moment Décisif' (Flash), l'animation doit articuler l'explosion ou le choc physique de ce flash.

${this.getGlobalScriptBlock(context)}
${this.getEpisodePlanBlock(context)}
${this.getScenePlanBlock(context)}

[FORMAT DE RÉPONSE]
Renvoie UNIQUEMENT du JSON valide :
{
  "animationPrompt": "Le prompt technique ici (5 blocs)",
  "acting": "Le ton émotionnel (ex: Joie soudaine, Espoir vacillant)",
  "soundscape": "Description du sound design (ex: Vent lointain, pulsations électroniques, bruits de pas métalliques)"
}
`.trim()
  }

  /**
   * Génère les instructions d'animation pour une scène.
   */
  async generateAnimation(
    sceneNarration: string,
    eventDescription: string,
    sceneDialogue: any[] = [],
    context: SeriesContext = {},
    visualContext?: { visualBeat?: string; imagePrompt?: string; framing?: string },
    tensionLevel: number = 5,
    pacing: number = 5
  ): Promise<{ animationPrompt: string; acting: string; soundscape: string }> {
    const dialogHint =
      sceneDialogue.length > 0
        ? `\n\n<DIALOGUES_PRÉVUS>\n${JSON.stringify(sceneDialogue, null, 2)}\n</DIALOGUES_PRÉVUS>`
        : ''

    const visHint = visualContext
      ? `\n\n<CONSTELLATION_VISUELLE_CIBLE>\n- BEAT : ${visualContext.visualBeat}\n- PROMPT : ${visualContext.imagePrompt}\n- CADRAGE : ${visualContext.framing}\n</CONSTELLATION_VISUELLE_CIBLE>`
      : ''

    const prompt = `
<PLAN_ORIGINAL_SEGMENT>
${eventDescription}
</PLAN_ORIGINAL_SEGMENT>

<NARRATION_FINALE_SCÈNE>
${sceneNarration}
</NARRATION_FINALE_SCÈNE>${dialogHint}${visHint}

<DIRECTIVES_ALIGNEMENT>
- NIVEAU DE TENSION : ${tensionLevel}/10
- PACING ATTENDU : ${pacing}/10
</DIRECTIVES_ALIGNEMENT>

Génère l'instruction d'animation technique en respectant la STRUCTURE EN 5 BLOCS (ANGLAIS TECHNIQUE).
Assure-toi d'identifier précisément les personnages (@Nom) et de décrire l'évolution temporelle sur 10 secondes.
N'oublie pas le bloc SOUNDSCAPE pour l'immersion sonore.
`.trim()

    const raw = await this.generate(prompt, this.getSystem(context), 'application/json')
    return this.parseJSONSafe<{ animationPrompt: string; acting: string; soundscape: string }>(raw, {
      animationPrompt: '',
      acting: 'neutral',
      soundscape: ''
    })
  }
}
