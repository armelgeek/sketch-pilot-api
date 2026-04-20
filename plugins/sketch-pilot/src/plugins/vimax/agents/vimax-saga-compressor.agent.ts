import { VimaxBaseAgent } from '../core/vimax-base.agent'

// ─────────────────────────────────────────────
// VimaxSagaCompressor
// Compresse le contexte narratif accumulé (épisodes précédents)
// pour éviter de saturer la fenêtre de contexte du LLM.
// Utilisé automatiquement par VimaxAgent dès que
// previousEpisodes.length dépasse le seuil configuré.
// ─────────────────────────────────────────────

export class VimaxSagaCompressor extends VimaxBaseAgent {
  private getCompressionSystem(guardrails: string[] = []): string {
    const guardrailDirective =
      guardrails.length > 0
        ? `\n[GARDE-FOU NARRATIF]\nTu DOIS impérativement préserver les entités et concepts suivants dans ta compression : ${guardrails.join(', ')}. Ne les élimine PAS, ils sont critiques pour la suite.`
        : ''

    return `
Tu es un assistant expert en compression de texte spécialisé dans le contenu littéraire.
Condense l'extrait d'histoire fourni tout en préservant tous les éléments narratifs.${guardrailDirective}

[Directives]
1. Fidélité : Préserve tous les points d'intrigue majeurs, les rebondissements et les séquences d'événements clés.
2. Personnages : Maintiens les actions des personnages et les beats de dialogue importants.
3. Descriptions : Réduis les longues descriptions à leurs éléments les plus essentiels.
4. Langage : Direct et concis. Élimine toutes les redondances.
5. Format : Produis un paragraphe fluide — sans marqueurs, ni sauts de section.
`.trim()
  }

  private getAggregationSystem(guardrails: string[] = []): string {
    const guardrailDirective =
      guardrails.length > 0
        ? `\n[GARDE-FOU NARRATIF]\nTu DOIS préserver ces éléments clés lors de la fusion : ${guardrails.join(', ')}.`
        : ''

    return `
Tu es un assistant professionnel de traitement de texte spécialisé dans la fusion de fragments de texte séquentiels.
Fusionne les morceaux séquentiels fournis en un récit cohérent.${guardrailDirective}
Supprime les chevauchements et les répétitions redondantes entre les morceaux.
Assure des transitions fluides entre les sections fusionnées.
Produis un seul paragraphe fluide.
`.trim()
  }

  // ─── Public API ────────────────────────────

  /**
   * Compresse un texte long en préservant les éléments narratifs clés.
   */
  async compress(text: string, guardrails: string[] = []): Promise<string> {
    const prompt = `
<TEXTE>
${text}
</TEXTE>

Compresse ce texte en suivant les directives.
`.trim()

    const raw = await this.generate(prompt, this.getCompressionSystem(guardrails))
    return raw.trim()
  }

  /**
   * Fusionne plusieurs fragments narratifs séquentiels en un seul texte fluide.
   * Typiquement utilisé pour agréger les résumés des épisodes précédents.
   */
  async aggregate(chunks: string[], guardrails: string[] = []): Promise<string> {
    const chunksStr = chunks.map((c, i) => `<CHUNK_${i}>\n${c}\n</CHUNK_${i}>`).join('\n\n')

    const raw = await this.generate(chunksStr, this.getAggregationSystem(guardrails))
    return raw.trim()
  }

  /**
   * Compresse le contexte série (previousEpisodes) si trop volumineux.
   * @param summaries Résumés des épisodes précédents
   * @param threshold Nombre max d'épisodes avant compression (défaut: 3)
   * @param guardrails Liste des entités critiques à préserver
   */
  async compressSeriesHistory(summaries: string[], threshold = 3, guardrails: string[] = []): Promise<string> {
    if (summaries.length <= threshold) {
      return summaries.join('\n\n')
    }
    return this.aggregate(summaries, guardrails)
  }

  /**
   * Extrait le pont narratif entre deux épisodes.
   */
  async extractEpisodeBridge(lastEpisodeNarration: string): Promise<any> {
    const system = `
Tu es un analyste narratif expert. Analyse cet épisode et extrais le pont de continuité (EpisodeBridge) en JSON :
{
  "unresolvedCliffhanger": "Question ou tension non résolue",
  "missingCharacters": ["@Nom"],
  "activeObjects": ["Objet important"],
  "worldState": { "Clé": "Valeur d'état physique" }
}
Renvoie UNIQUEMENT du JSON valide.
`.trim()

    const raw = await this.generate(`<ÉPISODE>\n${lastEpisodeNarration}\n</ÉPISODE>`, system, 'application/json')
    return this.parseJSONSafe(raw, {
      unresolvedCliffhanger: '',
      missingCharacters: [],
      activeObjects: [],
      worldState: {}
    })
  }
}
