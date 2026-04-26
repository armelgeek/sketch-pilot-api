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
  public id = 'event-extractor'
  private getSystem(
    mode: 'series' | 'episode',
    targetDuration?: number,
    maxScenes?: number,
    targetEpisodeCount?: number
  ): string {
    const targetCount = targetEpisodeCount ?? maxScenes
    const granularity = mode === 'series' ? 'épisodes' : 'scènes'

    return `
Tu es une IA d'Architecture Narrative (V7.0) spécialisée dans la déconstruction structurelle.
Extraits EXACTEMENT ${targetCount || 'tous les'} événements séquentiels (${granularity}).

[MISSION]
Transforme le texte brut en une série de Beats structurés. Chaque événement doit avoir une fonction dramatique claire et une position calculée dans l'arc.

[FORMAT]
Renvoie UNIQUEMENT du JSON valide :
{
  "events": [
    {
      "index": 0,
      "description": "Nom court de l'événement",
      "dramaticFunction": "opening_image | theme_stated | setup | catalyst | debate | break_into_two | b_story | fun_and_games | midpoint | bad_guys_close_in | all_is_lost | dark_night | break_into_three | finale | final_image",
      "actPosition": { "act": 1 | 2 | 3, "percentageInAct": 50 },
      "characterImpacts": [
        { "identifier": "@PascalCase", "arcBefore": "état", "arcAfter": "état transformé", "emotionalShift": "description" }
      ],
      "worldImpacts": [
        { "locationId": "id", "change": "description du changement permanent", "permanent": true }
      ],
      "narrativeDebts": {
        "creates": ["Mystère ouvert"],
        "resolves": ["Mystère résolu"]
      },
      "tensionTarget": 1-10,
      "paceTarget": "slow | medium | fast | staccato",
      "isDailyLife": boolean,
      "isChoral": boolean,
      "absentProtagonists": ["@Nom"]
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
