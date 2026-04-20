import { VimaxBaseAgent } from '../core/vimax-base.agent'
import type { LLMService } from '../core/llm.interface'
import type { SagaIntent, SagaPlan, SeriesContext, StyleLock, VimaxRunOptions, VisualAnchorState } from '../types'

// ─────────────────────────────────────────────
// VimaxSagaPlanner
// Étape 0 du pipeline.
// Route l'intent et amplifie une idée brute en script développé.
// Aussi utilisé en mode "motion" pour générer les imagePrompts par scène.
// ─────────────────────────────────────────────

export class VimaxSagaPlanner extends VimaxBaseAgent {
  private styleLock: StyleLock | null = null

  constructor(llm: LLMService) {
    super(llm)
  }

  setStyleLock(lock: StyleLock) {
    this.styleLock = lock
  }

  // ─── Intent Router ─────────────────────────

  private getRouterSystem(): string {
    return `
Tu es un routeur d'intention pour la planification de scripts.
Classifie l'idée de l'utilisateur dans l'une des intentions suivantes :
- narrative : histoire structurée en 3 actes, arcs de personnages, dialogues naturels, profondeur thématique. (Format long/épisodique)
- motion : action pure, véhicules, frappes, vecteurs de vitesse, sans dialogue ni métaphore.
- montage : émotion par juxtaposition visuelle, états internes, rythme progressif.
- viral : contenu court pour réseaux sociaux, humour absurde, objets anthropomorphiques, hook immédiat, cliffhanger. (Format court/réseaux)
- dramatic : action intense, trahisons, plot twists, enjeux élevés, motivations cachées, confrontations psychologiques.

[RÈGLE DE DÉPARTAGE]
En cas d'ambiguïté entre deux catégories (ex: drama vs viral), privilégie celle qui correspond au FORMAT cible (viral = court/social, dramatic = long/épisodique).

[FORMAT]
Réponds UNIQUEMENT avec du JSON valide : { "intent": "narrative" | "motion" | "montage" | "viral" | "dramatic", "rationale": "chaîne de caractères" }
`.trim()
  }

  // ─── Specialized Prompts ───────────────────

  private getSpecializedSystem(intent: SagaIntent | string, bibleContext = ''): string {
    const identDirective =
      '- IDENTIFIANTS PERSONNAGES : Utilise IMPÉRATIVEMENT le format @PascalCase (ex: @Banane, @DetectiveSmith). AUCUN ESPACE, AUCUNE APOSTROPHE.'
    const formatInstruction =
      '[FORMAT]\nRenvoie UNIQUEMENT du JSON valide : { "planned_script": "chaîne de caractères", "episodes": [] }'

    const intentKey = typeof intent === 'string' ? intent : intent.tone || 'narrative'

    return `
[RÔLE : Expert en Planification de Série - Mode ${intentKey.toUpperCase()}]
Tu es un expert chargé de transformer une idée brute en un script structuré et cinématique.

${identDirective}

${formatInstruction}

${bibleContext}
`.trim()
  }

  private getBibleContext(context: SeriesContext): string {
    const b = context.seriesBible
    if (!b || typeof b === 'string') return ''
    return `
      [BIBLE DE LA SÉRIE - SPEC]
      - GENRE : ${b.genre}
      - TON : ${b.tone}
      - STYLE VISUEL : ${b.visualStyle}
      - LOIS DE L'UNIVERS : ${b.universeLaws?.join(', ') || 'Standard'}
    `.trim()
  }

  // ─── Public API ────────────────────────────

