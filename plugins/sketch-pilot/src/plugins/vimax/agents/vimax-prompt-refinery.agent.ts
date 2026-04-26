import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { LearningEpisode, Lesson } from '../types'

/**
 * VimaxPromptRefinery (The Meta-Agent)
 * Analyse les épisodes d'apprentissage pour en extraire des leçons et des patches de prompt.
 */
export class VimaxPromptRefinery extends VimaxBaseAgent {
  public id = 'prompt-refinery'

  private getSystem(theme?: string): string {
    let focusInstructions = ''
    if (theme === 'Narrative') {
      focusInstructions = `
[FOCUS NARRATIF]
- Analyse la structure du plan, les résumés d'épisodes et la fluidité de l'histoire.
- Détecte les arcs brisés, les cliffhangers mal placés ou les summaries trop vagues.
- Produis des directives sur la structure logique et le rythme narratif (!logic).
`
    } else if (theme === 'Visual') {
      focusInstructions = `
[FOCUS VISUEL]
- Analyse la qualité des prompts d'images, des descriptions de personnages et de l'atmosphère.
- Détecte le "drift" stylistique, le manque de détails sensoriels ou les contradictions visuelles.
- Produis des directives sur le style, les éclairages et la persistance physique (!style, !visual).
`
    } else if (theme === 'Cinematic') {
      focusInstructions = `
[FOCUS CINÉMATOGRAPHIQUE]
- Analyse les mouvements de caméra, le jeu d'acteur (acting) et l'animation.
- Détecte les cadrages monotones, les descriptions d'actions physiquement impossibles ou le manque de dynamisme.
- Produis des directives sur la mise en scène et le mouvement (!style).
`
    }

    return `
Tu es le VimaxPromptRefinery, un Meta-Agent expert en ingénierie de prompt et en auto-amélioration.
Ta mission est d'analyser des "épisodes" d'exécution d'autres agents pour synthétiser des directives correctives.

[MÉTHODOLOGIE]
1. IDENTIFICATION : Pourquoi l'agent a-t-il échoué ?
2. RÉSOLUTIONS : Quelle directive simple et directe aurait pu éviter cette erreur ?
3. CONSOLIDATION : Formule une règle d'or concise.

[STYLE DE RÉDACTION - ANTI-CORPORATE]
- Évite le jargon abstrait (ex: "optimiser le flux", "vecteur d'engagement").
- Utilise un langage VISCÉRAL, ACTIONNABLE et CINÉMATOGRAPHIQUE.
- Sois bref et impératif (ex: "Fais trembler la caméra", "Garde un ton staccato", "Interdis toute mention de...").

${focusInstructions}

[FORMAT DE RÉPONSE]
Renvoie UNIQUEMENT du JSON :
{
  "lessons": [
    {
      "directive": "La règle claire à ajouter au prompt",
      "category": "style" | "logic" | "syntax" | "continuity",
      "agentName": "VimaxAgentClassName" | "Global",
      "explanation": "Pourquoi cette règle est nécessaire",
      "tags": ["@Nom", "#Lieu", "action", "etc"] 
    }
  ]
}
`.trim()
  }

