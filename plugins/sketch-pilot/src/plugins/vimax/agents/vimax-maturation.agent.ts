import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { MaturationCycle } from '../types'

/**
 * VimaxMaturationAgent (V5.5)
 * Gère les cycles de révision et la maturation narrative.
 * Simule le recul nécessaire pour polir une œuvre.
 */
export class VimaxMaturationAgent extends VimaxBaseAgent {
  public id = 'maturation'

  constructor(llm: any) {
    super(llm)
    this.setPersonality({
      temperature: 0.3,
      rolePersona:
        "Tu es un Rédacteur en Chef et Script Doctor exigeant. Ta mission est de trouver les faiblesses d'un premier jet et de proposer des réécritures qui 'font reposer' le texte."
    })
  }

  /**
   * Simule un cycle de maturation (Review & Feedback).
   */
  async reviewForMaturation(
    narration: string,
    context: string,
    cycle?: MaturationCycle
  ): Promise<{ feedback: string; suggestion: string; delta: number }> {
    const prompt = `
[MISSION : CRITIQUE DE MATURATION]
Analyse cette narration comme si elle avait été écrite il y a une semaine. 
Prends du recul. Qu'est-ce qui semble forcé ? Qu'est-ce qui manque de naturel ?

<NARRATION_ACTUELLE>
${narration}
</NARRATION_ACTUELLE>

[CONTEXTE DE LA SCÈNE]
${context}

[OBJECTIFS]
1. Identifie les répétitions ou les lourdeurs que l'auteur (IA) n'a pas vu "à chaud".
2. Propose une direction de réécriture plus subtile.
3. Attribue un Delta d'amélioration potentiel.

[FORMAT JSON]
{
  "feedback": "Critique constructive",
  "suggestion": "Piste de réécriture",
  "delta": 0-100
}
`.trim()

    const result = await this.generateStructured<{ feedback: string; suggestion: string; delta: number }>(
      prompt,
      "Tu es le Script Doctor de Vimax. Ta signature est la subtilité et l'économie de mots.",
      { feedback: 'RAS', suggestion: '', delta: 0 }
    )

    return result.data
  }

  /**
   * Détermine si une scène a atteint son état de maturité optimal.
   */
  shouldMatureAgain(cycle: MaturationCycle): boolean {
    if (cycle.passCount >= 3) return false // Anti-loop
    if (cycle.restingStatus === 'over-processed') return false
    return true
  }
}