  /**
   * Route l'intent et amplifie l'idée en script développé.
   * @param options Optionnel : options de génération (durée, context, etc.)
   */
  async planSaga(basicIdea: string, options: VimaxRunOptions = {}): Promise<SagaPlan> {
    const { targetDuration, maxScenes, targetEpisodeCount } = options

    // 1. Route intent
    const routed = await this.generateStructured<{ intent: SagaIntent }>(
      `<BASIC_IDEA>\n${basicIdea}\n</BASIC_IDEA>\n\nRéponds uniquement en JSON.`,
      this.getRouterSystem(),
      { intent: { tone: 'narrative' } as any }
    )
    const intent = routed.data.intent

    const lengthHint = targetEpisodeCount
      ? `\nCible de longueur : EXACTEMENT ${targetEpisodeCount} épisodes pour permettre un développement narratif profond.`
      : maxScenes
        ? `\nCible de longueur : ${maxScenes} scènes maximum.`
        : targetDuration
          ? `\nCible de durée : ${targetDuration} secondes.`
          : ''

    const bibleContext = this.getBibleContext({ seriesBible: options.seriesContext?.seriesBible })

    const expanded = await this.generateStructured<{ planned_script: string; episodes: any[] }>(
      `<IDÉE_DE_BASE>\n${basicIdea}\n</IDÉE_DE_BASE>\n\nDéveloppe cette idée en un script complet.${lengthHint} Évite les raccourcis narratifs ; prends le temps d'installer les enjeux et les émotions.${targetEpisodeCount ? ` Structure l'histoire en ${targetEpisodeCount} actes bien distincts.` : ''}\n\nRéponds uniquement en JSON.`,
      this.getSpecializedSystem(intent, bibleContext),
      { planned_script: basicIdea, episodes: [] }
    )

    return { intent, script: expanded.data.planned_script, episodes: expanded.data.episodes }
  }

  /**
   * Étend une saga existante en générant une suite cohérente.
   */
  async extendSaga(existingPlan: SagaPlan, additionalCount: number, options: VimaxRunOptions = {}): Promise<SagaPlan> {
    const previousScript =
      typeof existingPlan.intent === 'string' ? existingPlan.script : (existingPlan as any).script || ''

    const previousEpisodes = existingPlan.episodes
      .map((ep, i) => `[ÉPISODE ${ep.episodeNumber}] ${ep.summary || ep.eventDescription}`)
      .join('\n')

    const intent = existingPlan.intent
    const bibleContext = this.getBibleContext({ seriesBible: options.seriesContext?.seriesBible })

    const prompt = `
[MISSION : EXTENSION DE SAGA - PARTIE 2]
Voici le script et le résumé des épisodes précédents d'une saga. 
Ta mission est de générer une SUITE cohérente (Arc 2) de EXACTEMENT ${additionalCount} nouveaux épisodes.

[RAPPEL DU CONTEXTE PRÉCÉDENT]
${previousScript}

[RAPPEL DES ÉPISODES PRÉCÉDENTS]
${previousEpisodes}

Génère un script de suite et le plan des ${additionalCount} nouveaux épisodes. 
Assure-toi que les personnages conservent leurs identifiants @PascalCase et que l'intrigue suit logiquement le cliffhanger ou la situation finale du dernier épisode.

Réponds uniquement en JSON.
`.trim()

    const expanded = await this.generateStructured<{ planned_script: string; episodes: any[] }>(
      prompt,
      this.getSpecializedSystem(intent, bibleContext),
      { planned_script: '', episodes: [] }
    )

    return {
      intent,
      script: expanded.data.planned_script,
      episodes: expanded.data.episodes
    }
  }

