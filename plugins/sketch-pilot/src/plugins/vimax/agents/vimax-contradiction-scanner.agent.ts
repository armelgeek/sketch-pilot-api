import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { Lesson } from '../types'

export interface ContradictionReport {
  isConflicting: boolean
  idOfConflictingLesson?: string
  reason?: string
  resolutionHint?: string // ex: "Merger les deux", "Ignorer la nouvelle"
}

/**
 * VimaxContradictionScanner
 * Agent chargé de vérifier qu'une nouvelle leçon n'entre pas en conflit
 * avec les principes déjà établis dans le store.
 */
export class VimaxContradictionScanner extends VimaxBaseAgent {
  public id = 'contradiction-scanner'

  constructor(llm: any) {
    super(llm)
    this.setPersonality({
      temperature: 0.1, // Rigueur maximale
      rolePersona:
        'Tu es un logicien pur. Tu analyses les sémantiques pour détecter les paradoxes et les contradictions entre deux directives créatives.'
    })
  }

  /**
   * Scanne une nouvelle leçon par rapport au store existant.
   */
  async scanForConflicts(newLesson: Lesson, existingLessons: Lesson[]): Promise<ContradictionReport> {
    if (existingLessons.length === 0) return { isConflicting: false }

    const prompt = `
[MISSION : DÉTECTION DE CONTRADICTION SÉMANTIQUE]
Tu dois vérifier si la NOUVELLE LEÇON contredit l'une des LEÇONS EXISTANTES.

NOUVELLE LEÇON :
- Catégorie : ${newLesson.category}
- Directive : ${newLesson.directive}

LEÇONS EXISTANTES (extraits pertinents) :
${existingLessons
  .filter((l) => l.category === newLesson.category)
  .map((l) => `- [ID:${l.id}] : ${l.directive}`)
  .join('\n')}

[CRITÈRES DE CONTRADICTION]
- Deux directives qui demandent des choses opposées (ex: "Faire court" vs "Détailler tout").
- Deux patterns structurels incompatibles.
- Une redondance exacte (la leçon existe déjà sous une autre forme).

[Format JSON]
{
  "isConflicting": true | false,
  "idOfConflictingLesson": "ID ou null",
  "reason": "Explication de la contradiction",
  "resolutionHint": "merge | discard_new | replace_old"
}
`.trim()

    const result = await this.generateStructured<ContradictionReport>(
      prompt,
      "Tu es l'Audit de Cohérence du Vimax Brain. Ton but est de maintenir une base de connaissance saine et sans paradoxes.",
      { isConflicting: false }
    )

    return result.data
  }
}
