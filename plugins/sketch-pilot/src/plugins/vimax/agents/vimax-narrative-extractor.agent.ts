import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { NarrativeThread } from '../types'

/**
 * VimaxNarrativeExtractor
 * Extrait les fils rouges, la roadmap et les enjeux de continuité.
 */
export class VimaxNarrativeExtractor extends VimaxBaseAgent {
  public id = 'narrative-extractor'

  async extractNarrative(script: string): Promise<{
    unresolvedThreads: NarrativeThread[]
    roadmap: any
    relationshipMap: Record<string, Record<string, string>>
  }> {
    const prompt = `
[MISSION : ANALYSE DE STRUCTURE NARRATIVE]
Analyse le script complet de la saga pour identifier les fils conducteurs, la roadmap et la carte des relations.

[SCRIPT]
${script}

[DIRECTIVES]
- Identifie les "Fils Rouges" (Narrative Threads) qui traversent plusieurs épisodes.
- Précise leur statut (cliffhanger, actif).
- Résume la roadmap globale (l'arc narratif principal).
- Crée une map des relations entre les personnages principaux (@Nom).

[FORMAT]
Renvoie UNIQUEMENT du JSON valide :
{
  "unresolvedThreads": [
    { "id": "thread-1", "title": "...", "status": "active | cliffhanger", "description": "..." }
  ],
  "roadmap": {
    "mainArc": "...",
    "milestones": ["...", "..."]
  },
  "relationshipMap": {
    "@Perso1": { "@Perso2": "Alliés secrets", "@Perso3": "Rivalité mortelle" }
  }
}
`.trim()

    const result = await this.generateStructured<{
      unresolvedThreads: NarrativeThread[]
      roadmap: any
      relationshipMap: Record<string, Record<string, string>>
    }>(prompt, 'Tu es un script-doctor expert en séries à suspense.', {
      unresolvedThreads: [],
      roadmap: {},
      relationshipMap: {}
    })

    return result.data
  }
}
