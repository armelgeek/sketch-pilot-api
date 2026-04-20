import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { InputAnalysis } from '../types'

/**
 * VimaxInputSanitizerAgent
 * Valide et enrichit l'idée brute avant d'entrer dans le pipeline.
 * Évite le "Garbage In -> Garbage Out".
 */
export class VimaxInputSanitizerAgent extends VimaxBaseAgent {
  private getSystem(): string {
    return `
        Tu es un Expert Script Consultant (Input Sanitizer).
        Ta mission est d'analyser l'idée brute d'un utilisateur et de déterminer si elle est viable pour une série d'animation.

        [CRITÈRES DE VIABILITÉ]
        1. CLARTÉ : L'idée doit avoir un sujet identifiable.
        2. POTENTIEL NARRATIF : Il doit y avoir un embryon de conflit ou d'action.
        3. PRÉCISION : Si des personnages ou des lieux sont mentionnés, ils doivent être cohérents.

        [ENRICHISSEMENT]
        Si l'idée est viable mais "maigre", tu dois l'enrichir (ajouter du contexte, des détails sensoriels, des enjeux) pour donner plus de matière aux agents suivants.

        [FORMAT DE RÉPONSE]
        Renvoie UNIQUEMENT du JSON valide :
        {
        "isViable": boolean,
        "issues": ["liste des problèmes si non viable ou faible..."],
        "suggestions": ["conseils pour l'utilisateur..."],
        "enrichedIdea": "version reformulée et enrichie de l'idée"
        }
`.trim()
  }

  async analyze(idea: string): Promise<InputAnalysis> {
    const prompt = `
Analyse cette idée de série/épisode :
"${idea}"

Détermine sa viabilité et propose une version enrichie si possible.
`.trim()

    const result = await this.generateStructured<InputAnalysis>(prompt, this.getSystem(), {
      isViable: false,
      issues: ['Analyse non effectuée'],
      suggestions: [],
      enrichedIdea: idea
    })

    return result.data
  }
}