  /**
   * Analyse une série d'épisodes en échec pour en extraire des leçons.
   * Generalization : On force l'anonymisation pour le Cerveau Global.
   */
  async refine(episodes: LearningEpisode[], theme?: string): Promise<Partial<Lesson>[]> {
    if (episodes.length === 0) return []

    const failuresContext = episodes
      .map((ep, i) =>
        `
[ÉPISODE ${i + 1}]
Agent: ${ep.agentName}
Aspect: ${theme || 'Général'}
User Prompt: ${ep.userPrompt}
Response: ${ep.response}
Issues: ${ep.evaluation?.issues.join(', ') || 'Inconnu'}
Critique: ${ep.evaluation?.critique || 'N/A'}
`.trim()
      )
      .join('\n\n---\n\n')

    const prompt = `
Voici une liste d'échecs récents rencontrés par nos agents dans l'aspect [${theme || 'Général'}]. 
Analyse-les et extrais des DIRECTIVES ARCHITECTURALES (Prompts Patches) extrêmement précises.

[V4.8 : ARCHITECTURE NARRATIVE]
Ne te contente pas du style (ex: "Show don't tell"). Cherche les PATTERNS DE STRUCTURE.
Exemple : "Dans une scène de Climax de genre Thriller, ne jamais résoudre le conflit avant le tiers final."

[V4.8 : MÉTADONNÉES DE CIBLAGE]
Pour chaque leçon, spécifie :
- applicableAt: 'opening' | 'midpoint' | 'climax' | 'resolution' | 'any'
- strength: 'always' | 'if_tension_high' | 'if_dialogue_scene' | 'if_action_scene'
- genreScope: Liste des genres (ex: ["Thriller", "Action"]) ou ["any"]

[RÈGLE DE GÉNÉRALISATION CRITIQUE]
NE JAMAIS utiliser de noms propres commençant par @ ou de lieux spécifiques # dans la directive finale.
Transforme-les en RÔLES UNIVERSELS.

[Format JSON]
{
  "lessons": [
    {
      "directive": "...",
      "category": "style" | "logic" | "syntax" | "continuity",
      "applicableAt": "any",
      "strength": "always",
      "genreScope": ["any"]
    }
  ]
}

[LEÇONS À EXTRAIRE]
${failuresContext}
`.trim()
    const result = await this.generateStructured<{ lessons: any[] }>(prompt, this.getSystem(theme), { lessons: [] })

    return result.data.lessons.map((l: any) => ({
      ...l,
      agentName: l.agentName || episodes[0]?.agentName || 'Global',
      confidence: 0.8,
      successCount: 0,
      failCount: 0,
      lastUpdated: Date.now()
    }))
  }

  /**
   * Consolide un ensemble de leçons pour éviter les doublons et le bloat.
   * Semantic De-duplication & Anonymization.
   */
  async consolidate(lessons: Lesson[]): Promise<Lesson[]> {
    if (lessons.length === 0) return []
    if (lessons.length <= 1) return lessons

    const prompt = `
[MISSION : DÉDOUBLONNAGE SÉMANTIQUE & CINÉMATISATION]
Voici une liste de leçons apprises. Ton but est de :
1. Fusionner les leçons sémantiquement identiques ou très proches.
2. Élaguer le jargon "corporate" pour rendre les directives plus VISCÉRALES.
3. [GÉNÉRALISATION] : Remplace tout nom propre (@Nom) par un rôle universel.

[LEÇONS ACTUELLES]
${lessons.map((l) => `- [${l.category}] ${l.directive} (Agent: ${l.agentName})`).join('\n')}

Renvoie UNIQUEMENT le set minimal de leçons consolidées au format JSON { "lessons": [...] }.
`.trim()

    const result = await this.generateStructured<{ lessons: any[] }>(prompt, this.getSystem(), { lessons: [] })

    return result.data.lessons.map((l: any, i: number) => ({
      id: `lesson-cons-${Date.now()}-${i}`,
      agentName: l.agentName || lessons[0]?.agentName || 'Global',
      ...l,
      confidence: 1,
      successCount: 0,
      failCount: 0,
      lastUpdated: Date.now()
    }))
  }

