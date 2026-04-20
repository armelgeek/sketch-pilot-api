import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { VimaxEvent } from '../types'

// ─────────────────────────────────────────────
// VimaxEventExtractor
// Décompose un texte en events séquentiels.
// Utilisé à deux niveaux :
//   1. Niveau série  — découpe une source longue en épisodes
//   2. Niveau épisode — découpe une narration en beats de scènes
// ─────────────────────────────────────────────

export class VimaxEventExtractor extends VimaxBaseAgent {
  private getSystem(
    mode: 'series' | 'episode',
    targetDuration?: number,
    maxScenes?: number,
    targetEpisodeCount?: number
  ): string {
    const targetCount = targetEpisodeCount ?? maxScenes
    let beats = ''

    if (targetCount) {
      beats = `EXACTEMENT ${targetCount} ${mode === 'series' ? 'épisode(s)' : 'beat(s)'}`
    } else if (targetDuration) {
      if (mode === 'series') {
        const estimatedEps = Math.max(1, Math.floor(targetDuration / 45))
        beats = `MAXIMUM ${estimatedEps} épisode(s) (basé sur ~45 secondes par épisode pour ${targetDuration}s)`
      } else {
        const estimatedScenes = Math.max(4, Math.ceil(targetDuration / 6))
        beats = `MAXIMUM ${estimatedScenes} beat(s) (basé sur ~6 secondes par scène pour ${targetDuration}s)`
      }
    } else {
      beats = mode === 'series' ? '1-3 épisodes' : '4-8 beats'
    }

    const extractionScope = targetCount
      ? `Extrais EXACTEMENT ${targetCount} événements séquentiels, en choisissant les plus importants dramatiquement. Ni plus, ni moins.`
      : `Extrais TOUS les événements séquentiels distincts du texte.`

    const granularity =
      mode === 'series'
        ? `arc narratif majeur. Chaque événement = un épisode complet.`
        : `beat de niveau scène. Chaque événement = une scène.`

    const countDirective = targetCount
      ? `6. COMPTE : Tu DOIS extraire EXACTEMENT ${targetCount} événements. C'est une contrainte technique absolue.`
      : `6. COMPTE : Extrais tous les événements narratifs distincts du texte, sans en inventer.`

    return `
      Tu es une IA d'Analyse Littéraire spécialisée dans la déconstruction narrative.
      ${extractionScope}
      Granularité : ${granularity} (${beats})

      [Directives]
      1. Concentre-toi sur les événements critiques pour l'intrigue ou le développement des personnages.
      2. Chaque événement doit être logiquement distinct des précédents.
      3. Unis plusieurs micro-actions liées sous un seul objectif dramatique.
      4. PROCESS CHAIN : 2 à 4 étapes maximum par événement. Chaque étape = une action concrète et distincte.
      5. CONTINUITÉ : Chaque événement doit faire avancer l'histoire.
      ${countDirective}
      7. IDENTIFIANTS : Dans "description" et "processChain", utilise IMPÉRATIVEMENT le format @PascalCase pour tous les personnages (ex: @Banane, @Samuel). AUCUN ESPACE, AUCUNE APOSTROPHE.
      8. DERNIER ÉVÉNEMENT : Le champ "isLast" doit être TRUE uniquement pour le DERNIER événement de la liste. Tous les autres doivent avoir "isLast": false.

      [FORMAT]
      Renvoie UNIQUEMENT du JSON valide :
      {
        "events": [
          {
            "index": 0,
            "description": "chaîne de caractères",
            "processChain": ["étape 1", "étape 2"],
            "isLast": false
          }
        ]
      }
`.trim()
  }

  // ─── Public API ────────────────────────────

  /**
   * Extrait les events d'un texte source.
   * @param text Le texte source (source longue ou narration d'épisode)
   * @param mode 'series' pour découpage épisodique, 'episode' pour découpage en scènes
   * @param targetDuration Optionnel : durée cible pour calibrer le nombre d'événements
   * @param maxScenes Optionnel : nombre maximum de scènes (prioritaire)
   * @param targetEpisodeCount Optionnel : nombre cible d'épisodes (mode series)
   */
  async extractEvents(
    text: string,
    mode: 'series' | 'episode' = 'series',
    targetDuration?: number,
    maxScenes?: number,
    targetEpisodeCount?: number
  ): Promise<VimaxEvent[]> {
    const system = this.getSystem(mode, targetDuration, maxScenes, targetEpisodeCount)

    const prompt = `
<TEXTE>
${text}
</TEXTE>

Extraits les événements demandés selon les directives strictes.
Réponds uniquement avec le JSON demandé.
`.trim()

    const result = await this.generateStructured<{ events: VimaxEvent[] }>(prompt, system, { events: [] })
    const parsed = result.data

    // Validation et post-processing (Problèmes 8 & 9)
    const limit = targetEpisodeCount ?? maxScenes ?? parsed.events.length
    const events = parsed.events.slice(0, limit).map((e, i) => ({
      ...e,
      index: i,
      isLast: false // Reset initial
    }))

    // Garantie de l'isLast sur le vrai dernier
    const lastEvent = events.at(-1)
    if (lastEvent) {
      lastEvent.isLast = true
    }

    return events
  }
}
