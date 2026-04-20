import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { VimaxEvent } from '../types'

// ─────────────────────────────────────────────
// VimaxEventExtractor
// Décompose un texte en events séquentiels.
// Utilisé à deux niveaux :
//   1. Niveau série  — découpe une source longue en épisodes
//   2. Niveau épisode — découpe une narration en beats de scènes
// ─────────────────────────────────────────────

const MAX_EVENTS = 20

export class VimaxEventExtractor extends VimaxBaseAgent {
  private getSystem(
    mode: 'series' | 'episode',
    targetDuration?: number,
    maxScenes?: number,
    targetEpisodeCount?: number
  ): string {
    let beats = mode === 'series' ? '1-3 épisodes' : '4-8 beats par épisode'

    if (mode === 'series' && targetEpisodeCount) {
      beats = `EXACTEMENT ${targetEpisodeCount} épisode(s) pour couvrir l'arc complet de l'histoire`
    } else if (maxScenes) {
      if (mode === 'series') {
        const estimatedEps = maxScenes <= 5 ? 1 : Math.max(1, Math.floor(maxScenes / 3))
        beats = `MAXIMUM EXACTEMENT ${estimatedEps} épisode(s) pour rester sous la barre des ${maxScenes} scènes au total`
      } else {
        beats = `MAXIMUM EXACTEMENT ${maxScenes} beats pour cet épisode`
      }
    } else if (targetDuration) {
      if (mode === 'series') {
        const estimatedEps = Math.max(1, Math.floor(targetDuration / 45)) // 1 ep par 45s
        beats = `MAXIMUM ${estimatedEps} épisode(s) pour une durée totale de ${targetDuration}s`
      } else {
        const estimatedScenes = Math.max(4, Math.ceil(targetDuration / 6)) // ~6s par scène
        beats = `MAXIMUM ${estimatedScenes} beats pour une durée de ${targetDuration}s`
      }
    }

    const granularity =
      mode === 'series'
        ? `arc narratif majeur (${beats}). Chaque événement = un épisode complet.`
        : `beat de niveau scène (${beats}). Chaque événement = une scène.`

    return `
Tu es une IA d'Analyse Littéraire spécialisée dans la déconstruction narrative.
Extraits le PROCHAIN événement séquentiel du texte fourni, en te basant sur les événements précédemment extraits.
Granularité : ${granularity}

[Directives]
1. Concentre-toi sur les événements critiques pour l'intrigue ou le développement des personnages.
2. Chaque événement doit être logiquement distinct des précédents.
3. Unis plusieurs micro-actions liées sous un seul objectif dramatique.
4. Fournis une processChain étape par étape de la façon dont l'événement se déroule.
5. CONTINUITÉ : Chaque événement doit faire avancer l'histoire de quelques secondes.
6. COMPTE DE SCÈNES : Tu DOIS extraire EXACTEMENT ${targetEpisodeCount || (maxScenes ? maxScenes : 'le nombre demandé')} événements. Ne mets "isLast: true" que lorsque tu as atteint ce nombre OU s'il est physiquement impossible de continuer sans répétition majeure.

Renvoie UNIQUEMENT du JSON valide :
{
  "index": 0,
  "description": "chaîne de caractères",
  "processChain": ["étape 1", "étape 2"],
  "isLast": false
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
    const events: VimaxEvent[] = []
    let isLast = false
    const system = this.getSystem(mode, targetDuration, maxScenes, targetEpisodeCount)

    // Ajustement de MAX_EVENTS si des contraintes sont fournies
    let limit = MAX_EVENTS
    if (maxScenes) {
      if (mode === 'episode') {
        limit = maxScenes
      } else if (mode === 'series') {
        limit = maxScenes <= 5 ? 1 : Math.max(1, Math.floor(maxScenes / 3))
      }
    } else if (targetDuration) {
      if (mode === 'episode') {
        limit = Math.max(5, Math.ceil(targetDuration / 5)) // Max 1 scène toutes les 5s
      } else if (mode === 'series') {
        limit = Math.max(1, Math.floor(targetDuration / 30)) // Max 1 épisode toutes les 30s
      }
    }

    if (mode === 'series' && targetEpisodeCount) {
      limit = targetEpisodeCount
    }

    while (!isLast && events.length < limit) {
      const extractedSummary = events.map((e) => `Event ${e.index}: ${e.description}`).join('\n')

      const prompt = `
<TEXTE>
${text}
</TEXTE>

<ÉVÉNEMENTS_EXTRAITS>
${extractedSummary || 'Aucun pour le moment.'}
</ÉVÉNEMENTS_EXTRAITS>

Extraits le prochain événement.
`.trim()

      const raw = await this.generate(prompt, system, 'application/json')

      const event = this.parseJSONSafe<VimaxEvent | null>(raw, null)
      if (!event) break

      events.push(event)
      isLast = event.isLast
    }

    return events
  }
}
