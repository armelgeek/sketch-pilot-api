import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { LearningEpisode, Lesson } from '../types'

/**
 * VimaxPromptRefinery (The Meta-Agent)
 * Analyse les épisodes d'apprentissage pour en extraire des leçons et des patches de prompt.
 */
export class VimaxPromptRefinery extends VimaxBaseAgent {
  private getSystem(): string {
    return `
Tu es le VimaxPromptRefinery, un Meta-Agent expert en ingénierie de prompt et en auto-amélioration.
Ta mission est d'analyser des "épisodes" d'exécution d'autres agents (ce qu'ils ont reçu, ce qu'ils ont répondu, et pourquoi ça a échoué) pour synthétiser des directives correctives.

[MÉTHODOLOGIE]
1. IDENTIFICATION : Pourquoi l'agent a-t-il échoué ? (Confusion de personnage, format JSON invalide, répétition, ton inapproprié).
2. RÉSOLUTIONS : Quelle directive simple et directe aurait pu éviter cette erreur ?
3. CONSOLIDATION : Formule une règle d'or concise.

[FORMAT DE RÉPONSE]
Renvoie UNIQUEMENT du JSON :
{
  "lessons": [
    {
      "directive": "La règle claire à ajouter au prompt",
      "category": "style" | "logic" | "syntax" | "continuity",
      "explanation": "Pourquoi cette règle est nécessaire"
    }
  ]
}
`.trim()
  }

  /**
   * Analyse une série d'épisodes en échec pour en extraire des leçons.
   */
  async refine(episodes: LearningEpisode[]): Promise<Partial<Lesson>[]> {
    if (episodes.length === 0) return []

    const failuresContext = episodes
      .map((ep, i) =>
        `
[ÉPISODE ${i + 1}]
Agent: ${ep.agentName}
User Prompt: ${ep.userPrompt}
Response: ${ep.response}
Issues: ${ep.evaluation?.issues.join(', ') || 'Inconnu'}
Critique: ${ep.evaluation?.critique || 'N/A'}
`.trim()
      )
      .join('\n\n---\n\n')

    const prompt = `
Voici une liste d'échecs récents rencontrés par nos agents. 
Analyse-les et propose des directives correctives (Prompts Patches) pour améliorer leurs futurs résultats.

${failuresContext}
`.trim()
    const result = await this.generateStructured<{ lessons: any[] }>(prompt, this.getSystem(), { lessons: [] })

    return result.data.lessons.map((l: any) => ({
      ...l,
      confidence: 0.8,
      successCount: 0,
      failCount: 0,
      lastUpdated: Date.now()
    }))
  }

  /**
   * Consolide un ensemble de leçons pour éviter les doublons et le bloat.
   */
  async consolidate(lessons: Lesson[]): Promise<Lesson[]> {
    if (lessons.length <= 3) return lessons

    const prompt = `
CONSOLIDATION & ANTI-BLOAT.
Voici une liste de leçons apprises. Fusionne les doublons, résous les contradictions et simplifie les directives pour garder un prompt léger.

[LEÇONS ACTUELLES]
${lessons.map((l) => `- [${l.category}] ${l.directive}`).join('\n')}

Renvoie le set minimal de leçons consolidées (JSON).
`.trim()

    const result = await this.generateStructured<{ lessons: any[] }>(prompt, this.getSystem(), { lessons: [] })

    return result.data.lessons.map((l: any, i: number) => ({
      id: `lesson-cons-${Date.now()}-${i}`,
      agentName: lessons[0]?.agentName || 'Global',
      ...l,
      confidence: 1,
      successCount: 0,
      failCount: 0,
      lastUpdated: Date.now()
    }))
  }

  /**
   * Re-joue un épisode avec un nouveau patch de prompt pour tester son efficacité.
   */
  async shadowTest(episode: LearningEpisode, patch: string): Promise<boolean> {
    const enrichedSystem = `${episode.systemPrompt}\n\n[SHADOW_TEST_PATCH]\n${patch}`

    try {
      if (process.env.DEBUG_LLM) {
        console.log(`[ShadowTest] Re-jeu de l'épisode ${episode.id} avec patch...`)
      }

      // On re-génère avec le patch
      const raw = await this.llm.generateContent(episode.userPrompt, enrichedSystem, 'application/json')

      // Evaluation simple de la validité du format (Tester syntaxique)
      try {
        JSON.parse(raw)
        return true // Le format est valide avec le patch
      } catch {
        return false // Échec persistant même avec le patch
      }
    } catch (error) {
      console.error(`[ShadowTest] Erreur lors du re-jeu :`, error)
      return false
    }
  }

  /**
   * Consolidation thématique pour gérer la masse (10 000+ feedbacks).
   * Regroupe les leçons/critiques par thèmes et distille une "Méga-Leçon".
   */
  async thematicConsolidate(lessons: Lesson[]): Promise<Lesson[]> {
    if (lessons.length === 0) return []

    const prompt = `
[MISSION : CONSOLIDATION THÉMATIQUE DE MASSE]
Tu reçois une liste de ${lessons.length} leçons ou feedbacks.
Ton but est de détecter les TENDANCES LOURDES et de les fusionner en un petit nombre de règles de fer (max 5).

[MÉTHODE]
1. CLUSTERING : Regroupe les leçons par thématique (ex: Rigueur JSON, Rythme, Physique, Dialogue).
2. DARWINISME : Si 80% des feedbacks pointent le même défaut, crée une "Méga-Leçon" prioritaire.
3. ÉLAGAGE : Supprime les leçons isolées ou contradictoires avec la tendance de masse.

[LEÇONS À CONSOLIDER]
${lessons.map((l) => `- [${l.category}] ${l.directive} (Confidence: ${l.confidence})`).join('\n')}

Renvoie du JSON : { "consolidated": [{ "directive": "...", "category": "...", "confidence": 1.0 }] }
`.trim()

    const result = await this.generateStructured<{ consolidated: any[] }>(prompt, this.getSystem(), {
      consolidated: []
    })

    return result.data.consolidated.map((c, i) => ({
      ...c,
      id: `trend-${Date.now()}-${i}`,
      agentName: lessons[0]?.agentName || 'Global',
      successCount: 1,
      failCount: 0,
      lastUpdated: Date.now()
    }))
  }
}
