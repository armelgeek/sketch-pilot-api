import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { SeriesContext, VimaxEvent } from '../types'

// ─────────────────────────────────────────────
// VimaxNarrationAgent (Pass 1)
// Génère la narration brute d'un segment.
// Utilisé à deux niveaux :
//   1. Niveau épisode — narration complète depuis un event de série
//   2. Niveau scène   — narration courte depuis un event de scène
// ─────────────────────────────────────────────

export class VimaxNarrationAgent extends VimaxBaseAgent {
  private getSystem(
    context: SeriesContext,
    mode: 'episode' | 'scene',
    targetDuration?: number,
    maxScenes?: number
  ): string {
    let wordCount = mode === 'episode' ? '120-150 mots' : '30-45 mots'

    if (targetDuration) {
      if (mode === 'episode') {
        const target = Math.floor((targetDuration / 60) * 130)
        wordCount = `${target - 20}-${target + 20} mots`
      } else if (maxScenes) {
        // Répartition par scène
        const targetPerScene = Math.floor((targetDuration / maxScenes) * 2.2) // ~2.2 mots par seconde
        wordCount = `${targetPerScene - 5}-${targetPerScene + 5} mots`
      }
    }

    const lengthGuide = `OBJECTIF : ${wordCount} pour ce segment.`

    return `
[RÔLE]
Tu es un scénariste d'épisodes de classe mondiale, spécialisé dans les sagas cinématographiques à haute tension.
Génère une NARRATION BRUTE pour l'événement fourni.

[RÉCAPITULATIF DES ÉPISODES PRÉCÉDENTS]
${context.previousEpisodes?.join('\n\n') || 'Aucun épisode précédent.'}

${this.getBibleContext(context)}

[DIRECTIVES]
[DIRECTIVES NARRATION]
1. CONCISION : Max 2-3 phrases par segment.
2. PAS DE RÉPÉTITION : Chaque scène doit faire progresser l'action. Ne répète PAS une action déjà accomplie (ex: si on monte dans le véhicule à la scène 1, on ne peut pas y monter à la scène 2).
3. RÔLES DE SCÈNE : Attribue un rôle unique à chaque scène (ex: Arrivée, Hésitation, Menace visuelle, Action, Départ).
4. CONTINUITÉ SPATIALE : Respecte la position des personnages et des objets d'une scène à l'autre.
5. CAUSALITÉ VISUELLE : Montre la source du danger plutôt que de simplement la mentionner (ex: "Une poutre s'effondre" au lieu de "Un bruit sourd").
6. DIALOGUE : Autorisé uniquement sous forme de courtes citations directes intégrées à l'action.
8. IMPACT CLIMAX (SCÈNE 5) : La narration du climax DOIT impérativement décrire un IMPACT PHYSIQUE BRUTAL et ses effets sur les personnages : visages surexposés par un flash blanc, vêtements et corps projetés par le souffle, débris cinglants. INTERDICTION de finir sur du calme.
9. DIALOGUE CINÉ : Favorise les répliques courtes et viscérales ("Regardez-moi !", "On tient !", "Pas maintenant !") au lieu de longs discours héroïques.
9. ${lengthGuide}

[STYLE] - Phrases percutantes et courtes. - Détails atmosphériques riches. - Profondeur psychologique par le langage corporel. - FORMAT : Renvoie UNIQUEMENT du JSON valide : { "narration": "la narration avec [Cues] ici" }`.trim()
  }

  // ─── Public API ────────────────────────────

  /**
   * Génère la narration complète d'un épisode depuis un event de série.
   */
  async generateEpisodeNarration(
    event: VimaxEvent,
    context: SeriesContext = {},
    targetDuration?: number,
    maxScenes?: number
  ): Promise<string> {
    return this._generate(event, context, 'episode', targetDuration, maxScenes)
  }

  /**
   * Génère la narration courte d'une scène depuis un event de scène.
   */
  async generateSceneNarration(
    event: VimaxEvent,
    context: SeriesContext = {},
    targetDuration?: number,
    maxScenes?: number,
    forceClimax = false
  ): Promise<string> {
    return this._generate(event, context, 'scene', targetDuration, maxScenes, forceClimax)
  }

  // ─── Private ───────────────────────────────

  private async _generate(
    event: VimaxEvent,
    context: SeriesContext,
    mode: 'episode' | 'scene',
    targetDuration?: number,
    maxScenes?: number,
    forceClimax = false
  ): Promise<string> {
    const viralPrompt =
      context.intent === 'viral'
        ? `\n[STYLISATION VIRALE]\nL'intention est VIRALE (TikTok/Social). HOOK accrocheur, émotion exacerbée, et traite les objets parlants (ex: @Banane) avec un sérieux dramatique.`
        : ''

    const climaxWarning =
      forceClimax || (mode === 'scene' && event.isLast)
        ? `\n[ALERTE CLIMAX : IMPACT PHYSIQUE VISCÉRAL REQUIS]\nC'est la scène finale de l'épisode. La narration DOIT se conclure par un événement physique violent. 
DÉTAILS REQUIS : 
- Lumière blanche/rouge aveuglante (visages surexposés).
- Souffle de l'explosion (vêtements et corps secoués).
- Réaction physique immédiate (se protéger, tomber, être projeté).
INTERDICTION de finir sur du calme.\n`
        : ''

    const prompt = `
${viralPrompt}${climaxWarning}
<CONTEXTE_SÉRIE>
${event.description}
</ÉVÉNEMENT>

<CHAÎNE_DE_PROCESSUS>
${event.processChain.map((s, i) => `${i + 1}. ${s}`).join('\n')}
</CHAÎNE_DE_PROCESSUS>

Génère une narration percutante et cinématographique pour cet événement.
`.trim()

    const system = this.getSystem(context, mode, targetDuration, maxScenes)

    if (process.env.DEBUG_LLM) {
      console.log(`\n[NARRATION_SYSTEM]\n${system}\n`)
      console.log(`\n[NARRATION_PROMPT]\n${prompt}\n`)
    }

    const raw = await this.generate(prompt, system, 'application/json')
    return this.parseJSONSafe<{ narration: string }>(raw, { narration: event.description }).narration
  }

  private getBibleContext(context: SeriesContext): string {
    if (!context.seriesBible) return ''
    const b = context.seriesBible
    return `
[BIBLE DE LA SÉRIE - SPEC]
- GENRE : ${b.genre}
- TON : ${b.tone}
- STYLE VISUEL : ${b.visualStyle} (Applique ce style à tous les éléments visuels décrits)
- LOIS DE L'UNIVERS : ${b.universeLaws?.join(', ') || 'Standard'} (Respecte ces règles narratives et physiques)
`.trim()
  }
}