  /**
   * Re-joue un épisode avec un nouveau patch de prompt pour tester son efficacité.
   * Hardened Version : Vérifie sémantiquement si le défaut a disparu.
   */
  async shadowTest(episode: LearningEpisode, patch: string): Promise<boolean> {
    const enrichedSystem = `${episode.systemPrompt}\n\n[SHADOW_TEST_PATCH]\n${patch}`

    try {
      if (process.env.DEBUG_LLM) {
        console.log(`[ShadowTest] Re-jeu de l'épisode ${episode.id} avec patch...`)
      }

      const raw = await this.llm.generateContent(episode.userPrompt, enrichedSystem, 'application/json')

      // 1. Validation syntaxique
      try {
        JSON.parse(raw)
      } catch {
        return false // Échec syntaxique persistant
      }

      // 2. [V3] Validation sémantique croisée
      const validatorPrompt = `
[MISSION : VALIDATION DE CORRECTIF]
Tu reçois un feedback d'erreur d'origine et une nouvelle réponse générée après application d'un patch de prompt.
Ton but est de vérifier si le défaut identifié a été RÉSOLU.

[DÉFAUT D'ORIGINE]
${episode.evaluation?.critique || 'Inconnu'}

[NOUVEAU CONTENU GÉNÉRÉ]
${raw}

Réponds UNIQUEMENT par : { "resolved": true } ou { "resolved": false }
`.trim()

      const validationRaw = await this.llm.generateContent(validatorPrompt, 'Tu es un auditeur de qualité sémantique.')
      const validation = this.parseJSONSafe<{ resolved: boolean }>(validationRaw, { resolved: false })

      return validation.resolved
    } catch (error) {
      console.error(`[ShadowTest] Erreur lors du re-jeu :`, error)
      return false
    }
  }

  /**
   * Consolidation thématique pour gérer la masse (10 000+ feedbacks).
   * Autonomous Anonymization : Transforme les identités spécifiques en principes universels.
   * V4 : Identification des principes transverses (Universal Leap).
   */
  async thematicConsolidate(lessons: Lesson[], contextAgent?: string): Promise<Lesson[]> {
    if (lessons.length === 0) return []

    const prompt = `
[MISSION : CONSOLIDATION THÉMATIQUE & UNIFICATION]
Tu renais une liste de ${lessons.length} leçons${contextAgent ? ` pour l'agent [${contextAgent}]` : ''}.
Ton but est de distiller ces retours en un set optimal de DIRECTIVES DE FER (max 30).

[V4 : IDENTITÉ & DNA - CRITIQUE]
1. NE JAMAIS anonymiser les identifiants commençant par @ (personnages) ou # (lieux). 
   Exemple : Garde "@Alexandre a une cicatrice", ne transforme pas en "Le personnage a une cicatrice".
2. Si une règle contient un identifiant spécifique, elle est considérée comme "Saga-Specifique".

[V4 : CRITÈRE D'UNIVERSALITÉ]
Si une leçon semble s'appliquer à TOUT le pipeline narratif (pas juste à un agent spécifique) ET ne contient aucun identifiant spécifique (@, #), marque-la comme "isUniversal": true.
Exemple : "Ne jamais utiliser d'adverbes en -ment" est UNIVERSEL.

[V4.8 : CIBLAGE]
Conserve les métadonnées de ciblage si elles sont cohérentes pour le groupe :
- "applicableAt": moment précis ou "any"
- "strength": condition d'activation
- "genreScope": Liste des genres couverts

[Format JSON]
{
  "consolidated": [
    {
      "directive": "...",
      "category": "...",
      "isUniversal": boolean,
      "applicableAt": "...",
      "strength": "...",
      "genreScope": ["..."],
      "explanation": "Pourquoi c'est un principe universel ?"
    }
  ]
}
`.trim()

    const result = await this.generateStructured<{ consolidated: any[] }>(prompt, this.getSystem(), {
      consolidated: []
    })

    return result.data.consolidated.map((c, i) => {
      const firstRelevantLesson = lessons.find((l) => l.seriesId)
      return {
        ...c,
        id: `trend-${Date.now()}-${i}`,
        agentName: c.isUniversal ? 'Global' : contextAgent || lessons[0]?.agentName || 'Global',
        seriesId: c.isUniversal ? undefined : firstRelevantLesson?.seriesId,
        applicableAt: c.applicableAt || 'any',
        strength: c.strength || 'always',
        genreScope: c.genreScope || ['any'],
        successCount: 1,
        failCount: 0,
        lastUpdated: Date.now()
      }
    })
  }
}
