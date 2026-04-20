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
    const granularity = mode === 'series' ? 'épisodes' : 'scènes'

    return `
Tu es une IA d'Analyse Littéraire spécialisée dans la déconstruction narrative.
Extraits EXACTEMENT ${targetCount || 'tous les'} événements séquentiels (${granularity}).

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
   * @param correctionHint Optionnel : instructions pour corriger une incohérence structurelle
   */
  async extractEvents(
    text: string,
    mode: 'series' | 'episode' = 'series',
    targetDuration?: number,
    maxScenes?: number,
    targetEpisodeCount?: number,
    correctionHint?: string
  ): Promise<VimaxEvent[]> {
    const system = this.getSystem(mode, targetDuration, maxScenes, targetEpisodeCount)
    const correctionBlock = correctionHint ? `\n\n[INSTRUCTION DE CORRECTION DE STRUCTURE]\n${correctionHint}` : ''

    const prompt = `
<TEXTE>
${text}
</TEXTE>

Extraits les événements demandés selon les directives strictes.${correctionBlock}
Réponds uniquement avec le JSON demandé.
`.trim()

    const result = await this.generateStructured<{ events: VimaxEvent[] }>(prompt, system, { events: [] })
    const parsed = result.data

    // Validation et post-processing (Problèmes 8 & 9)
    const limit = targetEpisodeCount ?? maxScenes ?? parsed.events.length
    const events = parsed.events.slice(0, limit).map((e: any, i: number) => ({
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