  /**
   * Génère un imagePrompt cinématique à partir d'un segment de narration.
   * Utilise un 'anchor' (état visuel de la scène précédente) pour garantir la continuité spatiale et lumineuse.
   */
  async generateImagePrompt(
    narrationSegment: string,
    characterContext = '',
    previousAnchor: VisualAnchorState | string | null = null,
    isClimax = false
  ): Promise<{ imagePrompt: string; visualAnchor: VisualAnchorState }> {
    const anchorData = typeof previousAnchor === 'string' ? previousAnchor : JSON.stringify(previousAnchor, null, 2)

    const anchorSection = previousAnchor
      ? `\n\n[RÉFÉRENCE VISUELLE PRÉCÉDENTE]\n${anchorData}\n\n[DIRECTIVE] Utilise cet état pour maintenir la cohérence de l'ÉCLAIRAGE, de l'AXE CAMÉRA et de la POSITION des personnages. Assure-toi que la nouvelle scène est spatialement cohérente avec la précédente.`
      : ''

    const climaxDirective = isClimax
      ? "\n- IMPACT VISUEL : Ajoute systématiquement un impact physique violent (projection, onde de choc, étincelles, fumée épaisse) car c'est le point culminant."
      : ''

    const styleBlock = this.styleLock
      ? `
[STYLE VISUEL LOCKÉ - OBLIGATOIRE]
- Style : ${this.styleLock.visualStyle}
- Palette : ${this.styleLock.colorPalette.join(', ')}
- Termes interdits : ${this.styleLock.forbiddenTerms.join(', ')}
- Termes requis : ${this.styleLock.mandatoryTerms.join(', ')}
`.trim()
      : ''

    const system = `
[RÔLE : Directeur de la Photographie & Directeur Visuel]
${styleBlock}
- IDENTIFIANTS : Utilise UNIQUEMENT l'identifiant @Nom (ex: @Banane, @Alexandre). Fais correspondre exactement leur profil visuel.
- COMPOSITION : La description DOIT inclure dans une seule phrase fluide : le sujet @Nom au premier plan avec une action précise, les personnages actifs au plan moyen, et l'environnement géographique avec son éclairage en arrière-plan.
- GRAMMAIRE DE LA LUMIÈRE : Interdiction de l'expression "éclairage vif". Utilise : "lumière stroboscopique d'alarme", "lumière rouge intermittente", "ombres dures projetées par le bas", "flash blanc aveuglant".
- CAMÉRA NARRATIVE : Décris l'angle et le mouvement lié à l'intention (ex: plan serré désaxé pour du chaos, contre-plongée pour du pouvoir).${climaxDirective}
- FLASHBACK : Si la narration indique un souvenir ou un reflet du passé, applique un style "FLASHBACK" (lumière surexposée, léger flou, couleurs désaturées).
- CAUSALITÉ : Décris les ACTIONS concrètes qui provoquent le danger (ex: une barre de fer tombe, une étincelle jaillit).
- Techniquement explicite : nomme les positions exactes, les vecteurs, les détails de l'environnement.
- PAS de métaphores. Description visuelle pure.
- LONGUEUR : 2-4 phrases maximum.
- [ISOLATION] IGNORE TOUT ce qui est entre crochets [Action / Émotion]. Ces informations sont gérées à part. Ne décris PAS les expressions faciales ou les gestes mentionnés entre crochets.
- [CONTINUITÉ LUMINEUSE] Assure-toi que l'éclairage et la profondeur de champ sont cohérents avec le contexte global de la série.
- TU DOIS ABSOLUMENT intégrer les trois plans (Premier plan, Second plan, et Arrière-plan) dans une seule phrase fluide, narrative et cinématographique. 
- INTERDICTION d'utiliser des crochets, des deux-points ou des tags rigides (ex: pas de "[FOREGROUND]:").

[FORMAT]
Renvoie UNIQUEMENT du JSON valide : 
{ 
  "imagePrompt": "...", 
  "visualAnchor": {
    "dominantLight": "...",
    "cameraAxis": "...",
    "characterPositions": { "@Nom": "position..." },
    "activeProps": ["prop1", "prop2"]
  }
}
`.trim()

    const characterSection = characterContext
      ? `\n\n[LISTE DES PERSONNAGES]\n${characterContext}\n[/LISTE DES PERSONNAGES]`
      : ''

    const result = await this.generateStructured<{ imagePrompt: string; visualAnchor: VisualAnchorState }>(
      `${anchorSection}\n\n<NARRATION>\n${narrationSegment}\n</NARRATION>${characterSection}\n\nGénère un imagePrompt FLUIDE, RÉALISTE ET CINÉMATOGRAPHIQUE.
Génère la description en une seule phrase narrative couvrant le sujet principal @Nom au premier plan, les éléments secondaires au plan moyen, et l'environnement lumineux avec sa profondeur en arrière-plan.
\nRéponds UNIQUEMENT avec du JSON.`,
      system,
      {
        imagePrompt: narrationSegment,
        visualAnchor: {
          dominantLight: 'neutral',
          cameraAxis: 'standard',
          characterPositions: {},
          activeProps: []
        }
      }
    )

    return result.data
  }
}
