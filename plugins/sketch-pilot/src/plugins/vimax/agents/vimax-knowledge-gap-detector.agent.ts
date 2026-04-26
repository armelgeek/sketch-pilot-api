import { LessonStore } from '../core/lesson-store'
import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { SagaIntent } from '../types'

export interface KnowledgeGap {
  area: string
  severity: 'low' | 'medium' | 'high'
  description: string
  recommendation: string
}

export interface GapReport {
  isCovered: boolean
  gaps: KnowledgeGap[]
  suggestedLearningSources: string[]
}

/**
 * VimaxKnowledgeGapDetector
 * L'agent de "L'Honnêteté Intellectuelle".
 * Détecte les zones d'ignorance du Brain avant de générer.
 */
export class VimaxKnowledgeGapDetector extends VimaxBaseAgent {
  public id = 'gap-detector'

  async detectGaps(intent: SagaIntent): Promise<GapReport> {
    const store = LessonStore.getInstance()
    await store.load()

    const genre = intent.genre || 'any'
    const lessons = store.getLessonsFor('Global', [], 'all', undefined, {
      genres: [genre]
    })

    const genreSpecificLessons = lessons.filter((l) => l.genreScope?.includes(genre))

    if (genreSpecificLessons.length >= 5) {
      return { isCovered: true, gaps: [], suggestedLearningSources: [] }
    }

    // Le Brain est aveugle sur ce genre. On appelle le LLM pour décrire les lacunes.
    const prompt = `
[MISSION : DÉTECTION DE LACUNES COGNITIVES]
Analyse les directives actuelles du cerveau Vimax pour le genre "${genre}".
Nous n'avons que ${genreSpecificLessons.length} leçons spécifiques pour ce genre.

[INTENT DE LA SÉRIE]
${JSON.stringify(intent, null, 2)}

[DIRECTIVES ACTUELLES]
${genreSpecificLessons
  .slice(0, 10)
  .map((l) => `- ${l.directive}`)
  .join('\n')}

[OBJECTIF]
Identifie ce que Vimax ne sait pas encore sur ce type d'histoire et ce qu'il risque de rater (ex: clichés, structure, ton).

[Format JSON]
{
  "isCovered": boolean,
  "gaps": [
    {
      "area": "Structure | Ton | Personnages",
      "severity": "high",
      "description": "Explication de la lacune",
      "recommendation": "Comment combler cette lacune (ex: Analyser X films de Tarantino)"
    }
  ],
  "suggestedLearningSources": ["Lien YouTube", "Concept narratif..."]
}
`.trim()

    const result = await this.generateStructured<GapReport>(
      prompt,
      "Tu es le Détecteur d'Ignorance de Vimax. Ta mission est d'être honnête sur les limites du système.",
      { isCovered: false, gaps: [], suggestedLearningSources: [] }
    )

    return result.data
  }
}
